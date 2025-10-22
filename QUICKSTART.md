# Pravardha Quickstart Guide

Get your IoT → Solana pipeline running in 30 minutes.

## Prerequisites Checklist

- [ ] ESP32 board + sensors (DHT11, BMP180, MQ135)
- [ ] Arduino IDE installed
- [ ] Node.js 18+ installed
- [ ] Supabase account (free tier OK)
- [ ] Solana CLI installed (for Phase 3)

## 30-Minute Quickstart (Phases 1 & 2)

### Step 1: Supabase Setup (5 min)

```bash
# Install Supabase CLI
npm install -g supabase

# Create project at https://app.supabase.com
# Note your: Project URL, anon key, service role key

# Clone/navigate to project
cd Pravardha

# Create .env file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

Paste:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

```bash
# Run migrations
cd supabase
supabase link --project-ref <your-ref>
supabase db push

# Deploy Edge Function
supabase functions deploy ingest --no-verify-jwt

# Set secrets
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### Step 2: Seed Device (2 min)

```bash
cd ../scripts
npm install
npx tsx seed_device.ts
```

**Copy the output**: Device ID and Device Key

### Step 3: Flash ESP32 (8 min)

1. Open `firmware/pravardha_esp32.ino` in Arduino IDE
2. Install libraries:
   - DHT sensor library
   - Adafruit BMP085 Library
   - ArduinoJson
3. Update config:
   ```cpp
   #define WIFI_SSID "YourWiFi"
   #define WIFI_PASSWORD "YourPassword"
   #define DEVICE_ID "paste-device-id-here"
   #define DEVICE_KEY "paste-device-key-here"
   #define INGEST_URL "https://your-project.supabase.co/functions/v1/ingest"
   ```
4. Wire sensors (see `firmware/README.md`)
5. Select Board: ESP32 Dev Module
6. Flash and open Serial Monitor (115200 baud)

### Step 4: Verify Data (2 min)

Test with curl:
```bash
curl -X POST https://your-project.supabase.co/functions/v1/ingest \
  -H "Content-Type: application/json" \
  -H "x-device-id: YOUR_DEVICE_ID" \
  -H "x-device-key: YOUR_DEVICE_KEY" \
  -d '{"temperature": 23.5, "humidity": 65, "pressure": 1013, "mq135_adc": 2048}'
```

Check Supabase dashboard → Table Editor → `readings` → should see row!

### Step 5: Run Web Dashboard (5 min)

```bash
cd ../web
npm install

# Create .env.local
cp .env.example .env.local

# Edit with your Supabase URL and anon key
nano .env.local

# Start dev server
npm run dev
```

Open http://localhost:5173 → Should see live data! 🎉

### Step 6: Run Aggregation (5 min)

Wait for some readings to accumulate (2-3 minutes), then:

```bash
cd ../scripts
npx tsx compute_merkle_and_anchor.ts --device-id YOUR_DEVICE_ID
```

Check Supabase → `aggregates_15m` table → should see aggregated data!

### Step 7: Create Batch Certificate (3 min)

1. In web dashboard, go to "Batches"
2. Click "Create Batch"
3. Fill in:
   - Name: "Demo Batch"
   - Start: 2 hours ago
   - End: now
4. Click "Create Batch"
5. Click "View Certificate"

You now have a public certificate page! Share the URL.

## ✅ Phase 1 & 2 Complete!

At this point, you have:
- ✅ ESP32 sending data
- ✅ Supabase receiving and storing
- ✅ Dashboard showing live charts
- ✅ 15-minute aggregates computed
- ✅ Batch certificates generated
- ✅ Merkle roots calculated

## Phase 3: Solana Anchoring (30 more minutes)

### Step 8: Install Solana Tools

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Configure devnet
solana config set --url devnet
solana-keygen new -o ~/.config/solana/id.json
solana airdrop 2
```

### Step 9: Build and Deploy Anchor Program

```bash
cd ../chain
anchor build
anchor deploy

# Copy the Program ID from output
# Update chain/Anchor.toml and chain/programs/pravardha/src/lib.rs with new ID
# Rebuild: anchor build
```

### Step 10: Anchor a Window

```bash
cd ../scripts

# Update .env with program ID
echo "PRAVARDHA_PROGRAM_ID=YourProgramIDHere" >> ../.env

# Submit aggregate to Solana
npx tsx anchor_submit.ts \
  --device-id YOUR_DEVICE_ID \
  --window-start "2025-10-21T10:00:00Z"
```

Check output for Solana Explorer link!

### Step 11: Verify On-Chain

1. Go back to batch certificate page
2. Refresh → should show "Fully Verified" ✅
3. Click Solana Explorer link → see transaction on devnet

## 🎉 Complete Pipeline Working!

You now have end-to-end:
1. Hardware → HTTP → Database
2. Aggregation → Merkle roots
3. Blockchain → Public verification

## Demo Script for Judges (5 min)

1. **Show live device** (Serial Monitor + physical sensors)
2. **Dashboard** → point to charts, explain 24h history
3. **Create batch** → "This is the last 4 hours of data"
4. **Certificate page** → "Public URL, no auth needed"
5. **Anchor button** → run script, show terminal
6. **Refresh page** → green verified badge
7. **Solana Explorer** → "Immutable on blockchain"
8. **Explain use case**: insurance, carbon credits, supply chain

## Troubleshooting Quick Fixes

### ESP32 not connecting
```bash
# Check Serial Monitor
# Try: press ESP32 RST button
# Verify WiFi is 2.4GHz
```

### No data in dashboard
```bash
# Test ingest directly
curl -X POST ... # (see Step 4)

# Check Supabase logs
supabase functions logs ingest --tail
```

### Anchor deploy fails
```bash
# Check balance
solana balance

# If low, airdrop more
solana airdrop 2

# Retry
anchor deploy
```

## Next Steps After Hackathon

1. **Deploy to production**:
   - Supabase Pro plan
   - Mainnet Solana
   - Custom domain

2. **Add features**:
   - Email alerts on thresholds
   - Mobile app
   - More sensors (soil moisture, CO2 calibrated)

3. **Business model**:
   - SaaS subscription
   - Per-certificate fees
   - API access for DeFi

## Support

- Firmware: See `firmware/README.md`
- Supabase: See `supabase/README.md`
- Web: See `web/README.md`
- Anchor: See `chain/README.md`
- Main: See `README.md`

## Project Structure Reference

```
Pravardha/
├── firmware/           # ESP32 Arduino sketch
├── supabase/          # Migrations + Edge Functions
├── web/               # React dashboard
├── chain/             # Solana Anchor program
├── scripts/           # Automation (seed, merkle, anchor)
├── .env               # Credentials (NEVER COMMIT)
└── README.md          # Full documentation
```

## Time Budget

- Phase 1: 30 min (device to dashboard)
- Phase 2: +15 min (aggregation + batches)
- Phase 3: +30 min (Solana anchoring)
- **Total: ~75 min for complete working demo**

## What Makes This Hackathon-Ready?

✅ **Works out of the box** (minimal config)  
✅ **Clear documentation** (step-by-step)  
✅ **Demoable at each phase** (incremental)  
✅ **Real hardware** (not just simulation)  
✅ **Blockchain proof** (actual Solana txs)  
✅ **Production path** (clearly documented)  

Good luck! 🚀
