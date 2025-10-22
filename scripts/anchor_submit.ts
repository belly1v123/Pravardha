/**
 * Anchor Submit Script
 * 
 * Submits a 15-minute aggregate window to Solana devnet
 * Requires: Merkle root already computed in Supabase
 * 
 * Usage: npx tsx anchor_submit.ts --device-id <uuid> --window-start <iso-date>
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import BN from 'bn.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: '../.env' });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || `${process.env.HOME}/.config/solana/id.json`;
const PROGRAM_ID = new PublicKey(process.env.PRAVARDHA_PROGRAM_ID || 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing Supabase credentials in .env');
    process.exit(1);
}

async function main() {
    const args = process.argv.slice(2);
    const deviceIdIndex = args.indexOf('--device-id');
    const windowStartIndex = args.indexOf('--window-start');

    if (deviceIdIndex === -1 || windowStartIndex === -1) {
        console.error('❌ Missing required arguments');
        console.log('Usage: npx tsx anchor_submit.ts --device-id <uuid> --window-start <iso-date>');
        process.exit(1);
    }

    const deviceId = args[deviceIdIndex + 1];
    const windowStart = args[windowStartIndex + 1];

    console.log('🚀 Anchoring aggregate to Solana...\n');

    // Initialize Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch aggregate
    const { data: aggregate, error } = await supabase
        .from('aggregates_15m')
        .select('*')
        .eq('device_id', deviceId)
        .eq('window_start', windowStart)
        .single();

    if (error || !aggregate) {
        console.error('❌ Aggregate not found:', error);
        process.exit(1);
    }

    if (!aggregate.merkle_root_hex) {
        console.error('❌ Merkle root not computed. Run compute_merkle_and_anchor.ts first.');
        process.exit(1);
    }

    console.log('📊 Aggregate found:');
    console.log(`   Window: ${aggregate.window_start}`);
    console.log(`   Samples: ${aggregate.sample_count}`);
    console.log(`   Merkle root: ${aggregate.merkle_root_hex}\n`);

    // Initialize Solana connection
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const keypairPath = process.env.SOLANA_KEYPAIR || join(homedir(), '.config', 'solana', 'id.json');
    const keypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf-8')))
    );

    // Create a simple wallet wrapper
    const wallet: Wallet = {
        publicKey: keypair.publicKey,
        signTransaction: async (tx) => {
            if ('partialSign' in tx) {
                tx.partialSign(keypair);
            }
            return tx;
        },
        signAllTransactions: async (txs) => {
            return txs.map(tx => {
                if ('partialSign' in tx) {
                    tx.partialSign(keypair);
                }
                return tx;
            });
        },
        payer: keypair,
    };

    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

    console.log('🔗 Connected to Solana devnet');
    console.log(`   Wallet: ${wallet.publicKey.toBase58()}\n`);

    // Load the IDL first (need it for program.programId)
    const idlPath = join(__dirname, '../chain/target/idl/pravardha.json');
    let idl;
    try {
        idl = JSON.parse(readFileSync(idlPath, 'utf-8'));
    } catch (e) {
        console.error('❌ Failed to load IDL. Make sure you ran "anchor build" first.');
        console.error('   IDL path:', idlPath);
        throw e;
    }

    const program = new Program(idl, provider);

    // For hackathon demo: use wallet pubkey as device pubkey (simplified)
    // In production: each device would have its own ed25519 keypair
    const devicePubkey = wallet.publicKey;

    // Derive PDAs using program.programId (same as register_device.ts)
    const [devicePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('device'), devicePubkey.toBuffer()],
        program.programId
    );

    const windowStartBytes = Buffer.alloc(8);
    windowStartBytes.writeBigInt64LE(BigInt(new Date(aggregate.window_start).getTime() / 1000));

    const [aggregatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('aggregate'), devicePda.toBuffer(), windowStartBytes],
        program.programId
    );

    console.log('📍 PDAs:');
    console.log(`   Device: ${devicePda.toBase58()}`);
    console.log(`   Aggregate: ${aggregatePda.toBase58()}\n`);

    // Check if device is registered
    let deviceAccount;
    try {
        deviceAccount = await connection.getAccountInfo(devicePda);
    } catch (e) {
        console.log('ℹ️ Device not registered on-chain, registering...');
        // For hackathon: register device if not exists
        // In production: separate registration step
        const calibrationHash = Buffer.alloc(32); // Placeholder
        // Note: This requires the Anchor program IDL and proper Program instance
        // Simplified for demo
        console.log('⚠️  Device registration requires manual step (see chain/README.md)');
    }

    // Convert Merkle root hex to bytes (must be exactly 32 bytes)
    const merkleRootHex = aggregate.merkle_root_hex;
    const merkleRootBytes = Buffer.from(merkleRootHex, 'hex');
    if (merkleRootBytes.length !== 32) {
        throw new Error(`Merkle root must be 32 bytes, got ${merkleRootBytes.length}`);
    }

    // Prepare stats (ensure all are numbers)
    const stats = {
        tempMin: Number(aggregate.temp_min) || 0,
        tempMax: Number(aggregate.temp_max) || 0,
        tempAvg: Number(aggregate.temp_avg) || 0,
        humidityMin: Number(aggregate.humidity_min) || 0,
        humidityMax: Number(aggregate.humidity_max) || 0,
        humidityAvg: Number(aggregate.humidity_avg) || 0,
        pressureMin: Number(aggregate.pressure_min) || 0,
        pressureMax: Number(aggregate.pressure_max) || 0,
        pressureAvg: Number(aggregate.pressure_avg) || 0,
    };

    const offchainUri = aggregate.offchain_uri || '';
    if (offchainUri.length > 200) {
        throw new Error('Offchain URI too long (max 200 characters)');
    }

    console.log('📤 Submitting aggregate to Solana...');

    // Call the actual Anchor program (program already loaded above)
    const tx = await program.methods
        .submitAggregate(
            new BN(Math.floor(new Date(aggregate.window_start).getTime() / 1000)),
            stats,
            aggregate.sample_count,
            Array.from(merkleRootBytes),
            offchainUri
        )
        .accounts({
            device: devicePda,
            windowAggregate: aggregatePda,
            authority: wallet.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    const txSignature = tx;

    console.log('✅ Aggregate submitted to Solana!');
    console.log(`   Transaction: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);
    console.log(`   PDA: ${aggregatePda.toBase58()}\n`);

    // Update Supabase with anchor info
    const { error: updateError } = await supabase
        .from('aggregates_15m')
        .update({
            is_anchored: true,
            anchor_tx_signature: txSignature,
            anchor_pda: aggregatePda.toBase58(),
            anchored_at: new Date().toISOString(),
        })
        .eq('id', aggregate.id);

    if (updateError) {
        console.error('❌ Failed to update Supabase:', updateError);
    } else {
        console.log('✅ Supabase updated with anchor info\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Anchoring complete!');
    console.log('   View certificate: http://localhost:5173/verify/<batch-id>');
    console.log('');
}

main().catch(console.error);
