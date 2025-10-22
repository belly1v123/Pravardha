-- Pravardha IoT Platform - Aggregation & Batch Certification
-- Phase 2: 15-minute aggregates and batch certificate system

-- ============================================================================
-- AGGREGATES_15M TABLE (15-minute window aggregates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS aggregates_15m (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  
  -- Time window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  
  -- Aggregated stats: Temperature
  temp_min REAL,
  temp_max REAL,
  temp_avg REAL,
  temp_stddev REAL,
  
  -- Aggregated stats: Humidity
  humidity_min REAL,
  humidity_max REAL,
  humidity_avg REAL,
  humidity_stddev REAL,
  
  -- Aggregated stats: Pressure
  pressure_min REAL,
  pressure_max REAL,
  pressure_avg REAL,
  pressure_stddev REAL,
  
  -- Aggregated stats: MQ135 (ADC)
  mq135_adc_min INTEGER,
  mq135_adc_max INTEGER,
  mq135_adc_avg REAL,
  mq135_adc_stddev REAL,
  
  -- Sample metadata
  sample_count INTEGER NOT NULL DEFAULT 0,
  first_sample_ts TIMESTAMPTZ,
  last_sample_ts TIMESTAMPTZ,
  
  -- Data integrity (Phase 3: Merkle root for on-chain verification)
  merkle_root_hex TEXT, -- SHA-256 Merkle root of all reading IDs in window
  offchain_uri TEXT, -- Optional: Arweave/Shadow Drive URI for full data
  
  -- On-chain status
  is_anchored BOOLEAN DEFAULT false,
  anchor_tx_signature TEXT, -- Solana transaction signature
  anchor_pda TEXT, -- Solana PDA address
  anchored_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE UNIQUE INDEX idx_aggregates_device_window ON aggregates_15m(device_id, window_start);
CREATE INDEX idx_aggregates_window_start ON aggregates_15m(window_start DESC);
CREATE INDEX idx_aggregates_anchored ON aggregates_15m(is_anchored, window_start DESC);

COMMENT ON TABLE aggregates_15m IS '15-minute aggregated sensor data windows';

-- ============================================================================
-- BATCHES TABLE (Batch certification for customer/insurance)
-- ============================================================================
CREATE TABLE IF NOT EXISTS batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  
  -- Batch metadata
  name TEXT,
  description TEXT,
  
  -- Time range
  start_ts TIMESTAMPTZ NOT NULL,
  end_ts TIMESTAMPTZ NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'certified', 'revoked')),
  
  -- Batch statistics (computed on close)
  total_windows INTEGER,
  total_samples INTEGER,
  
  temp_overall_min REAL,
  temp_overall_max REAL,
  temp_overall_avg REAL,
  
  humidity_overall_min REAL,
  humidity_overall_max REAL,
  humidity_overall_avg REAL,
  
  pressure_overall_min REAL,
  pressure_overall_max REAL,
  pressure_overall_avg REAL,
  
  -- Certification
  certificate_url TEXT, -- Public certificate page URL
  certificate_hash TEXT, -- Hash of batch data for tamper detection
  
  -- Ownership (for multi-tenant)
  owner_uid UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  certified_at TIMESTAMPTZ
);

CREATE INDEX idx_batches_device ON batches(device_id);
CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_batches_time_range ON batches(device_id, start_ts, end_ts);

COMMENT ON TABLE batches IS 'Batch certifications for time ranges';

-- ============================================================================
-- BATCH_WINDOWS TABLE (Links batches to aggregate windows)
-- ============================================================================
CREATE TABLE IF NOT EXISTS batch_windows (
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  aggregate_id UUID NOT NULL REFERENCES aggregates_15m(id) ON DELETE CASCADE,
  
  PRIMARY KEY (batch_id, aggregate_id)
);

CREATE INDEX idx_batch_windows_batch ON batch_windows(batch_id);
CREATE INDEX idx_batch_windows_aggregate ON batch_windows(aggregate_id);

COMMENT ON TABLE batch_windows IS 'Many-to-many relationship between batches and aggregate windows';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE aggregates_15m ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_windows ENABLE ROW LEVEL SECURITY;

-- Aggregates: Users can view aggregates for their devices
CREATE POLICY aggregates_select_policy ON aggregates_15m
  FOR SELECT
  USING (
    device_id IN (
      SELECT id FROM devices WHERE owner_uid = auth.uid() OR owner_uid IS NULL
    )
  );

-- Aggregates: No direct insert (only via cron function)
CREATE POLICY aggregates_no_insert ON aggregates_15m
  FOR INSERT
  WITH CHECK (false);

-- Batches: Users can view their own batches
CREATE POLICY batches_select_policy ON batches
  FOR SELECT
  USING (owner_uid = auth.uid() OR owner_uid IS NULL);

-- Batches: Users can insert their own batches
CREATE POLICY batches_insert_policy ON batches
  FOR INSERT
  WITH CHECK (owner_uid = auth.uid() OR owner_uid IS NULL);

-- Batches: Users can update their own batches
CREATE POLICY batches_update_policy ON batches
  FOR UPDATE
  USING (owner_uid = auth.uid() OR owner_uid IS NULL);

-- Batch windows: Follow batch visibility
CREATE POLICY batch_windows_select_policy ON batch_windows
  FOR SELECT
  USING (
    batch_id IN (SELECT id FROM batches WHERE owner_uid = auth.uid() OR owner_uid IS NULL)
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Trigger to update updated_at on aggregates
CREATE TRIGGER aggregates_updated_at
  BEFORE UPDATE ON aggregates_15m
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to compute 15-minute aggregate for a device and time window
CREATE OR REPLACE FUNCTION compute_15m_aggregate(
  p_device_id UUID,
  p_window_start TIMESTAMPTZ
)
RETURNS UUID AS $$
DECLARE
  v_aggregate_id UUID;
  v_window_end TIMESTAMPTZ;
BEGIN
  v_window_end := p_window_start + INTERVAL '15 minutes';
  
  -- Insert or update aggregate
  INSERT INTO aggregates_15m (
    device_id,
    window_start,
    window_end,
    temp_min,
    temp_max,
    temp_avg,
    temp_stddev,
    humidity_min,
    humidity_max,
    humidity_avg,
    humidity_stddev,
    pressure_min,
    pressure_max,
    pressure_avg,
    pressure_stddev,
    mq135_adc_min,
    mq135_adc_max,
    mq135_adc_avg,
    mq135_adc_stddev,
    sample_count,
    first_sample_ts,
    last_sample_ts
  )
  SELECT
    p_device_id,
    p_window_start,
    v_window_end,
    MIN(temperature),
    MAX(temperature),
    AVG(temperature),
    STDDEV(temperature),
    MIN(humidity),
    MAX(humidity),
    AVG(humidity),
    STDDEV(humidity),
    MIN(pressure),
    MAX(pressure),
    AVG(pressure),
    STDDEV(pressure),
    MIN(mq135_adc),
    MAX(mq135_adc),
    AVG(mq135_adc),
    STDDEV(mq135_adc),
    COUNT(*),
    MIN(ts_server),
    MAX(ts_server)
  FROM readings
  WHERE device_id = p_device_id
    AND ts_server >= p_window_start
    AND ts_server < v_window_end
  HAVING COUNT(*) > 0
  ON CONFLICT (device_id, window_start)
  DO UPDATE SET
    temp_min = EXCLUDED.temp_min,
    temp_max = EXCLUDED.temp_max,
    temp_avg = EXCLUDED.temp_avg,
    temp_stddev = EXCLUDED.temp_stddev,
    humidity_min = EXCLUDED.humidity_min,
    humidity_max = EXCLUDED.humidity_max,
    humidity_avg = EXCLUDED.humidity_avg,
    humidity_stddev = EXCLUDED.humidity_stddev,
    pressure_min = EXCLUDED.pressure_min,
    pressure_max = EXCLUDED.pressure_max,
    pressure_avg = EXCLUDED.pressure_avg,
    pressure_stddev = EXCLUDED.pressure_stddev,
    mq135_adc_min = EXCLUDED.mq135_adc_min,
    mq135_adc_max = EXCLUDED.mq135_adc_max,
    mq135_adc_avg = EXCLUDED.mq135_adc_avg,
    mq135_adc_stddev = EXCLUDED.mq135_adc_stddev,
    sample_count = EXCLUDED.sample_count,
    first_sample_ts = EXCLUDED.first_sample_ts,
    last_sample_ts = EXCLUDED.last_sample_ts,
    updated_at = NOW()
  RETURNING id INTO v_aggregate_id;
  
  RETURN v_aggregate_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION compute_15m_aggregate TO service_role;

-- Function to close a batch and compute overall stats
CREATE OR REPLACE FUNCTION close_batch(p_batch_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE batches
  SET
    status = 'closed',
    closed_at = NOW(),
    total_windows = (
      SELECT COUNT(*) FROM batch_windows WHERE batch_id = p_batch_id
    ),
    total_samples = (
      SELECT SUM(a.sample_count)
      FROM batch_windows bw
      JOIN aggregates_15m a ON a.id = bw.aggregate_id
      WHERE bw.batch_id = p_batch_id
    ),
    temp_overall_min = (
      SELECT MIN(a.temp_min)
      FROM batch_windows bw
      JOIN aggregates_15m a ON a.id = bw.aggregate_id
      WHERE bw.batch_id = p_batch_id
    ),
    temp_overall_max = (
      SELECT MAX(a.temp_max)
      FROM batch_windows bw
      JOIN aggregates_15m a ON a.id = bw.aggregate_id
      WHERE bw.batch_id = p_batch_id
    ),
    temp_overall_avg = (
      SELECT AVG(a.temp_avg)
      FROM batch_windows bw
      JOIN aggregates_15m a ON a.id = bw.aggregate_id
      WHERE bw.batch_id = p_batch_id
    ),
    humidity_overall_min = (
      SELECT MIN(a.humidity_min)
      FROM batch_windows bw
      JOIN aggregates_15m a ON a.id = bw.aggregate_id
      WHERE bw.batch_id = p_batch_id
    ),
    humidity_overall_max = (
      SELECT MAX(a.humidity_max)
      FROM batch_windows bw
      JOIN aggregates_15m a ON a.id = bw.aggregate_id
      WHERE bw.batch_id = p_batch_id
    ),
    humidity_overall_avg = (
      SELECT AVG(a.humidity_avg)
      FROM batch_windows bw
      JOIN aggregates_15m a ON a.id = bw.aggregate_id
      WHERE bw.batch_id = p_batch_id
    ),
    pressure_overall_min = (
      SELECT MIN(a.pressure_min)
      FROM batch_windows bw
      JOIN aggregates_15m a ON a.id = bw.aggregate_id
      WHERE bw.batch_id = p_batch_id
    ),
    pressure_overall_max = (
      SELECT MAX(a.pressure_max)
      FROM batch_windows bw
      JOIN aggregates_15m a ON a.id = bw.aggregate_id
      WHERE bw.batch_id = p_batch_id
    ),
    pressure_overall_avg = (
      SELECT AVG(a.pressure_avg)
      FROM batch_windows bw
      JOIN aggregates_15m a ON a.id = bw.aggregate_id
      WHERE bw.batch_id = p_batch_id
    )
  WHERE id = p_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION close_batch TO authenticated;
GRANT EXECUTE ON FUNCTION close_batch TO service_role;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Recent aggregates with device info
CREATE OR REPLACE VIEW recent_aggregates AS
SELECT
  a.*,
  d.name as device_name,
  d.location as device_location
FROM aggregates_15m a
JOIN devices d ON d.id = a.device_id
WHERE a.window_start > NOW() - INTERVAL '7 days'
ORDER BY a.window_start DESC;

GRANT SELECT ON recent_aggregates TO anon;
GRANT SELECT ON recent_aggregates TO authenticated;

-- View: Batch summary with window count
CREATE OR REPLACE VIEW batch_summary AS
SELECT
  b.*,
  d.name as device_name,
  d.location as device_location,
  COUNT(bw.aggregate_id) as window_count,
  COUNT(CASE WHEN a.is_anchored THEN 1 END) as anchored_count
FROM batches b
JOIN devices d ON d.id = b.device_id
LEFT JOIN batch_windows bw ON bw.batch_id = b.id
LEFT JOIN aggregates_15m a ON a.id = bw.aggregate_id
GROUP BY b.id, d.name, d.location;

GRANT SELECT ON batch_summary TO anon;
GRANT SELECT ON batch_summary TO authenticated;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT ALL ON aggregates_15m TO service_role;
GRANT ALL ON batches TO service_role;
GRANT ALL ON batch_windows TO service_role;

GRANT SELECT ON aggregates_15m TO anon;
GRANT SELECT ON aggregates_15m TO authenticated;

GRANT SELECT, INSERT, UPDATE ON batches TO authenticated;
GRANT SELECT ON batches TO anon; -- For public certificate pages

GRANT SELECT, INSERT ON batch_windows TO authenticated;
GRANT SELECT ON batch_windows TO anon;

-- ============================================================================
-- COMPLETION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Pravardha Phase 2 migration completed successfully';
  RAISE NOTICE '  - Tables created: aggregates_15m, batches, batch_windows';
  RAISE NOTICE '  - Functions: compute_15m_aggregate, close_batch';
  RAISE NOTICE '  - Views: recent_aggregates, batch_summary';
  RAISE NOTICE '  Next steps:';
  RAISE NOTICE '    1. Deploy cron_rollup function: supabase functions deploy cron_rollup';
  RAISE NOTICE '    2. Configure cron: */15 * * * * (every 15 minutes)';
  RAISE NOTICE '    3. Or run manually: SELECT compute_15m_aggregate(device_id, window_start)';
END $$;
