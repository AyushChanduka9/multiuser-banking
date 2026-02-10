import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { customerApi } from '../services/api';
import './CustomerDashboard.css';

interface Account {
    accountNumber: string;
    balance: string;
    reservedAmount: string;
    availableBalance: string;
    tier: string;
    email: string;
    mobile: string;
}

interface Transaction {
    id: string;
    amount: string;
    status: string;
    urgency: string;
    createdAt: string;
    fromAccount: { accountNumber: string };
    toAccount: { accountNumber: string };
}

export default function CustomerDashboard() {
    const { user, logout } = useAuth();
    const { socket, isConnected } = useSocket();

    const [account, setAccount] = useState<Account | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Transfer form
    const [toAccountNumber, setToAccountNumber] = useState('');
    const [amount, setAmount] = useState('');
    const [urgency, setUrgency] = useState('NORMAL');
    const [transferLoading, setTransferLoading] = useState(false);
    const [transferSuccess, setTransferSuccess] = useState('');
    const [transferError, setTransferError] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (socket) {
            socket.on('transaction:status', (data) => {
                setTransactions(prev =>
                    prev.map(tx => tx.id === data.id ? { ...tx, status: data.status } : tx)
                );
                fetchData(); // Refresh account balance
            });

            return () => {
                socket.off('transaction:status');
            };
        }
    }, [socket]);

    const fetchData = async () => {
        try {
            const [accountRes, txRes] = await Promise.all([
                customerApi.getAccount(),
                customerApi.getTransactions(),
            ]);
            setAccount(accountRes.data);
            setTransactions(txRes.data.transactions);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        setTransferError('');
        setTransferSuccess('');
        setTransferLoading(true);

        try {
            const response = await customerApi.transfer(
                toAccountNumber,
                parseFloat(amount),
                urgency
            );
            setTransferSuccess(response.data.message);
            setToAccountNumber('');
            setAmount('');
            setUrgency('NORMAL');
            fetchData();
        } catch (err: any) {
            setTransferError(err.response?.data?.error || 'Transfer failed');
        } finally {
            setTransferLoading(false);
        }
    };

    const formatCurrency = (value: string | number) => {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
        }).format(num);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    };

    const getStatusBadge = (status: string) => {
        const statusClasses: Record<string, string> = {
            COMPLETED: 'badge-success',
            FAILED: 'badge-danger',
            CANCELLED: 'badge-danger',
            LOCKED: 'badge-warning',
            QUEUED: 'badge-info',
            RESERVED: 'badge-primary',
            PENDING_MANUAL: 'badge-warning',
            CREATED: 'badge-info',
        };
        return `badge ${statusClasses[status] || 'badge-info'}`;
    };

    const handleCancelTransaction = async (txId: string) => {
        if (!window.confirm('Are you sure you want to cancel this time-locked transaction?')) {
            return;
        }
        try {
            await customerApi.cancelTransaction(txId);
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to cancel transaction');
        }
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
                    <h1>🏦 NEXUS Banking</h1>
                    <span className={`connection-status ${isConnected ? 'connected' : ''}`}>
                        {isConnected ? '● Live' : '○ Offline'}
                    </span>
                </div>
                <div className="header-right">
                    <span className="user-info">
                        {user?.fullName || user?.accountNumber} ({account?.tier})
                    </span>
                    <button onClick={logout} className="btn btn-secondary">
                        Logout
                    </button>
                </div>
            </header>

            <main className="dashboard-content">
                {error && <div className="alert alert-danger">{error}</div>}

                <div className="dashboard-grid">
                    {/* Transfer Card */}
                    <div className="card transfer-card">
                        <h3>Send Money</h3>
                        <form onSubmit={handleTransfer} className="transfer-form">
                            {transferSuccess && (
                                <div className="alert alert-success">{transferSuccess}</div>
                            )}
                            {transferError && (
                                <div className="alert alert-danger">{transferError}</div>
                            )}

                            <div className="form-group">
                                <label>Recipient Account</label>
                                <input
                                    type="text"
                                    value={toAccountNumber}
                                    onChange={(e) => setToAccountNumber(e.target.value)}
                                    placeholder="Enter account number"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Amount (₹)</label>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="Enter amount"
                                    min="1"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Urgency</label>
                                <select
                                    value={urgency}
                                    onChange={(e) => setUrgency(e.target.value)}
                                >
                                    <option value="NORMAL">Normal</option>
                                    <option value="EMI">EMI Payment</option>
                                    <option value="MEDICAL">Medical Emergency</option>
                                </select>
                            </div>

                            {parseFloat(amount) > 10000 && (
                                <div className="alert alert-warning">
                                    ⏱️ Transfers above ₹10,000 require a 30-second time-lock
                                </div>
                            )}

                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={transferLoading}
                            >
                                {transferLoading ? 'Processing...' : 'Send Money'}
                            </button>
                        </form>
                    </div>

                    {/* Balance Card */}
                    <div className="card balance-card">
                        <h3>Account Balance</h3>
                        <div className="balance-amount">
                            {formatCurrency(account?.balance || 0)}
                        </div>
                        <div className="balance-details">
                            <div className="balance-row">
                                <span>Available:</span>
                                <span className="text-success">
                                    {formatCurrency(account?.availableBalance || 0)}
                                </span>
                            </div>
                            <div className="balance-row">
                                <span>Reserved:</span>
                                <span className="text-warning">
                                    {formatCurrency(account?.reservedAmount || 0)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Transactions Table */}
                <div className="card transactions-card">
                    <h3>Recent Transactions</h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Account</th>
                                    <th>Amount</th>
                                    <th>Urgency</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                                            No transactions yet
                                        </td>
                                    </tr>
                                ) : (
                                    transactions.map((tx) => {
                                        const isSent = tx.fromAccount.accountNumber === user?.accountNumber;
                                        return (
                                            <tr key={tx.id}>
                                                <td>{formatDate(tx.createdAt)}</td>
                                                <td>
                                                    <span className={isSent ? 'text-danger' : 'text-success'}>
                                                        {isSent ? '↑ Sent' : '↓ Received'}
                                                    </span>
                                                </td>
                                                <td>
                                                    {isSent ? tx.toAccount.accountNumber : tx.fromAccount.accountNumber}
                                                </td>
                                                <td className={isSent ? 'text-danger' : 'text-success'}>
                                                    {isSent ? '-' : '+'}{formatCurrency(tx.amount)}
                                                </td>
                                                <td>{tx.urgency}</td>
                                                <td>
                                                    <span className={getStatusBadge(tx.status)}>
                                                        {tx.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    {isSent && tx.status === 'LOCKED' && (
                                                        <button
                                                            onClick={() => handleCancelTransaction(tx.id)}
                                                            className="btn btn-danger"
                                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                                        >
                                                            ✕ Cancel
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
