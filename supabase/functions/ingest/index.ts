/**
 * Pravardha Ingest Edge Function
 * 
 * Receives sensor data from IoT devices via HTTPS POST
 * Validates device authentication (pre-shared key)
 * Inserts readings into Supabase database
 * 
 * Phase 1: Simple key-based auth (SHA-256 hash)
 * Future: ed25519 signature verification
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// CORS headers for browser testing
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id, x-device-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Hash a string using SHA-256
 */
async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate device authentication
 */
async function validateDevice(
    supabase: any,
    deviceId: string,
    deviceKey: string
): Promise<{ valid: boolean; error?: string }> {
    // Hash the provided key
    const keyHash = await sha256(deviceKey);

    // Query device_keys table
    const { data, error } = await supabase
        .from("device_keys")
        .select("id, device_id, is_active, expires_at")
        .eq("device_id", deviceId)
        .eq("key_hash", keyHash)
        .eq("is_active", true)
        .single();

    if (error || !data) {
        return { valid: false, error: "Invalid device credentials" };
    }

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return { valid: false, error: "Device key expired" };
    }

    // Update last_used_at
    await supabase
        .from("device_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id);

    return { valid: true };
}

/**
 * Validate and sanitize sensor data
 */
function validateSensorData(data: any): { valid: boolean; error?: string; sanitized?: any } {
    const { ts_ms, temperature, humidity, pressure, mq135_adc } = data;

    // Check required fields
    if (temperature === undefined && humidity === undefined && pressure === undefined && mq135_adc === undefined) {
        return { valid: false, error: "At least one sensor value required" };
    }

    // Validate ranges
    if (temperature !== undefined && (temperature < -50 || temperature > 100)) {
        return { valid: false, error: "Temperature out of range (-50 to 100°C)" };
    }

    if (humidity !== undefined && (humidity < 0 || humidity > 100)) {
        return { valid: false, error: "Humidity out of range (0 to 100%)" };
    }

    if (pressure !== undefined && (pressure < 800 || pressure > 1200)) {
        return { valid: false, error: "Pressure out of range (800 to 1200 hPa)" };
    }

    if (mq135_adc !== undefined && (mq135_adc < 0 || mq135_adc > 4095)) {
        return { valid: false, error: "MQ135 ADC out of range (0 to 4095)" };
    }

    // Parse timestamp
    let ts_device = null;
    if (ts_ms) {
        const tsDate = new Date(ts_ms);

        // Accept timestamps within +/- 1 hour of server time (clock drift tolerance)
        const now = Date.now();
        const diff = Math.abs(now - ts_ms);
        if (diff > 3600000) { // 1 hour in ms
            console.warn(`Clock drift detected: ${diff / 1000}s. Using server time.`);
        } else {
            ts_device = tsDate.toISOString();
        }
    }

    return {
        valid: true,
        sanitized: {
            ts_device,
            temperature: temperature !== undefined ? parseFloat(temperature) : null,
            humidity: humidity !== undefined ? parseFloat(humidity) : null,
            pressure: pressure !== undefined ? parseFloat(pressure) : null,
            mq135_adc: mq135_adc !== undefined ? parseInt(mq135_adc) : null,
        },
    };
}

/**
 * Main handler
 */
serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Only allow POST
    if (req.method !== "POST") {
        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    try {
        // Get device credentials from headers
        const deviceId = req.headers.get("x-device-id");
        const deviceKey = req.headers.get("x-device-key");

        if (!deviceId || !deviceKey) {
            return new Response(
                JSON.stringify({ error: "Missing x-device-id or x-device-key header" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Parse request body
        const body = await req.json();

        // Initialize Supabase client with service role
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Validate device authentication
        const authResult = await validateDevice(supabase, deviceId, deviceKey);
        if (!authResult.valid) {
            return new Response(
                JSON.stringify({ error: authResult.error }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Validate sensor data
        const dataResult = validateSensorData(body);
        if (!dataResult.valid) {
            return new Response(
                JSON.stringify({ error: dataResult.error }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Insert reading via stored procedure
        const { data: readingData, error: readingError } = await supabase.rpc(
            "insert_reading",
            {
                p_device_id: deviceId,
                p_ts_device: dataResult.sanitized.ts_device,
                p_temperature: dataResult.sanitized.temperature,
                p_humidity: dataResult.sanitized.humidity,
                p_pressure: dataResult.sanitized.pressure,
                p_mq135_adc: dataResult.sanitized.mq135_adc,
                p_metadata: body.metadata || {},
            }
        );

        if (readingError) {
            console.error("Database error:", readingError);
            return new Response(
                JSON.stringify({ error: "Failed to insert reading", details: readingError.message }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Success response
        return new Response(
            JSON.stringify({
                ok: true,
                reading_id: readingData,
                ts_server: new Date().toISOString(),
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Unexpected error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error", details: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
