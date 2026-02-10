import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import './Login.css';

export default function SetPin() {
    const { updateUser } = useAuth();
    const navigate = useNavigate();

    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (pin !== confirmPin) {
            setError('PINs do not match');
            return;
        }

        if (!/^\d{6}$/.test(pin)) {
            setError('PIN must be exactly 6 digits');
            return;
        }

        setLoading(true);

        try {
            const response = await authApi.setPin(pin, confirmPin);

            // Update token and user
            localStorage.setItem('token', response.data.token);
            updateUser({ isFirstLogin: false });

            navigate('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to set PIN');
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
                            <span className="logo-icon">🔐</span>
                            <h1>Set PIN</h1>
                        </div>
                        <p className="login-subtitle">
                            Welcome! Please set your PIN to secure your account.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="login-form">
                        {error && (
                            <div className="alert alert-danger">{error}</div>
                        )}

                        <div className="form-group">
                            <label htmlFor="pin">New PIN (6 digits)</label>
                            <input
                                id="pin"
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                                placeholder="Enter new PIN"
                                required
                                maxLength={6}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirmPin">Confirm PIN</label>
                            <input
                                id="confirmPin"
                                type="password"
                                value={confirmPin}
                                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                                placeholder="Confirm your PIN"
                                required
                                maxLength={6}
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary login-btn"
                            disabled={loading}
                        >
                            {loading ? 'Setting PIN...' : 'Set PIN & Continue'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
