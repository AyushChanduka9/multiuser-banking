import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
    // Server
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    // Database
    databaseUrl: process.env.DATABASE_URL || '',

    // Redis
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

    // JWT
    jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
    jwtExpiry: process.env.JWT_EXPIRY || '24h',

    // OTP
    otpTtlMinutes: parseInt(process.env.OTP_TTL_MINUTES || '5', 10),

    // Twilio (SMS)
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    },

    // Gmail SMTP (Nodemailer)
    gmail: {
        user: process.env.GMAIL_USER || '',
        appPassword: process.env.GMAIL_APP_PASSWORD || '',
    },

    // Time-Lock
    timelockThreshold: parseFloat(process.env.TIMELOCK_THRESHOLD || '10000'),
    timelockSeconds: parseInt(process.env.TIMELOCK_SECONDS || '30', 10),

    // Priority Queue
    agingFactor: parseFloat(process.env.AGING_FACTOR || '0.1'),

    // Frontend
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

    // Priority weights
    urgencyWeights: {
        NORMAL: 1,
        EMI: 3,
        MEDICAL: 5,
    },

    tierWeights: {
        BASIC: 0,
        PREMIUM: 2,
        VIP: 4,
    },

    // Minimum balance to maintain based on tier
    tierReserves: {
        BASIC: 100,
        PREMIUM: 300,
        VIP: 500,
    },
};

// Validate required environment variables
export function validateConfig(): void {
    const required = ['DATABASE_URL', 'JWT_SECRET'];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0 && config.nodeEnv === 'production') {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}
