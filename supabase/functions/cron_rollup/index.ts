/**
 * Pravardha Cron Rollup Edge Function
 * 
 * Runs every 15 minutes to compute aggregates for all active devices
 * Calls compute_15m_aggregate() for the previous 15-minute window
 * 
 * Trigger: Supabase Cron (*/15 * * * *)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

/**
 * Round timestamp down to nearest 15-minute boundary
 */
function roundToWindow(date: Date): Date {
    const minutes = date.getMinutes();
    const roundedMinutes = Math.floor(minutes / 15) * 15;
    const rounded = new Date(date);
    rounded.setMinutes(roundedMinutes);
    rounded.setSeconds(0);
    rounded.setMilliseconds(0);
    return rounded;
}

/**
 * Get the previous 15-minute window
 */
function getPreviousWindow(): { start: Date; end: Date } {
    const now = new Date();
    const currentWindowStart = roundToWindow(now);
    const previousWindowStart = new Date(currentWindowStart.getTime() - 15 * 60 * 1000);
    const previousWindowEnd = currentWindowStart;

    return {
        start: previousWindowStart,
        end: previousWindowEnd,
    };
}

/**
 * Main handler
 */
serve(async (req: Request) => {
    console.log("🔄 Cron rollup started");

    try {
        // Initialize Supabase client with service role
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Get previous 15-minute window
        const window = getPreviousWindow();
        console.log(`⏰ Computing aggregates for window: ${window.start.toISOString()} - ${window.end.toISOString()}`);

        // Get all active devices
        const { data: devices, error: devicesError } = await supabase
            .from("devices")
            .select("id, name")
            .eq("is_active", true);

        if (devicesError) {
            console.error("❌ Failed to fetch devices:", devicesError);
            return new Response(
                JSON.stringify({ error: "Failed to fetch devices", details: devicesError.message }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        if (!devices || devices.length === 0) {
            console.log("ℹ️ No active devices found");
            return new Response(
                JSON.stringify({ ok: true, message: "No active devices", aggregates_computed: 0 }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        console.log(`📊 Processing ${devices.length} devices`);

        // Compute aggregate for each device
        const results = [];
        for (const device of devices) {
            try {
                // Check if there are readings in this window
                const { count, error: countError } = await supabase
                    .from("readings")
                    .select("id", { count: "exact", head: true })
                    .eq("device_id", device.id)
                    .gte("ts_server", window.start.toISOString())
                    .lt("ts_server", window.end.toISOString());

                if (countError) {
                    console.error(`❌ Error checking readings for device ${device.name}:`, countError);
                    results.push({ device_id: device.id, device_name: device.name, status: "error", error: countError.message });
                    continue;
                }

                if (count === 0) {
                    console.log(`⏭️ No readings for device ${device.name} in window, skipping`);
                    results.push({ device_id: device.id, device_name: device.name, status: "skipped", reason: "no_readings" });
                    continue;
                }

                // Compute aggregate
                const { data: aggregateId, error: aggregateError } = await supabase.rpc(
                    "compute_15m_aggregate",
                    {
                        p_device_id: device.id,
                        p_window_start: window.start.toISOString(),
                    }
                );

                if (aggregateError) {
                    console.error(`❌ Failed to compute aggregate for device ${device.name}:`, aggregateError);
                    results.push({ device_id: device.id, device_name: device.name, status: "error", error: aggregateError.message });
                    continue;
                }

                console.log(`✅ Computed aggregate for device ${device.name} (${count} samples)`);
                results.push({
                    device_id: device.id,
                    device_name: device.name,
                    status: "success",
                    aggregate_id: aggregateId,
                    sample_count: count,
                });
            } catch (error) {
                console.error(`❌ Unexpected error processing device ${device.name}:`, error);
                results.push({ device_id: device.id, device_name: device.name, status: "error", error: error.message });
            }
        }

        const successCount = results.filter((r) => r.status === "success").length;
        const errorCount = results.filter((r) => r.status === "error").length;
        const skippedCount = results.filter((r) => r.status === "skipped").length;

        console.log(`✓ Rollup complete: ${successCount} success, ${errorCount} errors, ${skippedCount} skipped`);

        return new Response(
            JSON.stringify({
                ok: true,
                window: {
                    start: window.start.toISOString(),
                    end: window.end.toISOString(),
                },
                devices_processed: devices.length,
                aggregates_computed: successCount,
                errors: errorCount,
                skipped: skippedCount,
                results,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("❌ Unexpected error in cron rollup:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error", details: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});
