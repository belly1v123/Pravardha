# Supabase Setup Guide

This directory contains Supabase migrations and Edge Functions for the Pravardha IoT platform.

## Prerequisites

- [Supabase Account](https://supabase.com) (free tier is fine)
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- Node.js 18+ (for local testing)

## Installation

```bash
# Install Supabase CLI globally
npm install -g supabase

# Or via Homebrew (macOS/Linux)
brew install supabase/tap/supabase
```

## Setup Steps

### 1. Create Supabase Project

Option A: Via Dashboard
1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Enter project details:
   - Name: `pravardha-iot`
   - Database Password: (save this!)
   - Region: Choose closest to your location
4. Wait for provisioning (~2 minutes)

Option B: Via CLI
```bash
supabase projects create pravardha-iot --org-id <your-org-id>
```

### 2. Link Local Project

```bash
# From project root
cd supabase

# Link to your project
supabase link --project-ref <your-project-ref>

# Project ref is in your dashboard URL:
# https://app.supabase.com/project/<project-ref>
```

### 3. Run Migrations

```bash
# Push all migrations to remote database
supabase db push

# Or apply specific migration
supabase db push --include-all
```

Expected output:
```
✓ Migrations up to date
  - 001_init.sql
  - Tables created: devices, device_keys, readings
  - RLS policies enabled
  - Views created: latest_readings, device_health
```

### 4. Deploy Edge Functions

#### Deploy Ingest Function

```bash
cd supabase/functions

# Deploy without JWT verification (device uses custom auth)
supabase functions deploy ingest --no-verify-jwt
```

#### Set Environment Secrets

```bash
# Get these from Supabase Dashboard → Settings → API
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

**Important**: Never commit the service role key to version control!

### 5. Test Ingest Endpoint

Get your credentials:
- Supabase URL: Dashboard → Settings → API → Project URL
- Anon Key: Dashboard → Settings → API → Project API keys → anon public

```bash
# First, seed a device (see scripts/seed_device.ts)
cd ../scripts
npm install
npx tsx seed_device.ts

# Output will show:
# Device ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# Device Key: <your-key>
# Device Key Hash: <hash>

# Test with curl
curl -X POST https://your-project.supabase.co/functions/v1/ingest \
  -H "Content-Type: application/json" \
  -H "x-device-id: YOUR_DEVICE_ID" \
  -H "x-device-key: YOUR_DEVICE_KEY" \
  -d '{
    "ts_ms": 1729517445000,
    "temperature": 23.5,
    "humidity": 65.2,
    "pressure": 1013.25,
    "mq135_adc": 2048
  }'

# Expected response (200 OK):
{
  "ok": true,
  "reading_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "ts_server": "2025-10-21T14:30:45.123Z"
}

# Error responses:
# 401: Invalid credentials
# 400: Invalid sensor data
# 500: Server error
```

### 6. Verify Data in Dashboard

1. Go to Supabase Dashboard → Table Editor
2. Check `readings` table:
   - Should have 1 row with your test data
3. Check `devices` table:
   - Should have your seeded device
   - `last_seen_at` should be recent
4. Try the view:
   ```sql
   SELECT * FROM latest_readings;
   ```

## Database Schema

### Tables

#### `devices`
Registered IoT devices.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Device name |
| device_type | TEXT | 'esp32', 'rpi', 'arduino' |
| location | TEXT | Physical location |
| owner_uid | UUID | Future: link to auth.users |
| is_active | BOOLEAN | Active status |
| last_seen_at | TIMESTAMPTZ | Last reading timestamp |
| created_at | TIMESTAMPTZ | Creation timestamp |

#### `device_keys`
Hashed authentication keys (SHA-256).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| device_id | UUID | Foreign key to devices |
| key_hash | TEXT | SHA-256 hash of key |
| is_active | BOOLEAN | Active status |
| expires_at | TIMESTAMPTZ | Expiration (optional) |
| last_used_at | TIMESTAMPTZ | Last usage timestamp |

#### `readings`
Raw sensor readings.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| device_id | UUID | Foreign key to devices |
| ts_device | TIMESTAMPTZ | Device-reported timestamp |
| ts_server | TIMESTAMPTZ | Server-received timestamp |
| temperature | REAL | Temperature (°C) |
| humidity | REAL | Humidity (%) |
| pressure | REAL | Pressure (hPa) |
| mq135_adc | INTEGER | MQ135 raw ADC (0-4095) |
| mq135_ppm | REAL | Estimated CO2 PPM (future) |
| metadata | JSONB | Additional data |

### Views

#### `latest_readings`
Most recent reading per device.

```sql
SELECT * FROM latest_readings WHERE device_id = 'xxx';
```

#### `device_health`
Device online/offline status.

```sql
SELECT * FROM device_health;
```

Statuses:
- `online`: Last seen < 5 minutes ago
- `idle`: Last seen 5-60 minutes ago
- `offline`: Last seen > 1 hour ago

## Row Level Security (RLS)

RLS is enabled on all tables:

- **devices**: Users can only see devices they own (or `owner_uid IS NULL` for demo)
- **device_keys**: No public access (service role only)
- **readings**: Users can only see readings from their devices

The Edge Function uses the **service role** to bypass RLS and insert data.

## Edge Function Details

### `/ingest`

**Method**: POST  
**Auth**: Custom (x-device-id + x-device-key headers)  
**Rate Limit**: None (add in production)

**Request**:
```json
{
  "ts_ms": 1729517445000,
  "temperature": 23.5,
  "humidity": 65.2,
  "pressure": 1013.25,
  "mq135_adc": 2048,
  "metadata": {}
}
```

**Headers**:
- `Content-Type: application/json`
- `x-device-id: <device-uuid>`
- `x-device-key: <plaintext-key>`

**Response** (200 OK):
```json
{
  "ok": true,
  "reading_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "ts_server": "2025-10-21T14:30:45.123Z"
}
```

**Error Codes**:
- `401`: Invalid device credentials
- `400`: Invalid sensor data (out of range)
- `405`: Method not allowed (only POST)
- `500`: Internal server error

**Validation Rules**:
- Temperature: -50°C to 100°C
- Humidity: 0% to 100%
- Pressure: 800 hPa to 1200 hPa
- MQ135 ADC: 0 to 4095
- Timestamp: Within ±1 hour of server time (clock drift tolerance)

## Local Development

### Run Supabase Locally

```bash
# Start local Supabase (Docker required)
supabase start

# Check status
supabase status

# Access local dashboard
# URL: http://localhost:54323
```

### Test Function Locally

```bash
# Serve function locally
supabase functions serve ingest --no-verify-jwt

# In another terminal, test with curl
curl -X POST http://localhost:54321/functions/v1/ingest \
  -H "Content-Type: application/json" \
  -H "x-device-id: test-device" \
  -H "x-device-key: test-key" \
  -d '{"temperature": 25.0}'
```

### View Logs

```bash
# Remote logs
supabase functions logs ingest --tail

# Local logs (auto-displayed when serving)
```

## Production Considerations

### Security

1. **Rotate Device Keys**:
   ```sql
   -- Deactivate old key
   UPDATE device_keys SET is_active = false WHERE device_id = '...';
   
   -- Insert new key
   INSERT INTO device_keys (device_id, key_hash)
   VALUES ('...', '...');
   ```

2. **Set Key Expiration**:
   ```sql
   UPDATE device_keys
   SET expires_at = NOW() + INTERVAL '90 days'
   WHERE device_id = '...';
   ```

3. **Add Rate Limiting**:
   - Use Supabase Edge Function KV store
   - Track requests per device_id per minute
   - Reject if > 10 requests/minute

4. **Enable HTTPS Only**:
   - Already enforced by Supabase
   - Ensure ESP32 uses HTTPS (not HTTP)

### Performance

1. **Partition readings table** (for millions of rows):
   ```sql
   ALTER TABLE readings PARTITION BY RANGE (ts_server);
   CREATE TABLE readings_2025_10 PARTITION OF readings
     FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
   ```

2. **Add indexes** for common queries:
   ```sql
   CREATE INDEX idx_readings_device_date
     ON readings(device_id, DATE(ts_server));
   ```

3. **Archive old data**:
   - Move readings > 90 days to cold storage
   - Keep aggregates_15m indefinitely

### Monitoring

1. **Edge Function Metrics**:
   - Dashboard → Edge Functions → ingest → Metrics
   - Watch for: invocations, errors, duration

2. **Database Health**:
   - Dashboard → Database → Health
   - Watch for: CPU, memory, connections

3. **Alerts**:
   - Set up alerts for high error rate
   - Alert on device offline > 1 hour

## Troubleshooting

### Migration Fails

**Error**: `relation "xxx" already exists`

**Fix**:
```bash
# Reset database (WARNING: deletes all data)
supabase db reset

# Or manually drop tables
supabase db execute "DROP TABLE IF EXISTS readings CASCADE;"
```

### Function Deploy Fails

**Error**: `Unable to deploy function`

**Fix**:
- Check function logs: `supabase functions logs ingest`
- Verify TypeScript syntax
- Ensure dependencies are in function directory
- Check secrets are set: `supabase secrets list`

### RLS Blocks Reads

**Error**: `Row-level security policy violation`

**Fix**:
- Check user is authenticated
- Verify `owner_uid` matches user's UID
- For testing, set `owner_uid = NULL` on devices
- Or temporarily disable RLS: `ALTER TABLE readings DISABLE ROW LEVEL SECURITY;`

### Slow Queries

**Symptom**: Dashboard loading slow

**Fix**:
- Add indexes on frequently queried columns
- Use views instead of complex JOINs
- Limit result sets (e.g., last 24h only)
- Enable query performance insights in dashboard

## Next Steps

Once Phase 1 is working:
1. ✅ Ingest endpoint receiving data
2. ✅ Data visible in dashboard
3. ✅ ESP32 successfully posting

Proceed to:
- **Phase 2**: Run migration 002_aggregates.sql
- **Web Dashboard**: Set up React app with Supabase client
- **Aggregation**: Deploy cron_rollup function

## Support

For issues:
- Check logs: `supabase functions logs ingest`
- See main README.md troubleshooting section
- Supabase docs: [https://supabase.com/docs](https://supabase.com/docs)
