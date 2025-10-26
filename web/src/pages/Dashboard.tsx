import { useEffect, useState } from 'react';
import { supabase, type Device, type Reading } from '../lib/supabaseClient';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

export default function Dashboard() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const [readings, setReadings] = useState<Reading[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Fetch devices
    useEffect(() => {
        async function fetchDevices() {
            const { data, error } = await supabase
                .from('devices')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching devices:', error);
                setError(error.message);
            } else if (data && data.length > 0) {
                setDevices(data);
                setSelectedDeviceId(data[0].id);
            } else {
                setError('No active devices found. Run scripts/seed_device.ts to create one.');
            }
            setLoading(false);
        }

        fetchDevices();
    }, []);

    // Fetch readings for selected device
    useEffect(() => {
        if (!selectedDeviceId) return;

        async function fetchReadings() {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            const { data, error } = await supabase
                .from('readings')
                .select('*')
                .eq('device_id', selectedDeviceId)
                .gte('ts_server', twentyFourHoursAgo)
                .order('ts_server', { ascending: true });

            if (error) {
                console.error('Error fetching readings:', error);
            } else {
                setReadings(data || []);
            }
        }

        fetchReadings();

        // Auto-refresh every 30 seconds
        if (autoRefresh) {
            const interval = setInterval(fetchReadings, 30000);
            return () => clearInterval(interval);
        }
    }, [selectedDeviceId, autoRefresh]);

    if (loading) {
        return <div className="container"><div className="loading">Loading...</div></div>;
    }

    if (error) {
        return (
            <div className="container">
                <div className="error">{error}</div>
            </div>
        );
    }

    const selectedDevice = devices.find(d => d.id === selectedDeviceId);
    const lastReading = readings[readings.length - 1];

    // Consider a device online if it has checked in within the last 5 minutes
    const isOnline = (() => {
        const lastSeen = selectedDevice?.last_seen_at ? new Date(selectedDevice.last_seen_at).getTime() : null;
        if (!lastSeen) return false;
        const fiveMinutes = 5 * 60 * 1000;
        return Date.now() - lastSeen <= fiveMinutes;
    })();

    // Prepare chart data
    const chartData = readings.map(r => ({
        time: format(new Date(r.ts_server), 'HH:mm'),
        temperature: r.temperature,
        humidity: r.humidity,
        pressure: r.pressure,
        mq135: r.mq135_adc,
    }));

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1>Dashboard</h1>
                    <p style={{ color: '#6b7280', marginTop: '4px' }}>Live environmental monitoring</p>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                    />
                    Auto-refresh (30s)
                </label>
            </div>

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                        <label style={{ fontWeight: 600, marginRight: '12px' }}>Device:</label>
                        <select
                            value={selectedDeviceId}
                            onChange={(e) => setSelectedDeviceId(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                        >
                            {devices.map(device => (
                                <option key={device.id} value={device.id}>
                                    {device.name} - {device.location}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        {isOnline ? (
                            <span className="badge badge-success">Online</span>
                        ) : (
                            <span className="badge badge-error">Offline</span>
                        )}
                    </div>
                </div>
            </div>

            {readings.length === 0 ? (
                <div className="card">
                    <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0' }}>
                        No readings in the last 24 hours. Check that your device is online and sending data.
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-4" style={{ marginBottom: '24px' }}>
                        <div className="stat-card">
                            <div className="stat-value">
                                {lastReading?.temperature?.toFixed(1) || '--'}
                                <span className="stat-unit">°C</span>
                            </div>
                            <div className="stat-label">Temperature</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">
                                {lastReading?.humidity?.toFixed(1) || '--'}
                                <span className="stat-unit">%</span>
                            </div>
                            <div className="stat-label">Humidity</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">
                                {lastReading?.pressure?.toFixed(1) || '--'}
                                <span className="stat-unit">hPa</span>
                            </div>
                            <div className="stat-label">Pressure</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{lastReading?.mq135_adc || '--'}</div>
                            <div className="stat-label">MQ135 ADC</div>
                        </div>
                    </div>

                    <div className="card">
                        <h3>Temperature & Humidity (24h)</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="time" />
                                <YAxis yAxisId="left" />
                                <YAxis yAxisId="right" orientation="right" />
                                <Tooltip />
                                <Legend />
                                <Line yAxisId="left" type="monotone" dataKey="temperature" stroke="#ef4444" name="Temperature (°C)" />
                                <Line yAxisId="right" type="monotone" dataKey="humidity" stroke="#3b82f6" name="Humidity (%)" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="grid grid-2">
                        <div className="card">
                            <h3>Pressure (24h)</h3>
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="time" />
                                    <YAxis />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="pressure" stroke="#10b981" name="Pressure (hPa)" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="card">
                            <h3>Air Quality ADC (24h)</h3>
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="time" />
                                    <YAxis />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="mq135" stroke="#f59e0b" name="MQ135 ADC" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="card" style={{ marginTop: '24px' }}>
                        <p style={{ color: '#6b7280', fontSize: '14px' }}>
                            📊 Showing {readings.length} readings from the last 24 hours
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
