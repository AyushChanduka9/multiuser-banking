import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import './Login.css';

export default function Login() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [accountNumber, setAccountNumber] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = isAdmin
                ? await authApi.adminLogin(accountNumber, pin)
                : await authApi.customerLogin(accountNumber, pin);

            const { token, account, isFirstLogin } = response.data;

            login(token, {
                ...account,
                isFirstLogin,
            });

            if (isFirstLogin && !isAdmin) {
                navigate('/set-pin');
            } else if (isAdmin) {
                navigate('/admin');
            } else {
                navigate('/dashboard');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-background">
                <div className="login-glow login-glow-1"></div>
                <div className="login-glow login-glow-2"></div>
            </div>

            <div className="login-container">
                <div className="login-card">
                    <div className="login-header">
                        <div className="login-logo">
                            <span className="logo-icon">🏦</span>
                            <h1>NEXUS</h1>
                        </div>
                        <p className="login-subtitle">Multi-User Banking System</p>
                    </div>

                    <div className="login-tabs">
                        <button
                            className={`login-tab ${!isAdmin ? 'active' : ''}`}
                            onClick={() => setIsAdmin(false)}
                        >
                            Customer
                        </button>
                        <button
                            className={`login-tab ${isAdmin ? 'active' : ''}`}
                            onClick={() => setIsAdmin(true)}
                        >
                            Admin
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="login-form">
                        {error && (
                            <div className="alert alert-danger">{error}</div>
                        )}

                        <div className="form-group">
                            <label htmlFor="accountNumber">Account Number</label>
                            <input
                                id="accountNumber"
                                type="text"
                                value={accountNumber}
                                onChange={(e) => setAccountNumber(e.target.value)}
                                placeholder="Enter your account number"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="pin">PIN</label>
                            <input
                                id="pin"
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                placeholder="Enter your PIN"
                                required
                                maxLength={6}
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary login-btn"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner"></span>
                                    Signing in...
                                </>
                            ) : (
                                `Sign in as ${isAdmin ? 'Admin' : 'Customer'}`
                            )}
                        </button>
                    </form>

                    <div className="login-footer">
                        <p className="demo-credentials">
                            <strong>Demo Credentials:</strong><br />
                            Admin: 000000000001 / 1234<br />
                            Customer: 202602051001 / 1234
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
