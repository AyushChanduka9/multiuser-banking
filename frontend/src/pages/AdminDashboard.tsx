import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { adminApi, otpApi } from '../services/api';
import './CustomerDashboard.css';

interface Account {
    id: string;
    accountNumber: string;
    fullName: string;
    email: string;
    mobile: string;
    tier: string;
    balance: string;
    createdAt: string;
}

interface QueueItem {
    id: string;
    effectivePriority: number;
}

interface LockedItem {
    id: string;
    unlockAt: string;
    transaction: {
        amount: string;
        fromAccount: { accountNumber: string };
        toAccount: { accountNumber: string };
    };
}

interface PendingTransaction {
    id: string;
    amount: string;
    status: string;
    urgency: string;
    effectivePriority: number | null;
    basePriority: number;
    createdAt: string;
    fromAccount: { accountNumber: string; tier: string };
    toAccount: { accountNumber: string };
}

export default function AdminDashboard() {
    const { logout } = useAuth();
    const { socket, isConnected } = useSocket();

    const [accounts, setAccounts] = useState<Account[]>([]);
    const [, setQueueStats] = useState<{ queueSize: number; topItems: QueueItem[] }>({ queueSize: 0, topItems: [] });
    const [lockedItems, setLockedItems] = useState<LockedItem[]>([]);
    const [pending, setPending] = useState<PendingTransaction[]>([]);
    const [loading, setLoading] = useState(true);

    // Account creation form
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [formData, setFormData] = useState({
        fullName: '',
        aadhaar: '',
        pan: '',
        mobile: '',
        email: '',
        tier: 'BASIC',
        initialDeposit: 1000,
    });
    const [otpSent, setOtpSent] = useState(false);
    const [, setOtpData] = useState({ mobile: '', email: '' });
    const [mobileOtp, setMobileOtp] = useState('');
    const [emailOtp, setEmailOtp] = useState('');
    const [mobileVerified, setMobileVerified] = useState(false);
    const [emailVerified, setEmailVerified] = useState(false);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');

    const fetchData = useCallback(async () => {
        try {
            const [accountsRes, queuesRes, pendingRes] = await Promise.all([
                adminApi.getAccounts(),
                adminApi.getQueues(),
                adminApi.getPending(),
            ]);
            setAccounts(accountsRes.data.accounts);
            setQueueStats(queuesRes.data.priorityQueue);
            setLockedItems(queuesRes.data.timelockHeap);
            setPending(pendingRes.data.pending);
        } catch (err) {
            console.error('Failed to fetch data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    useEffect(() => {
        if (socket) {
            socket.on('queue:update', fetchData);
            socket.on('queue:stats', (stats) => setQueueStats(stats));
            socket.on('timelock:update', fetchData);
            socket.on('transaction:new', fetchData);

            return () => {
                socket.off('queue:update');
                socket.off('queue:stats');
                socket.off('timelock:update');
                socket.off('transaction:new');
            };
        }
    }, [socket, fetchData]);

    const handleSendOtp = async () => {
        setFormError('');
        try {
            const response = await otpApi.send(formData.mobile, formData.email);
            setOtpSent(true);
            setOtpData(response.data.demo);
            setFormSuccess('OTP sent! Check console for demo OTPs.');
        } catch (err: any) {
            setFormError(err.response?.data?.error || 'Failed to send OTP');
        }
    };

    const handleVerifyMobileOtp = async () => {
        try {
            await otpApi.verify(formData.mobile, mobileOtp, 'SMS');
            setMobileVerified(true);
        } catch (err: any) {
            setFormError(err.response?.data?.error || 'Invalid mobile OTP');
        }
    };

    const handleVerifyEmailOtp = async () => {
        try {
            await otpApi.verify(formData.email, emailOtp, 'EMAIL');
            setEmailVerified(true);
        } catch (err: any) {
            setFormError(err.response?.data?.error || 'Invalid email OTP');
        }
    };

    const handleCreateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');

        if (!mobileVerified || !emailVerified) {
            setFormError('Please verify both mobile and email OTPs first');
            return;
        }

        try {
            const response = await adminApi.createAccount(formData);
            setFormSuccess(`Account created! Account Number: ${response.data.account.accountNumber}`);
            setFormData({ fullName: '', aadhaar: '', pan: '', mobile: '', email: '', tier: 'BASIC', initialDeposit: 1000 });
            setOtpSent(false);
            setMobileVerified(false);
            setEmailVerified(false);
            setMobileOtp('');
            setEmailOtp('');
            fetchData();
        } catch (err: any) {
            setFormError(err.response?.data?.error || 'Failed to create account');
        }
    };

    const handleProcessNext = async () => {
        if (pending.length === 0) {
            alert('No pending transactions to process');
            return;
        }
        try {
            await adminApi.processNext();
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to process');
        }
    };

    const formatCurrency = (value: string) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
        }).format(parseFloat(value));
    };

    const getCountdown = (unlockAt: string) => {
        const diff = new Date(unlockAt).getTime() - Date.now();
        if (diff <= 0) return 'Unlocking...';
        return `${Math.ceil(diff / 1000)}s`;
    };

    if (loading) {
        return (
            <div className="page flex items-center justify-center">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="dashboard-page">
            <header className="dashboard-header">
                <div className="header-left">
                    <h1>🏦 NEXUS Admin</h1>
                    <span className={`connection-status ${isConnected ? 'connected' : ''}`}>
                        {isConnected ? '● Live' : '○ Offline'}
                    </span>
                </div>
                <div className="header-right">
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className="btn btn-primary"
                    >
                        + Create Account
                    </button>
                    <button onClick={logout} className="btn btn-secondary">
                        Logout
                    </button>
                </div>
            </header>

            <main className="dashboard-content">
                {showCreateForm && (
                    <div className="card mb-lg animate-fade-in">
                        <h3 className="mb-md">Create New Customer Account</h3>

                        {formError && <div className="alert alert-danger">{formError}</div>}
                        {formSuccess && <div className="alert alert-success">{formSuccess}</div>}

                        <form onSubmit={handleCreateAccount}>
                            <div className="grid grid-2 gap-md">
                                <div className="form-group">
                                    <label>Full Name</label>
                                    <input
                                        type="text"
                                        value={formData.fullName}
                                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                        placeholder="John Doe"
                                        required
                                        disabled={otpSent}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Aadhaar Number</label>
                                    <input
                                        type="text"
                                        value={formData.aadhaar}
                                        onChange={(e) => setFormData({ ...formData, aadhaar: e.target.value })}
                                        placeholder="12-digit Aadhaar"
                                        maxLength={12}
                                        required
                                        disabled={otpSent}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>PAN</label>
                                    <input
                                        type="text"
                                        value={formData.pan}
                                        onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                                        placeholder="ABCDE1234F"
                                        maxLength={10}
                                        required
                                        disabled={otpSent}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Mobile</label>
                                    <input
                                        type="tel"
                                        value={formData.mobile}
                                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                                        placeholder="10-digit mobile"
                                        maxLength={10}
                                        required
                                        disabled={otpSent}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="email@example.com"
                                        required
                                        disabled={otpSent}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Tier</label>
                                    <select
                                        value={formData.tier}
                                        onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                                        disabled={otpSent}
                                    >
                                        <option value="BASIC">Basic</option>
                                        <option value="PREMIUM">Premium</option>
                                        <option value="VIP">VIP</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Initial Deposit (Min ₹1000)</label>
                                    <input
                                        type="number"
                                        value={formData.initialDeposit}
                                        onChange={(e) => setFormData({ ...formData, initialDeposit: parseInt(e.target.value) || 0 })}
                                        placeholder="1000"
                                        min="1000"
                                        required
                                        disabled={otpSent}
                                    />
                                </div>
                            </div>

                            {!otpSent ? (
                                <button type="button" onClick={handleSendOtp} className="btn btn-primary mt-md">
                                    Send OTP
                                </button>
                            ) : (
                                <div className="mt-md">
                                    <div className="grid grid-2 gap-md">
                                        <div className="form-group">
                                            <label>Mobile OTP {mobileVerified && '✓'}</label>
                                            <div className="flex gap-sm">
                                                <input
                                                    type="text"
                                                    value={mobileOtp}
                                                    onChange={(e) => setMobileOtp(e.target.value)}
                                                    placeholder="6-digit OTP"
                                                    maxLength={6}
                                                    disabled={mobileVerified}
                                                />
                                                {!mobileVerified && (
                                                    <button type="button" onClick={handleVerifyMobileOtp} className="btn btn-secondary">
                                                        Verify
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>Email OTP {emailVerified && '✓'}</label>
                                            <div className="flex gap-sm">
                                                <input
                                                    type="text"
                                                    value={emailOtp}
                                                    onChange={(e) => setEmailOtp(e.target.value)}
                                                    placeholder="6-digit OTP"
                                                    maxLength={6}
                                                    disabled={emailVerified}
                                                />
                                                {!emailVerified && (
                                                    <button type="button" onClick={handleVerifyEmailOtp} className="btn btn-secondary">
                                                        Verify
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="btn btn-success mt-md"
                                        disabled={!mobileVerified || !emailVerified}
                                    >
                                        Create Account
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>
                )}

                <div className="admin-grid">
                    {/* Queues Section */}
                    <div className="queue-section">
                        {/* Time-Lock Heap */}
                        <div className="queue-card">
                            <h3>
                                ⏱️ Time-Lock Heap
                                <span className="queue-count">{lockedItems.length}</span>
                            </h3>
                            <div className="queue-items">
                                {lockedItems.length === 0 ? (
                                    <div className="empty-state">No locked transactions</div>
                                ) : (
                                    lockedItems.map((item) => (
                                        <div key={item.id} className="queue-item locked">
                                            <div className="queue-item-info">
                                                <span className="queue-item-id">{item.id.slice(0, 8)}...</span>
                                                <span className="queue-item-amount">
                                                    {formatCurrency(item.transaction?.amount || '0')}
                                                </span>
                                            </div>
                                            <div className="queue-item-meta">
                                                <span className="countdown">{getCountdown(item.unlockAt)}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Pending Completion - Table View */}
                    <div className="queue-card">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)' }}>
                            <h3 style={{ margin: 0 }}>
                                ⏳ Pending Completion
                                <span className="queue-count">{pending.length}</span>
                            </h3>
                            <button
                                onClick={handleProcessNext}
                                className="btn btn-success"
                                disabled={pending.length === 0}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                ▶ Process Next
                            </button>
                        </div>
                        <div className="table-container">
                            {pending.length === 0 ? (
                                <div className="empty-state">No pending transactions</div>
                            ) : (
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Rank</th>
                                            <th>ID</th>
                                            <th>Sender → Recv</th>
                                            <th>Amount</th>
                                            <th>Eff. Priority</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pending.map((tx, index) => (
                                            <tr key={tx.id}>
                                                <td>{index + 1}</td>
                                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                                                    {tx.id.slice(0, 8)}
                                                </td>
                                                <td>
                                                    {tx.fromAccount.accountNumber} → {tx.toAccount.accountNumber}
                                                </td>
                                                <td>{formatCurrency(tx.amount)}</td>
                                                <td style={{ color: 'var(--color-accent-primary)', fontWeight: 600 }}>
                                                    {tx.effectivePriority != null ? tx.effectivePriority.toFixed(1) : tx.basePriority.toFixed(1)}
                                                </td>
                                                <td>
                                                    <span className={`badge badge-${tx.status === 'RESERVED' ? 'warning' : 'info'}`}>
                                                        {tx.status === 'PENDING_MANUAL' ? 'Waiting' : tx.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>

                {/* Accounts Table */}
                <div className="card mt-lg">
                    <h3 className="mb-md">All Customer Accounts ({accounts.length})</h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Account Number</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Mobile</th>
                                    <th>Tier</th>
                                    <th>Balance</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((acc) => (
                                    <tr key={acc.id}>
                                        <td style={{ fontFamily: 'var(--font-mono)' }}>{acc.accountNumber}</td>
                                        <td>{acc.fullName}</td>
                                        <td>{acc.email}</td>
                                        <td>{acc.mobile}</td>
                                        <td>
                                            <span className={`badge badge-${acc.tier === 'VIP' ? 'primary' : acc.tier === 'PREMIUM' ? 'warning' : 'info'}`}>
                                                {acc.tier}
                                            </span>
                                        </td>
                                        <td>{formatCurrency(acc.balance)}</td>
                                        <td>{new Date(acc.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
