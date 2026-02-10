import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Validation schemas
 */
export const schemas = {
    // Account creation (admin)
    createAccount: z.object({
        fullName: z.string().min(2, 'Name must be at least 2 characters'),
        aadhaar: z.string().regex(/^\d{12}$/, 'Aadhaar must be 12 digits'),
        pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i, 'Invalid PAN format'),
        mobile: z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number'),
        email: z.string().email('Invalid email').optional(),
        tier: z.enum(['BASIC', 'PREMIUM', 'VIP']).optional().default('BASIC'),
        initialDeposit: z.number().min(1000, 'Minimum deposit is ₹1000').optional().default(1000),
    }),

    // Login
    login: z.object({
        accountNumber: z.string().min(1, 'Account number required'),
        pin: z.string().min(4, 'PIN must be at 4-6 digits'), // Keep relaxed for legacy, strict on set/change
    }),

    // Set PIN
    setPin: z.object({
        pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
        confirmPin: z.string(),
    }).refine(data => data.pin === data.confirmPin, {
        message: 'PINs do not match',
        path: ['confirmPin'],
    }),

    // Change PIN
    changePin: z.object({
        oldPin: z.string().min(4, 'Old PIN required'),
        newPin: z.string().regex(/^\d{6}$/, 'New PIN must be exactly 6 digits'),
        confirmPin: z.string(),
    }).refine(data => data.newPin === data.confirmPin, {
        message: 'New PINs do not match',
        path: ['confirmPin'],
    }),

    // Transfer
    transfer: z.object({
        toAccountNumber: z.string().min(1, 'Recipient account required'),
        amount: z.number().positive('Amount must be positive'),
        urgency: z.enum(['NORMAL', 'EMI', 'MEDICAL']).optional().default('NORMAL'),
    }),

    // OTP
    sendOtp: z.object({
        mobile: z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number'),
        email: z.string().email('Invalid email').optional(),
    }),

    verifyOtp: z.object({
        identifier: z.string().min(1, 'Identifier required'),
        code: z.string().length(6, 'OTP must be 6 digits'),
        type: z.enum(['SMS', 'EMAIL']),
    }),
};

/**
 * Middleware factory for request validation
 */
export function validate<T extends z.ZodSchema>(
    schema: T,
    source: 'body' | 'query' | 'params' = 'body'
) {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            const data = schema.parse(req[source]);
            req[source] = data;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({
                    error: 'Validation failed',
                    details: error.errors.map(e => ({
                        field: e.path.join('.'),
                        message: e.message,
                    })),
                });
                return;
            }
            next(error);
        }
    };
}
