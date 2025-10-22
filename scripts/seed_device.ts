/**
 * Seed Device Script
 * 
 * Creates a new device in Supabase and generates authentication credentials
 * Usage: npx tsx seed_device.ts [--name "Device Name"]
 */

import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: "../.env" });

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
}

/**
 * Generate a secure random device key
 */
function generateDeviceKey(): string {
    return randomBytes(32).toString("hex");
}

/**
 * Hash a device key using SHA-256
 */
function hashKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    const nameIndex = args.indexOf("--name");
    const deviceName = nameIndex !== -1 ? args[nameIndex + 1] : `ESP32-${Date.now()}`;

    console.log("🌱 Seeding new device...\n");

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Generate device key
    const deviceKey = generateDeviceKey();
    const deviceKeyHash = hashKey(deviceKey);

    console.log("1️⃣ Generated device credentials");
    console.log(`   Key: ${deviceKey}`);
    console.log(`   Hash: ${deviceKeyHash}\n`);

    // Insert device
    const { data: device, error: deviceError } = await supabase
        .from("devices")
        .insert({
            name: deviceName,
            device_type: "esp32",
            location: "Indoor Farm - Bay 1",
            is_active: true,
        })
        .select()
        .single();

    if (deviceError) {
        console.error("❌ Failed to create device:", deviceError);
        process.exit(1);
    }

    console.log("2️⃣ Device created in database");
    console.log(`   ID: ${device.id}`);
    console.log(`   Name: ${device.name}\n`);

    // Insert device key
    const { error: keyError } = await supabase.from("device_keys").insert({
        device_id: device.id,
        key_hash: deviceKeyHash,
        key_name: "primary",
        is_active: true,
    });

    if (keyError) {
        console.error("❌ Failed to create device key:", keyError);
        process.exit(1);
    }

    console.log("3️⃣ Device key stored (hashed)\n");

    // Print configuration for firmware
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Device created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("📋 Copy these values to your ESP32 firmware:\n");
    console.log("─────────────────────────────────────────────────────");
    console.log(`#define DEVICE_ID "${device.id}"`);
    console.log(`#define DEVICE_KEY "${deviceKey}"`);
    console.log("─────────────────────────────────────────────────────\n");

    console.log("🧪 Test with curl:\n");
    console.log(`curl -X POST ${SUPABASE_URL}/functions/v1/ingest \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -H "x-device-id: ${device.id}" \\`);
    console.log(`  -H "x-device-key: ${deviceKey}" \\`);
    console.log(`  -d '{"temperature": 23.5, "humidity": 65.0, "pressure": 1013.25, "mq135_adc": 2048}'`);
    console.log("");

    console.log("📝 Next steps:");
    console.log("  1. Update firmware/pravardha_esp32.ino with DEVICE_ID and DEVICE_KEY");
    console.log("  2. Flash firmware to ESP32");
    console.log("  3. Monitor Serial output (115200 baud)");
    console.log("  4. Check Supabase dashboard for readings\n");
}

main().catch(console.error);
