import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Device = {
    id: string;
    name: string;
    device_type: string;
    location: string;
    is_active: boolean;
    last_seen_at: string | null;
    created_at: string;
};

export type Reading = {
    id: string;
    device_id: string;
    ts_device: string | null;
    ts_server: string;
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
    mq135_adc: number | null;
    mq135_ppm: number | null;
};

export type Aggregate15m = {
    id: string;
    device_id: string;
    window_start: string;
    window_end: string;
    temp_min: number | null;
    temp_max: number | null;
    temp_avg: number | null;
    humidity_min: number | null;
    humidity_max: number | null;
    humidity_avg: number | null;
    pressure_min: number | null;
    pressure_max: number | null;
    pressure_avg: number | null;
    mq135_adc_min: number | null;
    mq135_adc_max: number | null;
    mq135_adc_avg: number | null;
    sample_count: number;
    merkle_root_hex: string | null;
    is_anchored: boolean;
    anchor_tx_signature: string | null;
    anchor_pda: string | null;
};

export type Batch = {
    id: string;
    device_id: string;
    name: string | null;
    description: string | null;
    start_ts: string;
    end_ts: string;
    status: 'open' | 'closed' | 'certified' | 'revoked';
    total_windows: number | null;
    total_samples: number | null;
    temp_overall_min: number | null;
    temp_overall_max: number | null;
    temp_overall_avg: number | null;
    humidity_overall_min: number | null;
    humidity_overall_max: number | null;
    humidity_overall_avg: number | null;
    certificate_url: string | null;
    created_at: string;
    closed_at: string | null;
    certified_at: string | null;
};
