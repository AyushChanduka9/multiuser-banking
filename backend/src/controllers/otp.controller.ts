import { Router, Request, Response } from 'express';
import { validate, schemas } from '../middleware/validation';
import { otpService } from '../services/otp.service';

const router = Router();

/**
 * POST /api/otp/send - Send OTP to mobile and email
 */
router.post('/send', validate(schemas.sendOtp), async (req: Request, res: Response) => {
    try {
        const { mobile } = req.body;

        // Send ONLY SMS OTP
        const smsResult = await otpService.sendSmsOtp(mobile);

        res.json({
            message: 'OTP sent to mobile',
            success: smsResult.success,
            // Demo only - shows codes if SMS/Email failed (dev mode fallback)
            demo: {
                mobile: smsResult.code || '(sent via SMS)',
                email: null,
                note: 'Real OTPs sent via Twilio SMS',
            },
        });
    } catch (error: any) {
        console.error('OTP send error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/otp/verify - Verify OTP
 */
router.post('/verify', validate(schemas.verifyOtp), async (req: Request, res: Response) => {
    try {
        const { identifier, code, type } = req.body;

        const result = await otpService.verifyOtp(identifier, code, type);

        if (!result.valid) {
            res.status(400).json({ error: result.error || 'Invalid or expired OTP' });
            return;
        }

        res.json({ message: 'OTP verified successfully', verified: true });
    } catch (error: any) {
        console.error('OTP verify error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
