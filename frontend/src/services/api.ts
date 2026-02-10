import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle auth errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Ignore 401s for login requests (invalid credentials)
        const isLoginRequest = error.config.url?.includes('/login');
        if (error.response?.status === 401 && !isLoginRequest) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

// Auth APIs
export const authApi = {
    adminLogin: (accountNumber: string, pin: string) =>
        api.post('/auth/admin/login', { accountNumber, pin }),

    customerLogin: (accountNumber: string, pin: string) =>
        api.post('/customer/login', { accountNumber, pin }),

    setPin: (pin: string, confirmPin: string) =>
        api.post('/customer/pin/set', { pin, confirmPin }),

    changePin: (oldPin: string, newPin: string, confirmPin: string) =>
        api.post('/customer/pin/change', { oldPin, newPin, confirmPin }),
};

// OTP APIs
export const otpApi = {
    send: (mobile: string) =>
        api.post('/otp/send', { mobile }),

    verify: (identifier: string, code: string, type: 'SMS' | 'EMAIL') =>
        api.post('/otp/verify', { identifier, code, type }),
};

// Admin APIs
export const adminApi = {
    createAccount: (data: {
        aadhaar: string;
        pan: string;
        mobile: string;
        email: string;
        tier?: string;
    }) => api.post('/admin/accounts', data),

    getAccounts: () => api.get('/admin/accounts'),

    getQueues: () => api.get('/admin/queues'),

    getPending: () => api.get('/admin/pending'),

    completeTransaction: (id: string) =>
        api.post(`/admin/transactions/${id}/complete`),

    processNext: () =>
        api.post('/admin/process-next'),
};

// Customer APIs
export const customerApi = {
    getAccount: () => api.get('/customer/account'),

    transfer: (toAccountNumber: string, amount: number, urgency?: string) =>
        api.post('/customer/transfer', { toAccountNumber, amount, urgency }),

    getTransactions: () => api.get('/customer/transactions'),

    getTransaction: (id: string) => api.get(`/customer/transactions/${id}`),

    cancelTransaction: (id: string) =>
        api.post(`/customer/transactions/${id}/cancel`),
};

export default api;
