# Pravardha - Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRAVARDHA SYSTEM                                │
│                   IoT Environmental Monitoring + Blockchain                  │
└─────────────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: Device → HTTP → Supabase → Dashboard                           │
└───────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐
    │   ESP32 Board   │
    │                 │
    │  ┌───────────┐  │      HTTPS POST
    │  │   DHT11   │──┼───────────────────┐
    │  │  (Temp/   │  │  x-device-id      │
    │  │  Humidity)│  │  x-device-key     │
    │  └───────────┘  │                   │
    │                 │  {                │
    │  ┌───────────┐  │    "ts_ms": ..., │
    │  │  BMP180   │──┼─   "temperature": 23.5,
    │  │ (Pressure)│  │    "humidity": 65.2,
    │  └───────────┘  │    "pressure": 1013.25,
    │                 │    "mq135_adc": 2048
    │  ┌───────────┐  │  }                │
    │  │  MQ135    │──┼───────────────────┘
    │  │(Air Qual.)│  │
    │  └───────────┘  │
    └─────────────────┘
           │
           │ Every 2 minutes
           ↓

    ┌──────────────────────────────────────────────────────┐
    │            Supabase Edge Function                    │
    │          /functions/v1/ingest                        │
    │                                                      │
    │  1. Validate device credentials (SHA-256)           │
    │  2. Sanitize sensor data                            │
    │  3. Call insert_reading() RPC                       │
    │  4. Return { ok: true, reading_id: "..." }          │
    └──────────────────────────────────────────────────────┘
           │
           │ INSERT
           ↓

    ┌──────────────────────────────────────────────────────┐
    │              Supabase Postgres                       │
    │                                                      │
    │  ┌────────────────┐  ┌──────────────────┐          │
    │  │   devices      │  │  device_keys     │          │
    │  │  - id          │  │  - device_id     │          │
    │  │  - name        │  │  - key_hash      │          │
    │  │  - location    │  │  - is_active     │          │
    │  └────────────────┘  └──────────────────┘          │
    │                                                      │
    │  ┌──────────────────────────────────────┐          │
    │  │          readings                     │          │
    │  │  - id                                 │          │
    │  │  - device_id                          │          │
    │  │  - ts_server                          │          │
    │  │  - temperature, humidity, pressure    │          │
    │  │  - mq135_adc                          │          │
    │  └──────────────────────────────────────┘          │
    └──────────────────────────────────────────────────────┘
           │
           │ SELECT (last 24h)
           ↓

    ┌──────────────────────────────────────────────────────┐
    │         React Dashboard (web/)                       │
    │                                                      │
    │  ┌────────────────────────────────────────┐         │
    │  │  Dashboard.tsx                         │         │
    │  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │         │
    │  │                                        │         │
    │  │  📊 Temperature & Humidity (24h)      │         │
    │  │      [Line Chart]                     │         │
    │  │                                        │         │
    │  │  📈 Pressure (24h)                    │         │
    │  │      [Line Chart]                     │         │
    │  │                                        │         │
    │  │  🌫️ Air Quality (24h)                 │         │
    │  │      [Line Chart]                     │         │
    │  │                                        │         │
    │  │  🔄 Auto-refresh: 30s                 │         │
    │  └────────────────────────────────────────┘         │
    └──────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: Aggregation + Batch Certification                              │
└───────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────┐
    │        Supabase Cron (every 15 min)                  │
    │      /functions/v1/cron_rollup                       │
    │                                                      │
    │  1. Get previous 15-min window                      │
    │  2. For each active device:                         │
    │     - Call compute_15m_aggregate()                  │
    │     - Compute min/max/avg/stddev                    │
    │  3. Insert into aggregates_15m                      │
    └──────────────────────────────────────────────────────┘
           │
           │ INSERT aggregate
           ↓

    ┌──────────────────────────────────────────────────────┐
    │              Supabase Postgres                       │
    │                                                      │
    │  ┌──────────────────────────────────────┐          │
    │  │      aggregates_15m                   │          │
    │  │  - id                                 │          │
    │  │  - device_id                          │          │
    │  │  - window_start, window_end           │          │
    │  │  - temp_min, temp_max, temp_avg       │          │
    │  │  - humidity_min/max/avg               │          │
    │  │  - pressure_min/max/avg               │          │
    │  │  - sample_count                       │          │
    │  │  - merkle_root_hex                    │ ← Phase 3
    │  │  - is_anchored                        │
    │  └──────────────────────────────────────┘          │
    └──────────────────────────────────────────────────────┘
           │
           │ Script: compute_merkle_and_anchor.ts
           ↓

    ┌──────────────────────────────────────────────────────┐
    │           Merkle Tree Computation                    │
    │                                                      │
    │  1. Fetch all readings in 15-min window             │
    │  2. Hash each reading: SHA-256(id|ts|values)        │
    │  3. Build Merkle tree bottom-up                     │
    │  4. Store merkle_root_hex in aggregate              │
    └──────────────────────────────────────────────────────┘
           │
           │ User creates batch
           ↓

    ┌──────────────────────────────────────────────────────┐
    │              Batch Certificate                       │
    │                                                      │
    │  ┌──────────────────────────────────────┐          │
    │  │          batches                      │          │
    │  │  - id                                 │          │
    │  │  - device_id                          │          │
    │  │  - start_ts, end_ts                   │          │
    │  │  - status (open/closed/certified)     │          │
    │  │  - temp_overall_min/max/avg           │          │
    │  │  - certificate_url                    │          │
    │  └──────────────────────────────────────┘          │
    │                                                      │
    │  ┌──────────────────────────────────────┐          │
    │  │       batch_windows                   │          │
    │  │  - batch_id → aggregate_id            │          │
    │  └──────────────────────────────────────┘          │
    └──────────────────────────────────────────────────────┘
           │
           │ Public URL: /verify/:batchId
           ↓

    ┌──────────────────────────────────────────────────────┐
    │         Public Certificate Page                      │
    │                                                      │
    │  🌱 Environmental Certificate                        │
    │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━        │
    │                                                      │
    │  Batch: October Harvest                             │
    │  Device: ESP32 - Bay 1                              │
    │  Period: Oct 20 10:00 - Oct 21 10:00               │
    │                                                      │
    │  📊 Stats:                                          │
    │     Temperature: 22.5 - 25.3°C (avg 23.8°C)        │
    │     Humidity: 62 - 68% (avg 65%)                   │
    │     Samples: 2,304                                  │
    │                                                      │
    │  ⏳ On-chain: 12 / 96 windows anchored              │
    │                                                      │
    │  [View on Solana Explorer →]                        │
    └──────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: Solana Blockchain Anchoring                                    │
└───────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────┐
    │    Script: anchor_submit.ts                          │
    │                                                      │
    │  1. Fetch aggregate with merkle_root_hex            │
    │  2. Connect to Solana devnet                        │
    │  3. Derive PDAs:                                    │
    │     - Device PDA                                    │
    │     - WindowAggregate PDA                           │
    │  4. Call program.methods.submitAggregate()          │
    │  5. Update is_anchored in Supabase                  │
    └──────────────────────────────────────────────────────┘
           │
           │ RPC call
           ↓

    ┌──────────────────────────────────────────────────────┐
    │        Solana Anchor Program (Rust)                  │
    │        chain/programs/pravardha/src/lib.rs           │
    │                                                      │
    │  Instructions:                                       │
    │  ┌────────────────────────────────────┐            │
    │  │  register_device                   │            │
    │  │  - Creates Device PDA              │            │
    │  │  - Stores authority, calibration   │            │
    │  └────────────────────────────────────┘            │
    │                                                      │
    │  ┌────────────────────────────────────┐            │
    │  │  submit_aggregate                  │            │
    │  │  - Creates WindowAggregate PDA     │            │
    │  │  - Stores stats + merkle_root      │            │
    │  │  - Stores offchain_uri             │            │
    │  └────────────────────────────────────┘            │
    └──────────────────────────────────────────────────────┘
           │
           │ On-chain storage
           ↓

    ┌──────────────────────────────────────────────────────┐
    │           Solana Blockchain (Devnet)                 │
    │                                                      │
    │  Device PDA                                          │
    │  seeds: ["device", device_pubkey]                   │
    │  ┌────────────────────────────────────┐            │
    │  │  authority: Pubkey                 │            │
    │  │  device_pubkey: Pubkey             │            │
    │  │  calibration_hash: [u8; 32]        │            │
    │  │  is_active: bool                   │            │
    │  │  created_at: i64                   │            │
    │  └────────────────────────────────────┘            │
    │                                                      │
    │  WindowAggregate PDA                                │
    │  seeds: ["aggregate", device, window_start]         │
    │  ┌────────────────────────────────────┐            │
    │  │  device: Pubkey                    │            │
    │  │  window_start: i64                 │            │
    │  │  stats: AggregateStats             │            │
    │  │  sample_count: u32                 │            │
    │  │  merkle_root: [u8; 32]            │ ← PROOF!   │
    │  │  offchain_uri: String              │            │
    │  │  submitted_at: i64                 │            │
    │  └────────────────────────────────────┘            │
    └──────────────────────────────────────────────────────┘
           │
           │ Verification flow
           ↓

    ┌──────────────────────────────────────────────────────┐
    │      Public Certificate Verification                 │
    │                                                      │
    │  1. User opens /verify/:batchId                     │
    │  2. Web fetches WindowAggregate PDA from Solana     │
    │  3. Recomputes Merkle root from Supabase readings   │
    │  4. Compares:                                       │
    │     on_chain_merkle_root == computed_merkle_root    │
    │  5. Shows ✅ or ❌                                   │
    │                                                      │
    │  ✅ Fully Verified                                  │
    │     All 96 windows anchored on Solana               │
    │     [View Transaction: abc123...xyz →]              │
    └──────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────┐
│  DATA FLOW SUMMARY                                                        │
└───────────────────────────────────────────────────────────────────────────┘

  Raw Data         Aggregation        Merkle Tree       Blockchain
  ────────         ───────────        ───────────       ──────────

  ESP32 sensors    Every 15 min:      Compute tree:     Anchor to
  ↓ 30s sample     Roll up readings   ├─ Hash readings  Solana:
  ↓ 2min POST      ↓                  ├─ Build tree     ├─ Device PDA
  ↓ readings       aggregates_15m     ├─ Get root       ├─ Aggregate PDA
  ↓                ↓                  ↓                  ↓
  24h history      Stats computed     Merkle root       Immutable proof
  ↓                ↓                  stored            ↓
  Dashboard        Batch created      ↓                 Public verify
  charts           ↓                  Ready for         page shows
                   Certificate        anchoring         ✅ or ❌


┌───────────────────────────────────────────────────────────────────────────┐
│  AUTHENTICATION & SECURITY                                                │
└───────────────────────────────────────────────────────────────────────────┘

  ESP32              Edge Function       Supabase           Solana
  ─────              ─────────────       ────────           ──────

  x-device-id    →   Validate against    Service role   →   Authority
  x-device-key   →   SHA-256 hash in     bypasses RLS       signature
                     device_keys                            (Phase 4)

  ┌─────────────────────────────────────────────────────────┐
  │  Phase 1: Pre-shared keys (SHA-256 hashed)             │
  │  Phase 4: Device ed25519 signatures + multi-sig        │
  └─────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────┐
│  DEPLOYMENT ARCHITECTURE                                                  │
└───────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
  │   ESP32     │───▶│   Supabase   │───▶│  Vercel/    │
  │  (on-site)  │    │  (Cloud SaaS)│    │  Netlify    │
  └─────────────┘    └──────────────┘    └─────────────┘
                            │                     │
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐      Web Dashboard
                     │    Solana    │      (Static hosting)
                     │   Devnet/    │
                     │   Mainnet    │
                     └──────────────┘


Legend:
  PDA    = Program Derived Address
  RLS    = Row Level Security
  RPC    = Remote Procedure Call
  HTTPS  = Secure HTTP
  SHA-256= Cryptographic hash function
  ✅     = Verified
  ❌     = Not verified
