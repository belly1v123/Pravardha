/**
 * Compute Merkle Root and Prepare for Anchoring
 * 
 * Computes Merkle root of raw readings within a 15-minute window
 * Updates aggregates_15m table with merkle_root_hex
 * 
 * Usage: npx tsx compute_merkle_and_anchor.ts --device-id <uuid> [--window-start <iso-date>]
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
}

/**
 * Hash a string with SHA-256
 */
function sha256(data: string): string {
    return createHash("sha256").update(data).digest("hex");
}

/**
 * Compute Merkle root from a list of hashes
 * Simple implementation for hackathon (not production-grade)
 */
function computeMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return "";
    if (hashes.length === 1) return hashes[0];

    // Pad to power of 2
    while (hashes.length & (hashes.length - 1)) {
        hashes.push(hashes[hashes.length - 1]);
    }

    // Build tree bottom-up
    let layer = hashes;
    while (layer.length > 1) {
        const nextLayer: string[] = [];
        for (let i = 0; i < layer.length; i += 2) {
            const combined = layer[i] + layer[i + 1];
            nextLayer.push(sha256(combined));
        }
        layer = nextLayer;
    }

    return layer[0];
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);

    const deviceIdIndex = args.indexOf("--device-id");
    const windowStartIndex = args.indexOf("--window-start");

    if (deviceIdIndex === -1) {
        console.error("❌ Missing --device-id argument");
        console.log("Usage: npx tsx compute_merkle_and_anchor.ts --device-id <uuid> [--window-start <iso-date>]");
        process.exit(1);
    }

    const deviceId = args[deviceIdIndex + 1];
    const windowStartStr = windowStartIndex !== -1 ? args[windowStartIndex + 1] : null;

    console.log("🌳 Computing Merkle root for aggregate window...\n");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get aggregate window (latest if not specified)
    let aggregate;
    if (windowStartStr) {
        const { data, error } = await supabase
            .from("aggregates_15m")
            .select("*")
            .eq("device_id", deviceId)
            .eq("window_start", windowStartStr)
            .single();

        if (error || !data) {
            console.error("❌ Aggregate not found:", error);
            process.exit(1);
        }
        aggregate = data;
    } else {
        const { data, error } = await supabase
            .from("aggregates_15m")
            .select("*")
            .eq("device_id", deviceId)
            .order("window_start", { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            console.error("❌ No aggregates found for device:", error);
            process.exit(1);
        }
        aggregate = data;
    }

    console.log("📊 Aggregate found:");
    console.log(`   Window: ${aggregate.window_start} - ${aggregate.window_end}`);
    console.log(`   Samples: ${aggregate.sample_count}\n`);

    // Fetch all readings in this window
    const { data: readings, error: readingsError } = await supabase
        .from("readings")
        .select("id, ts_server, temperature, humidity, pressure, mq135_adc")
        .eq("device_id", deviceId)
        .gte("ts_server", aggregate.window_start)
        .lt("ts_server", aggregate.window_end)
        .order("ts_server", { ascending: true });

    if (readingsError || !readings) {
        console.error("❌ Failed to fetch readings:", readingsError);
        process.exit(1);
    }

    console.log(`📋 Fetched ${readings.length} readings\n`);

    // Create deterministic hashes for each reading
    const hashes = readings.map((r) => {
        // Stable serialization: id + timestamp + sensor values
        const data = `${r.id}|${r.ts_server}|${r.temperature}|${r.humidity}|${r.pressure}|${r.mq135_adc}`;
        return sha256(data);
    });

    // Compute Merkle root
    const merkleRoot = computeMerkleRoot(hashes);

    console.log("🌲 Merkle root computed:");
    console.log(`   Root: ${merkleRoot}\n`);

    // Update aggregate with Merkle root
    const { error: updateError } = await supabase
        .from("aggregates_15m")
        .update({
            merkle_root_hex: merkleRoot,
            // offchain_uri: future Arweave/Shadow Drive upload
        })
        .eq("id", aggregate.id);

    if (updateError) {
        console.error("❌ Failed to update aggregate:", updateError);
        process.exit(1);
    }

    console.log("✅ Aggregate updated with Merkle root\n");

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📝 Next steps:");
    console.log("  1. Run anchor_submit.ts to anchor this window on Solana");
    console.log(`     npx tsx anchor_submit.ts --device-id ${deviceId} --window-start "${aggregate.window_start}"`);
    console.log("  2. Verify on public certificate page");
    console.log("");
}

main().catch(console.error);
