import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, type Batch, type Aggregate15m, type Device } from '../lib/supabaseClient';
import { format } from 'date-fns';

export default function Verify() {
    const { batchId } = useParams<{ batchId: string }>();
    const [batch, setBatch] = useState<Batch | null>(null);
    const [device, setDevice] = useState<Device | null>(null);
    const [aggregates, setAggregates] = useState<Aggregate15m[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!batchId) return;
        fetchBatchData();
    }, [batchId]);

    async function fetchBatchData() {
        const { data: batchData } = await supabase
            .from('batches')
            .select('*')
            .eq('id', batchId)
            .single();

        if (batchData) {
            setBatch(batchData);

            const { data: deviceData } = await supabase
                .from('devices')
                .select('*')
                .eq('id', batchData.device_id)
                .single();
            setDevice(deviceData);

            const { data: aggData } = await supabase
                .from('aggregates_15m')
                .select('*')
                .eq('device_id', batchData.device_id)
                .gte('window_start', batchData.start_ts)
                .lte('window_start', batchData.end_ts)
                .order('window_start');
            setAggregates(aggData || []);
        }
        setLoading(false);
    }

    // Fallback: compute overall summary from aggregates if batch doesn't have it
    // IMPORTANT: Hooks must be called unconditionally (before any early returns)
    const summary = useMemo(() => {
        if (!aggregates || aggregates.length === 0) return null;

        let tempMin: number | null = null;
        let tempMax: number | null = null;
        let tempWeightedSum = 0;
        let tempCount = 0;

        let humidityMin: number | null = null;
        let humidityMax: number | null = null;
        let humidityWeightedSum = 0;
        let humidityCount = 0;

        let pressureMin: number | null = null;
        let pressureMax: number | null = null;
        let pressureWeightedSum = 0;
        let pressureCount = 0;

        for (const a of aggregates) {
            // temperature
            if (a.temp_min != null) tempMin = tempMin == null ? a.temp_min : Math.min(tempMin, a.temp_min);
            if (a.temp_max != null) tempMax = tempMax == null ? a.temp_max : Math.max(tempMax, a.temp_max);
            if (a.temp_avg != null && a.sample_count > 0) {
                tempWeightedSum += a.temp_avg * a.sample_count;
                tempCount += a.sample_count;
            }

            // humidity
            if (a.humidity_min != null) humidityMin = humidityMin == null ? a.humidity_min : Math.min(humidityMin, a.humidity_min);
            if (a.humidity_max != null) humidityMax = humidityMax == null ? a.humidity_max : Math.max(humidityMax, a.humidity_max);
            if (a.humidity_avg != null && a.sample_count > 0) {
                humidityWeightedSum += a.humidity_avg * a.sample_count;
                humidityCount += a.sample_count;
            }

            // pressure
            if (a.pressure_min != null) pressureMin = pressureMin == null ? a.pressure_min : Math.min(pressureMin, a.pressure_min);
            if (a.pressure_max != null) pressureMax = pressureMax == null ? a.pressure_max : Math.max(pressureMax, a.pressure_max);
            if (a.pressure_avg != null && a.sample_count > 0) {
                pressureWeightedSum += a.pressure_avg * a.sample_count;
                pressureCount += a.sample_count;
            }
        }

        return {
            temperature: {
                min: tempMin,
                max: tempMax,
                avg: tempCount > 0 ? tempWeightedSum / tempCount : null,
            },
            humidity: {
                min: humidityMin,
                max: humidityMax,
                avg: humidityCount > 0 ? humidityWeightedSum / humidityCount : null,
            },
            pressure: {
                min: pressureMin,
                max: pressureMax,
                avg: pressureCount > 0 ? pressureWeightedSum / pressureCount : null,
            },
        } as const;
    }, [aggregates]);

    if (loading) return <div className="container"><div className="loading">Loading certificate...</div></div>;
    if (!batch) return <div className="container"><div className="error">Batch not found</div></div>;

    const anchoredCount = aggregates.filter(a => a.is_anchored).length;
    const totalWindows = aggregates.length;

    return (
        <div className="container">
            <div className="card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                <h1 style={{ color: 'white', marginBottom: '8px' }}>🌱 Environmental Certificate</h1>
                <p style={{ opacity: 0.9 }}>Verifiable on-chain proof of environmental conditions</p>
            </div>

            <div className="grid grid-2" style={{ marginBottom: '24px' }}>
                <div className="card">
                    <h3>Batch Information</h3>
                    <table style={{ width: '100%', marginTop: '16px' }}>
                        <tbody>
                            <tr><td style={{ padding: '8px 0', fontWeight: 600 }}>Batch Name:</td><td>{batch.name || 'Unnamed'}</td></tr>
                            <tr><td style={{ padding: '8px 0', fontWeight: 600 }}>Device:</td><td>{device?.name} - {device?.location}</td></tr>
                            <tr><td style={{ padding: '8px 0', fontWeight: 600 }}>Time Period:</td><td>{format(new Date(batch.start_ts), 'PPpp')} to {format(new Date(batch.end_ts), 'PPpp')}</td></tr>
                            <tr><td style={{ padding: '8px 0', fontWeight: 600 }}>Status:</td><td><span className={`badge badge-${batch.status === 'certified' ? 'success' : 'warning'}`}>{batch.status}</span></td></tr>
                            <tr><td style={{ padding: '8px 0', fontWeight: 600 }}>Total Samples:</td><td>{batch.total_samples || aggregates.reduce((sum, a) => sum + a.sample_count, 0)}</td></tr>
                        </tbody>
                    </table>
                </div>

                <div className="card">
                    <h3>On-Chain Verification</h3>
                    <div style={{ marginTop: '16px' }}>
                        {anchoredCount === totalWindows && totalWindows > 0 ? (
                            <div style={{ padding: '16px', background: '#d1fae5', borderRadius: '8px' }}>
                                <div style={{ fontSize: '48px', textAlign: 'center' }}>✅</div>
                                <p style={{ textAlign: 'center', fontWeight: 600, color: '#065f46', marginTop: '8px' }}>
                                    Fully Verified
                                </p>
                                <p style={{ textAlign: 'center', color: '#059669', fontSize: '14px', marginTop: '4px' }}>
                                    All {totalWindows} windows anchored on Solana
                                </p>
                            </div>
                        ) : (
                            <div style={{ padding: '16px', background: '#fef3c7', borderRadius: '8px' }}>
                                <div style={{ fontSize: '48px', textAlign: 'center' }}>⏳</div>
                                <p style={{ textAlign: 'center', fontWeight: 600, color: '#92400e', marginTop: '8px' }}>
                                    Partially Verified
                                </p>
                                <p style={{ textAlign: 'center', color: '#d97706', fontSize: '14px', marginTop: '4px' }}>
                                    {anchoredCount} of {totalWindows} windows anchored
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="card">
                <h3>Environmental Summary</h3>
                <div className="grid grid-3" style={{ marginTop: '16px' }}>
                    <div className="stat-card">
                        <div className="stat-label">Temperature Range</div>
                        <div className="stat-value" style={{ fontSize: '20px' }}>
                            {(batch.temp_overall_min ?? summary?.temperature.min)?.toFixed?.(1) || '--'} - {(batch.temp_overall_max ?? summary?.temperature.max)?.toFixed?.(1) || '--'} °C
                        </div>
                        <div className="stat-label">Avg: {(batch.temp_overall_avg ?? summary?.temperature.avg)?.toFixed?.(1) || '--'} °C</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Humidity Range</div>
                        <div className="stat-value" style={{ fontSize: '20px' }}>
                            {(batch.humidity_overall_min ?? summary?.humidity.min)?.toFixed?.(1) || '--'} - {(batch.humidity_overall_max ?? summary?.humidity.max)?.toFixed?.(1) || '--'} %
                        </div>
                        <div className="stat-label">Avg: {(batch.humidity_overall_avg ?? summary?.humidity.avg)?.toFixed?.(1) || '--'} %</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Pressure Range</div>
                        <div className="stat-value" style={{ fontSize: '20px' }}>
                            {(batch.pressure_overall_min ?? summary?.pressure.min)?.toFixed?.(0) || '--'} - {(batch.pressure_overall_max ?? summary?.pressure.max)?.toFixed?.(0) || '--'} hPa
                        </div>
                        <div className="stat-label">Avg: {(batch.pressure_overall_avg ?? summary?.pressure.avg)?.toFixed?.(0) || '--'} hPa</div>
                    </div>
                </div>
            </div>

            <div className="card">
                <h3>15-Minute Aggregate Windows</h3>
                <table style={{ width: '100%', marginTop: '16px', fontSize: '14px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                            <th style={{ padding: '8px' }}>Window Start</th>
                            <th style={{ padding: '8px' }}>Samples</th>
                            <th style={{ padding: '8px' }}>Temp Avg (°C)</th>
                            <th style={{ padding: '8px' }}>Humidity Avg (%)</th>
                            <th style={{ padding: '8px' }}>On-Chain</th>
                            <th style={{ padding: '8px' }}>Tx</th>
                        </tr>
                    </thead>
                    <tbody>
                        {aggregates.map(agg => (
                            <tr key={agg.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '8px' }}>{format(new Date(agg.window_start), 'MMM d HH:mm')}</td>
                                <td style={{ padding: '8px' }}>{agg.sample_count}</td>
                                <td style={{ padding: '8px' }}>{agg.temp_avg?.toFixed(1) || '--'}</td>
                                <td style={{ padding: '8px' }}>{agg.humidity_avg?.toFixed(1) || '--'}</td>
                                <td style={{ padding: '8px' }}>
                                    {agg.is_anchored ? (
                                        <span className="badge badge-success">✓ Anchored</span>
                                    ) : (
                                        <span className="badge badge-warning">Pending</span>
                                    )}
                                </td>
                                <td style={{ padding: '8px' }}>
                                    {agg.anchor_tx_signature && (
                                        <a
                                            href={`https://explorer.solana.com/tx/${agg.anchor_tx_signature}?cluster=devnet`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#3b82f6', fontSize: '12px' }}
                                        >
                                            View →
                                        </a>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="card" style={{ marginTop: '24px', background: '#f9fafb' }}>
                <h3>About This Certificate</h3>
                <p style={{ color: '#6b7280', lineHeight: '1.6', marginTop: '8px' }}>
                    This certificate represents verified environmental data collected from IoT sensors and anchored on the Solana blockchain.
                    Each 15-minute aggregate window includes a Merkle root computed from raw sensor readings, providing tamper-proof verification.
                    Anyone can independently verify the data integrity by recomputing Merkle roots from the underlying readings table.
                </p>
            </div>
        </div>
    );
}
