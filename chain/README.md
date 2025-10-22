# Pravardha Solana Anchor Program

Smart contract for anchoring IoT environmental data on Solana blockchain.

## Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

## Setup

```bash
# Configure for devnet
solana config set --url devnet

# Create/load keypair
solana-keygen new -o ~/.config/solana/id.json

# Airdrop SOL for testing
solana airdrop 2

# Check balance
solana balance
```

## Build and Deploy

```bash
cd chain

# Build program
anchor build

# The program ID will be in target/deploy/pravardha-keypair.json
# Copy it to Anchor.toml and lib.rs declare_id!()

# Deploy to devnet
anchor deploy

# Output will show:
# Program Id: <your-program-id>
```

## Update Configuration

After deployment, update the program ID in:

1. `chain/Anchor.toml`:
   ```toml
   [programs.devnet]
   pravardha = "YourNewProgramIDHere"
   ```

2. `chain/programs/pravardha/src/lib.rs`:
   ```rust
   declare_id!("YourNewProgramIDHere");
   ```

3. Rebuild: `anchor build`

4. Update in scripts and web:
   - `scripts/.env`: `PRAVARDHA_PROGRAM_ID=YourNewProgramIDHere`
   - `web/.env.local`: `VITE_PRAVARDHA_PROGRAM_ID=YourNewProgramIDHere`

## Program Instructions

### 1. register_device

Registers a device on-chain (one-time setup).

**Accounts**:
- `device`: PDA derived from device_pubkey
- `authority`: Signer (device owner)
- `system_program`: System program

**Arguments**:
- `device_pubkey`: Public key of the device
- `calibration_hash`: Hash of calibration parameters

**Example** (via CLI):
```bash
# This would typically be done via a TypeScript client
# See scripts/anchor_submit.ts for integration
```

### 2. submit_aggregate

Submits a 15-minute aggregate window with Merkle root.

**Accounts**:
- `device`: Device PDA (must be registered)
- `window_aggregate`: PDA derived from device + window_start
- `authority`: Signer (must match device.authority)
- `system_program`: System program

**Arguments**:
- `window_start`: Unix timestamp of window start (i64)
- `stats`: AggregateStats struct (min/max/avg for temp, humidity, pressure)
- `sample_count`: Number of samples in window (u32)
- `merkle_root`: 32-byte Merkle root hash
- `offchain_uri`: URI to full data (Arweave/IPFS/Shadow Drive)

**Example** (TypeScript client):
```typescript
await program.methods
  .submitAggregate(
    new BN(windowStart),
    stats,
    sampleCount,
    merkleRootBytes,
    "ipfs://Qm..."
  )
  .accounts({
    device: devicePda,
    windowAggregate: aggregatePda,
    authority: wallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

## Program Accounts

### Device

```rust
pub struct Device {
    pub authority: Pubkey,          // Owner of this device
    pub device_pubkey: Pubkey,      // Device identifier
    pub calibration_hash: [u8; 32], // Sensor calibration hash
    pub is_active: bool,            // Active status
    pub created_at: i64,            // Unix timestamp
}
```

**PDA Derivation**:
```
seeds: ["device", device_pubkey]
```

### WindowAggregate

```rust
pub struct WindowAggregate {
    pub device: Pubkey,             // Device account
    pub window_start: i64,          // Unix timestamp
    pub stats: AggregateStats,      // Min/max/avg sensor values
    pub sample_count: u32,          // Number of samples
    pub merkle_root: [u8; 32],      // Merkle root of raw data
    pub offchain_uri: String,       // URI to full data (max 200 chars)
    pub submitted_at: i64,          // Submission timestamp
    pub bump: u8,                   // PDA bump seed
}
```

**PDA Derivation**:
```
seeds: ["aggregate", device.key(), window_start.to_le_bytes()]
```

### AggregateStats

```rust
pub struct AggregateStats {
    pub temp_min: f32,
    pub temp_max: f32,
    pub temp_avg: f32,
    pub humidity_min: f32,
    pub humidity_max: f32,
    pub humidity_avg: f32,
    pub pressure_min: f32,
    pub pressure_max: f32,
    pub pressure_avg: f32,
}
```

## Testing

```bash
# Run tests (requires test setup)
anchor test

# Or test individual instructions via scripts
cd ../scripts
npx tsx anchor_submit.ts --device-id <uuid> --window-start "2025-10-21T10:00:00Z"
```

## Verification Flow

1. **Compute Merkle Root**: Run `compute_merkle_and_anchor.ts` to generate Merkle root from raw readings
2. **Submit to Solana**: Run `anchor_submit.ts` to anchor the aggregate on-chain
3. **Verify**: Open certificate page, which will:
   - Fetch on-chain WindowAggregate PDA
   - Recompute Merkle root from Supabase
   - Compare roots → green badge if match ✅

## Cost Estimation

On Solana devnet (free), mainnet costs:

- **Device registration**: ~0.002 SOL (one-time)
- **Aggregate submission**: ~0.001 SOL per window
- **For 1 device, 96 windows/day**: ~0.096 SOL/day (~$10/day at $100/SOL)

## Security Considerations

### Current (Hackathon)
- Device authority = deployer wallet
- Simple device_pubkey mapping
- No rate limiting

### Production Upgrades
- Device ed25519 keypairs (each device signs its own data)
- Authority delegation (multi-sig for orgs)
- Rate limiting (max 1 submission per window per device)
- Slashing for incorrect Merkle roots (requires dispute mechanism)

## Mainnet Deployment

```bash
# Configure for mainnet
solana config set --url mainnet-beta

# Ensure sufficient SOL balance
solana balance

# Deploy
anchor deploy --provider.cluster mainnet

# Update all configs with new program ID
```

## Troubleshooting

**Error: Insufficient funds**
```bash
solana airdrop 2  # devnet only
```

**Error: Program failed to complete**
- Check account sizes in lib.rs
- Verify PDA derivations match
- Check authority matches device.authority

**Error: Account already in use**
- Window already submitted
- Use different window_start or device

## Next Steps

- Implement TypeScript client library (see `ts/client.ts`)
- Add dispute mechanism for incorrect Merkle roots
- Integrate with web dashboard for one-click anchoring
- Add batch submission for multiple windows

## Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [Solana Explorer (Devnet)](https://explorer.solana.com/?cluster=devnet)
