import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, type Device, type Batch } from '../lib/supabaseClient';
import { format } from 'date-fns';

export default function Batches() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);

    const [formData, setFormData] = useState({
        device_id: '',
        name: '',
        description: '',
        start_ts: '',
        end_ts: '',
    });

    useEffect(() => {
        fetchDevices();
        fetchBatches();
    }, []);

    async function fetchDevices() {
        const { data } = await supabase.from('devices').select('*').eq('is_active', true);
        if (data) {
            setDevices(data);
            if (data.length > 0 && !formData.device_id) {
                setFormData(prev => ({ ...prev, device_id: data[0].id }));
            }
        }
    }

    async function fetchBatches() {
        const { data } = await supabase
            .from('batches')
            .select('*')
            .order('created_at', { ascending: false });
        if (data) setBatches(data);
        setLoading(false);
    }

    async function handleCreate() {
        const { error } = await supabase.from('batches').insert({
            device_id: formData.device_id,
            name: formData.name,
            description: formData.description,
            start_ts: formData.start_ts,
            end_ts: formData.end_ts,
            status: 'open',
        });

        if (!error) {
            setShowCreate(false);
            fetchBatches();
            setFormData({ device_id: '', name: '', description: '', start_ts: '', end_ts: '' });
        }
    }

    if (loading) return <div className="container"><div className="loading">Loading...</div></div>;

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                    <h1>Batches</h1>
                    <p style={{ color: '#6b7280', marginTop: '4px' }}>Create and manage certification batches</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
                    {showCreate ? 'Cancel' : '+ Create Batch'}
                </button>
            </div>

            {showCreate && (
                <div className="card" style={{ marginBottom: '24px' }}>
                    <h3>Create New Batch</h3>
                    <div style={{ display: 'grid', gap: '16px', marginTop: '16px' }}>
                        <div>
                            <label>Device</label>
                            <select
                                value={formData.device_id}
                                onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                                style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                            >
                                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label>Batch Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g., October Harvest Batch"
                                style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                            />
                        </div>
                        <div>
                            <label>Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Optional description"
                                rows={3}
                                style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label>Start Time</label>
                                <input
                                    type="datetime-local"
                                    value={formData.start_ts}
                                    onChange={(e) => setFormData({ ...formData, start_ts: e.target.value })}
                                    style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                                />
                            </div>
                            <div>
                                <label>End Time</label>
                                <input
                                    type="datetime-local"
                                    value={formData.end_ts}
                                    onChange={(e) => setFormData({ ...formData, end_ts: e.target.value })}
                                    style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                                />
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={handleCreate}>Create Batch</button>
                    </div>
                </div>
            )}

            <div className="card">
                <h3>All Batches</h3>
                {batches.length === 0 ? (
                    <p style={{ color: '#6b7280', padding: '20px 0' }}>No batches yet. Create your first batch above.</p>
                ) : (
                    <table style={{ width: '100%', marginTop: '16px', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                <th style={{ padding: '12px' }}>Name</th>
                                <th style={{ padding: '12px' }}>Status</th>
                                <th style={{ padding: '12px' }}>Time Range</th>
                                <th style={{ padding: '12px' }}>Created</th>
                                <th style={{ padding: '12px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {batches.map(batch => (
                                <tr key={batch.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '12px' }}>{batch.name || 'Unnamed'}</td>
                                    <td style={{ padding: '12px' }}>
                                        <span className={`badge badge-${batch.status === 'open' ? 'warning' : 'success'}`}>
                                            {batch.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px', fontSize: '14px' }}>
                                        {format(new Date(batch.start_ts), 'MMM d HH:mm')} - {format(new Date(batch.end_ts), 'MMM d HH:mm')}
                                    </td>
                                    <td style={{ padding: '12px', fontSize: '14px' }}>
                                        {format(new Date(batch.created_at), 'MMM d, yyyy')}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <Link to={`/verify/${batch.id}`} className="btn btn-primary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                                            View Certificate
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
