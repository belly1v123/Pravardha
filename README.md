# Pravardha - IoT Environmental Monitoring with Solana Certification

> A minimal but complete IoT → HTTP → Supabase → Solana pipeline for indoor farm environmental monitoring and data certification.

## Architecture Overview

```
┌─────────────┐
│  ESP32 +    │  Reads: DHT11 (temp/humidity), BMP180 (pressure), MQ135 (air quality ADC)
│  Sensors    │  ──HTTPS POST──▶
└─────────────┘

┌─────────────────────────────────────────────────────┐
│  Supabase                                           │
│  ┌──────────────┐    ┌──────────────────────────┐  │
│  │ Edge Function│───▶│ Postgres Tables:         │  │
│  │  /ingest     │    │  - devices               │  │
│  │              │    │  - device_keys (hashed)  │  │
│  └──────────────┘    │  - readings (raw)        │  │
│                      │  - aggregates_15m        │  │
│                      │  - batches               │  │
│                      └──────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────┐
│  Web Dashboard (React + Vite)                       │
│  - Live sensor data (24h charts)                    │
│  - Batch creation & certificate pages               │
│  - Public verify page with Solana proof             │
└─────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────┐
│  Solana (Anchor - Devnet)                           │
│  - WindowAggregate PDA per 15-min window            │
│  - Stores: stats + merkle_root + offchain_uri       │
│  - Public verification via on-chain data            │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

- **Hardware**: ESP32, DHT11, BMP180, MQ135
- **Transport**: HTTPS POST (no MQTT)
- **Backend**: Supabase (Postgres + Edge Functions + RLS)
- **Frontend**: React + Vite + Recharts
- **Blockchain**: Solana Devnet (Anchor framework)

## Project Structure

```
pravardha/
├── firmware/               # ESP32 Arduino sketch
│   ├── pravardha_esp32.ino
│   └── README.md
├── supabase/
│   ├── migrations/         # SQL schema migrations
│   │   ├── 001_init.sql
│   │   └── 002_aggregates.sql
│   ├── functions/          # Edge Functions
│   │   ├── ingest/
│   │   └── cron_rollup/
│   └── README.md
├── web/                    # React dashboard
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── lib/
│   ├── package.json
│   └── README.md
├── chain/                  # Solana Anchor program
│   ├── programs/pravardha/
│   ├── ts/
│   ├── Anchor.toml
│   └── README.md
├── scripts/                # Automation scripts
│   ├── seed_device.ts
│   ├── compute_merkle_and_anchor.ts
│   └── anchor_submit.ts
├── .env.example
├── Makefile
└── README.md
```

## Phase 1: Device → HTTP → Supabase (Minimal Working)

### Goals
- ESP32 sends sensor data to Supabase via HTTPS
- Dashboard displays live data
- **Demo-ready in ~30 minutes**

### Quick Start

#### 1. Supabase Setup

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize (or use existing project)
supabase init

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push

# Deploy Edge Function
cd supabase/functions
supabase functions deploy ingest --no-verify-jwt

# Set secrets
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

#### 2. Create a Device

```bash
# Run seed script
cd scripts
npm install
npx tsx seed_device.ts

# Output will show:
# Device ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# Device Key: <random-key>
# Copy these to your firmware config!
```

#### 3. Flash Firmware

1. Open `firmware/pravardha_esp32.ino` in Arduino IDE
2. Install libraries: DHT sensor library, Adafruit BMP085 Library
3. Update config section:
   ```cpp
   #define WIFI_SSID "YourWiFi"
   #define WIFI_PASSWORD "YourPassword"
   #define DEVICE_ID "device-uuid-from-seed-script"
   #define DEVICE_KEY "device-key-from-seed-script"
   #define INGEST_URL "https://YOUR_PROJECT.supabase.co/functions/v1/ingest"
   ```
4. Flash to ESP32
5. Open Serial Monitor (115200 baud) to verify

#### 4. Test Ingest Endpoint

```bash
# Test with curl
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/ingest \
  -H "Content-Type: application/json" \
  -H "x-device-id: YOUR_DEVICE_ID" \
  -H "x-device-key: YOUR_DEVICE_KEY" \
  -d '{
    "ts_ms": 1729468800000,
    "temperature": 23.5,
    "humidity": 65.2,
    "pressure": 1013.25,
    "mq135_adc": 2048
  }'

# Expected response:
# {"ok":true,"reading_id":"..."}
```

#### 5. Run Dashboard

```bash
cd web
npm install
cp .env.example .env.local

# Edit .env.local with your Supabase URL and anon key
npm run dev

# Open http://localhost:5173
```

### Phase 1 Acceptance Tests
- ✅ curl POST to /ingest returns 200 OK
- ✅ Rows appear in Supabase `readings` table
- ✅ Dashboard displays data and auto-refreshes

---

## Phase 2: Aggregation + Batch Certificates

### Goals
- 15-minute aggregates (min/max/avg)
- Batch creation and public certificate page
- Merkle root computation
- **Demo-ready aggregation pipeline**

### Steps

#### 1. Deploy Aggregates Migration

```bash
supabase db push
```

This creates the `aggregates_15m` and `batches` tables.

#### 2. Run Aggregation Job

Option A: Manual (for testing)
```bash
cd scripts
npx tsx compute_merkle_and_anchor.ts --device-id YOUR_DEVICE_ID
```

Option B: Deploy Cron Function
```bash
cd supabase/functions
supabase functions deploy cron_rollup
# Configure cron schedule in Supabase dashboard: */15 * * * *
```

#### 3. Create a Batch

In the dashboard:
1. Go to "Batches" page
2. Click "Create New Batch"
3. Select device and time range (e.g., last 4 hours = 16 windows)
4. Click "Generate Certificate"
5. Get public certificate link

#### 4. View Public Certificate

Open the certificate link (no auth required):
- Shows aggregated stats over batch period
- Displays "On-chain proof" section (placeholder until Phase 3)
- Can be shared with customers, auditors, insurance providers

### Phase 2 Acceptance Tests
- ✅ Aggregates populate every 15 minutes
- ✅ Can create a batch and link aggregates
- ✅ Public certificate page loads without auth
- ✅ Merkle root computed and stored

---

## Phase 3: Solana Anchor (On-Chain Proof)

### Goals
- Anchor program on Solana Devnet
- Submit 15-minute aggregate + Merkle root on-chain
- Public verification with on-chain proof
- **Full demo-ready certification system**

### Prerequisites

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Configure for devnet
solana config set --url devnet
solana-keygen new -o ~/.config/solana/id.json  # if needed
solana airdrop 2
```

### Steps

#### 1. Build and Deploy Anchor Program

```bash
cd chain
anchor build
anchor deploy

# Copy the program ID from output
# Update chain/Anchor.toml with new program ID
# Re-build: anchor build
```

#### 2. Update Program ID in Scripts

Edit `scripts/anchor_submit.ts` and `web/src/lib/solanaClient.ts` with your deployed program ID.

#### 3. Submit Window to Solana

```bash
cd scripts
npx tsx anchor_submit.ts \
  --device-id YOUR_DEVICE_ID \
  --window-start "2025-10-21T10:00:00Z"

# Output:
# ✅ Submitted aggregate to Solana
# Transaction: https://explorer.solana.com/tx/...?cluster=devnet
# PDA: DevxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxQ
```

#### 4. Verify On-Chain

1. Open the batch certificate page
2. Click "Verify On-Chain"
3. System will:
   - Fetch on-chain WindowAggregate PDA
   - Recompute Merkle root from Supabase raw readings
   - Compare roots and show verification status
4. Green badge + Solana Explorer link if verified ✅

### Phase 3 Acceptance Tests
- ✅ Anchor program deployed to devnet
- ✅ submit_aggregate transaction succeeds
- ✅ Transaction visible on Solana Explorer
- ✅ Public verify page shows green badge when Merkle matches
- ✅ Can click through to Solana Explorer

---

## Troubleshooting

### ESP32 Issues

**Not connecting to WiFi**
- Check SSID/password
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)
- Check Serial Monitor for error messages

**Sensor read failures**
- Verify wiring (see firmware/README.md)
- Check I2C address conflicts (use I2C scanner sketch)
- Ensure 3.3V power for sensors

**HTTPS POST fails**
- Verify INGEST_URL is correct
- Check device_id and device_key match database
- Ensure ESP32 has internet access
- Check certificate validation (may need to add root CA)

### Supabase Issues

**Edge Function 401 Unauthorized**
- Verify device exists in `devices` table
- Verify device key hash matches in `device_keys` table
- Check headers: `x-device-id` and `x-device-key`

**No data in readings table**
- Check RLS policies (should allow service role to insert)
- Verify Edge Function has correct service role key
- Check Edge Function logs: `supabase functions logs ingest`

### Solana Issues

**Deployment fails**
- Ensure sufficient SOL balance: `solana balance`
- Airdrop more: `solana airdrop 2`
- Check you're on devnet: `solana config get`

**Transaction fails**
- Check program ID matches in code and Anchor.toml
- Verify account sizes are sufficient
- Check devnet isn't congested (try again)

---

## Security Considerations

### Current Implementation (Hackathon-Safe)
- ✅ HTTPS only (no plaintext HTTP)
- ✅ Device keys hashed (SHA-256) in database
- ✅ RLS policies prevent direct table access
- ✅ Edge Function validates device auth
- ✅ Merkle roots provide data integrity

### Production Upgrades (Future)
- 🔄 Device ed25519 signatures (replace pre-shared keys)
- 🔄 Rate limiting per device (prevent DoS)
- 🔄 Anomaly detection (flag suspicious readings)
- 🔄 Encrypted payloads (device → Supabase)
- 🔄 Mainnet deployment (Solana mainnet-beta)
- 🔄 Arweave/Shadow Drive for full data redundancy

---

## Demo Script (5 Minutes)

### 1. Problem Statement (30s)
"Indoor farms need verifiable environmental data for:
- Insurance claims
- Sustainability certifications
- Customer trust
- Automated financing

Traditional systems are centralized and can be manipulated."

### 2. Live Device Demo (90s)
- Show ESP32 with sensors
- Point to Serial Monitor: "Reading temp, humidity, pressure every 30 seconds"
- Switch to dashboard: "Data appears live via HTTPS to Supabase"
- Hover over chart: "Here's the last 24 hours"

### 3. Batch Certificate (90s)
- Click "Create Batch"
- "Let's certify the last 4 hours of data"
- Show generated certificate page
- "This is a public URL—shareable with insurers, auditors, customers"
- Point to stats: "15-minute aggregates, sample counts"

### 4. Blockchain Proof (90s)
- Click "Anchor to Solana"
- Show terminal running `anchor_submit.ts`
- "We compute a Merkle root of all raw readings in each 15-minute window"
- Page updates with green verified badge
- Click "View on Solana Explorer"
- "Here's the immutable proof—merkle root, stats, timestamp"
- "Anyone can recompute the Merkle root and verify data integrity"

### 5. Use Cases (30s)
"This enables:
- Parametric crop insurance (auto-claim if temp > threshold for N hours)
- Carbon credit certification
- Quality assurance for buyers
- DeFi lending backed by farming operations"

---

## Use Cases & Business Model

### Target Customers
1. **Indoor Farms** - Automated certification for produce quality
2. **Insurance Providers** - Parametric policies based on verified environmental data
3. **Carbon Credit Marketplaces** - Auditable sustainability metrics
4. **Supply Chain** - Farm-to-consumer transparency

### Revenue Streams
- Device sales (ESP32 + sensors)
- Monthly SaaS subscription (dashboard + certification)
- Per-certificate fees (charged to verifier/auditor)
- API access for DeFi integrations

---

## Development Roadmap

### Phase 4 (Post-Hackathon)
- [ ] Multi-device dashboard (farm-wide view)
- [ ] Alerting system (SMS/email on threshold breach)
- [ ] Mobile app (React Native)
- [ ] More sensors (soil moisture, light intensity, CO2 calibrated)
- [ ] Device firmware OTA updates
- [ ] Historical data export (CSV, API)

### Phase 5 (Production)
- [ ] Mainnet deployment
- [ ] Device signature verification (ed25519)
- [ ] Arweave integration (full data redundancy)
- [ ] Smart contract automation (parametric triggers)
- [ ] Multi-chain support (Polygon, Ethereum)
- [ ] Enterprise dashboard (multi-tenant)

---

## Contributing

This is a hackathon project. Contributions welcome!

```bash
# Fork the repo
git clone https://github.com/yourusername/pravardha.git
cd pravardha

# Create feature branch
git checkout -b feature/your-feature

# Make changes and test
# ...

# Submit PR
git push origin feature/your-feature
```

---

## License

MIT License - see LICENSE file

---

## Acknowledgments

- Solana Foundation (Devnet support)
- Supabase (Edge Functions + Postgres)
- Anchor Framework (Smart contract tooling)

---

## Contact

For questions or demo requests:
- GitHub Issues: [github.com/yourusername/pravardha/issues]
- Email: your.email@example.com
- Twitter: @YourHandle

---

**Built with ❤️ for the Solana Hackathon 2025**
