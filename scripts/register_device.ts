/**
 * Register Device Script
 * 
 * Registers a device on-chain before submitting aggregates
 * 
 * Usage: npx tsx register_device.ts
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: '../.env' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.PRAVARDHA_PROGRAM_ID!);

async function main() {
    console.log('🔧 Registering device on Solana...\n');

    // Initialize Solana connection
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const keypairPath = process.env.SOLANA_KEYPAIR || join(homedir(), '.config', 'solana', 'id.json');
    const keypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf-8')))
    );

    // Create wallet
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

    // For demo: use wallet pubkey as device pubkey
    const devicePubkey = wallet.publicKey;

    console.log('📍 Device Pubkey:', devicePubkey.toBase58(), '\n');

    // Load IDL
    const idlPath = join(__dirname, '../chain/target/idl/pravardha.json');
    const idl = JSON.parse(readFileSync(idlPath, 'utf-8'));
    const program = new Program(idl, provider);

    // Derive device PDA using the same seeds as the program
    const [devicePda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('device'), devicePubkey.toBuffer()],
        program.programId
    );

    console.log('📍 Device PDA:', devicePda.toBase58());
    console.log('   Bump:', bump, '\n');

    // Check if device is already registered
    const deviceAccount = await connection.getAccountInfo(devicePda);
    if (deviceAccount) {
        console.log('✅ Device already registered!');
        console.log('   PDA:', devicePda.toBase58());
        return;
    }

    // Register device
    console.log('📝 Registering device...');

    const calibrationHash = Buffer.alloc(32); // Placeholder for demo

    const tx = await program.methods
        .registerDevice(devicePubkey, Array.from(calibrationHash))
        .accounts({
            device: devicePda,
            authority: wallet.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    console.log('✅ Device registered!');
    console.log(`   Transaction: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log(`   Device PDA: ${devicePda.toBase58()}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Device registration complete!');
    console.log('   You can now submit aggregates with anchor_submit.ts');
    console.log('');
}

main().catch(console.error);
