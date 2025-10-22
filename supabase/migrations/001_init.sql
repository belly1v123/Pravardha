-- Pravardha IoT Platform - Initial Schema
-- Phase 1: Device registration, authentication, and raw readings

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- DEVICES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  device_type TEXT DEFAULT 'esp32' CHECK (device_type IN ('esp32', 'rpi', 'arduino')),
  
  -- Metadata
  location TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Ownership (for multi-tenant future)
  owner_uid UUID, -- Future: link to auth.users
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_owner ON devices(owner_uid);
CREATE INDEX idx_devices_active ON devices(is_active);

COMMENT ON TABLE devices IS 'IoT devices registered in the system';

-- ============================================================================
-- DEVICE KEYS TABLE (Pre-shared keys, hashed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS device_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  
  -- Key hash (SHA-256 of the plaintext key)
  key_hash TEXT NOT NULL,
  
  -- Key metadata
  key_name TEXT DEFAULT 'default',
  is_active BOOLEAN DEFAULT true,
  
  -- Rotation tracking
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_device_keys_device ON device_keys(device_id);
CREATE INDEX idx_device_keys_hash ON device_keys(key_hash);
CREATE INDEX idx_device_keys_active ON device_keys(is_active);

COMMENT ON TABLE device_keys IS 'Hashed device authentication keys (Phase 1: pre-shared, Phase 4: ed25519 signatures)';

-- ============================================================================
-- READINGS TABLE (Raw sensor data)
-- ============================================================================
CREATE TABLE IF NOT EXISTS readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  
  -- Timestamp (from device or server)
  ts_device TIMESTAMPTZ, -- Device-reported timestamp
  ts_server TIMESTAMPTZ DEFAULT NOW(), -- Server-received timestamp
  
  -- Environmental sensors
  temperature REAL, -- °C
  humidity REAL, -- %
  pressure REAL, -- hPa
  
  -- Air quality (MQ135)
  mq135_adc INTEGER, -- Raw ADC value (0-4095)
  mq135_ppm REAL, -- Estimated CO2 PPM (if calibrated)
  
  -- Additional sensor slots (future)
  soil_moisture REAL,
  light_intensity REAL,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_readings_device_ts ON readings(device_id, ts_server DESC);
CREATE INDEX idx_readings_ts_server ON readings(ts_server DESC);
CREATE INDEX idx_readings_device_id ON readings(device_id);

-- Partition by month (optional, for large-scale deployment)
-- ALTER TABLE readings PARTITION BY RANGE (ts_server);

COMMENT ON TABLE readings IS 'Raw sensor readings from IoT devices';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;

-- Devices: Users can only see their own devices
CREATE POLICY devices_select_policy ON devices
  FOR SELECT
  USING (
    owner_uid = auth.uid() OR owner_uid IS NULL -- Allow null for demo/testing
  );

-- Devices: No public insert (only via Edge Function with service role)
CREATE POLICY devices_no_insert ON devices
  FOR INSERT
  WITH CHECK (false);

-- Device Keys: Only service role can access (no user access)
CREATE POLICY device_keys_no_select ON device_keys
  FOR SELECT
  USING (false);

-- Readings: Users can view readings for their devices
CREATE POLICY readings_select_policy ON readings
  FOR SELECT
  USING (
    device_id IN (
      SELECT id FROM devices WHERE owner_uid = auth.uid() OR owner_uid IS NULL
    )
  );

-- Readings: No direct insert (only via Edge Function)
CREATE POLICY readings_no_insert ON readings
  FOR INSERT
  WITH CHECK (false);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to validate and insert reading (called by Edge Function)
CREATE OR REPLACE FUNCTION insert_reading(
  p_device_id UUID,
  p_ts_device TIMESTAMPTZ,
  p_temperature REAL,
  p_humidity REAL,
  p_pressure REAL,
  p_mq135_adc INTEGER,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_reading_id UUID;
BEGIN
  -- Insert reading
  INSERT INTO readings (
    device_id,
    ts_device,
    temperature,
    humidity,
    pressure,
    mq135_adc,
    metadata
  ) VALUES (
    p_device_id,
    p_ts_device,
    p_temperature,
    p_humidity,
    p_pressure,
    p_mq135_adc,
    p_metadata
  )
  RETURNING id INTO v_reading_id;
  
  -- Update device last_seen_at
  UPDATE devices
  SET last_seen_at = NOW()
  WHERE id = p_device_id;
  
  RETURN v_reading_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SEED DATA (Optional - for testing)
-- ============================================================================

-- Insert a demo device (run seed_device.ts instead for production)
-- INSERT INTO devices (id, name, device_type, location)
-- VALUES (
--   'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
--   'Demo ESP32',
--   'esp32',
--   'Indoor Farm - Bay 1'
-- );

-- ============================================================================
-- GRANTS (for service role)
-- ============================================================================

-- Service role needs full access for Edge Function
GRANT ALL ON devices TO service_role;
GRANT ALL ON device_keys TO service_role;
GRANT ALL ON readings TO service_role;
GRANT EXECUTE ON FUNCTION insert_reading TO service_role;

-- Anon role (for public web dashboard) gets read-only on devices and readings
GRANT SELECT ON devices TO anon;
GRANT SELECT ON readings TO anon;

-- ============================================================================
-- VIEWS (for dashboard queries)
-- ============================================================================

-- Latest reading per device
CREATE OR REPLACE VIEW latest_readings AS
SELECT DISTINCT ON (device_id)
  r.*,
  d.name as device_name,
  d.location as device_location
FROM readings r
JOIN devices d ON d.id = r.device_id
WHERE d.is_active = true
ORDER BY device_id, ts_server DESC;

GRANT SELECT ON latest_readings TO anon;
GRANT SELECT ON latest_readings TO authenticated;

-- Device health status
CREATE OR REPLACE VIEW device_health AS
SELECT
  d.id,
  d.name,
  d.location,
  d.is_active,
  d.last_seen_at,
  CASE
    WHEN d.last_seen_at > NOW() - INTERVAL '5 minutes' THEN 'online'
    WHEN d.last_seen_at > NOW() - INTERVAL '1 hour' THEN 'idle'
    ELSE 'offline'
  END as status,
  EXTRACT(EPOCH FROM (NOW() - d.last_seen_at)) / 60 as minutes_since_last_seen
FROM devices d;

GRANT SELECT ON device_health TO anon;
GRANT SELECT ON device_health TO authenticated;

-- ============================================================================
-- COMPLETION
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✓ Pravardha Phase 1 migration completed successfully';
  RAISE NOTICE '  - Tables created: devices, device_keys, readings';
  RAISE NOTICE '  - RLS policies enabled';
  RAISE NOTICE '  - Views created: latest_readings, device_health';
  RAISE NOTICE '  Next steps:';
  RAISE NOTICE '    1. Deploy Edge Function: supabase functions deploy ingest';
  RAISE NOTICE '    2. Seed device: cd scripts && npx tsx seed_device.ts';
  RAISE NOTICE '    3. Flash firmware with device credentials';
END $$;
