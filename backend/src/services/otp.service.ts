import { PrismaClient, OtpType } from '@prisma/client';
import { config } from '../config';
import { generateOtpCode } from '../utils/helpers';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();

// Initialize Twilio client
const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

// Initialize Nodemailer with Gmail SMTP
const emailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // use SSL
    auth: {
        user: config.gmail.user,
        pass: config.gmail.appPassword,
    },
    tls: {
        rejectUnauthorized: false
    },
    // Force IPv4 to avoid Render IPv6 issues
    family: 4,
    logger: true,
    debug: true,
} as any); // Cast to any because 'family' might not be in the strict types but runs in Node

export const otpService = {
    /**
     * Send OTP via SMS using Twilio
     */
    async sendSmsOtp(mobile: string): Promise<{ success: boolean; code?: string }> {
        const code = generateOtpCode();
        const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60 * 1000);

        // Store OTP in database
        await prisma.otp.create({
            data: {
                identifier: mobile,
                code,
                type: OtpType.SMS,
                expiresAt,
            },
        });

        try {
            // Send SMS via Twilio
            await twilioClient.messages.create({
                body: `Your Nexus Banking OTP is: ${code}. Valid for ${config.otpTtlMinutes} minutes.`,
                from: config.twilio.phoneNumber,
                to: `+91${mobile}`, // Add India country code
            });

            console.log(`✅ SMS OTP sent to ${mobile}`);
            return { success: true };
        } catch (error: any) {
            console.error(`❌ Failed to send SMS to ${mobile}:`, error.message);
            // Return code in dev mode for testing even if SMS fails
            if (config.nodeEnv === 'development') {
                console.log(`📱 [DEV] SMS OTP for ${mobile}: ${code}`);
                return { success: true, code };
            }
            throw new Error(`SMS Failed: ${error.message}`);
        }
    },

    /**
     * Send OTP via Email using Nodemailer + Gmail SMTP
     */
    async sendEmailOtp(email: string): Promise<{ success: boolean; code?: string }> {
        const code = generateOtpCode();
        const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60 * 1000);

        // Store OTP in database
        await prisma.otp.create({
            data: {
                identifier: email,
                code,
                type: OtpType.EMAIL,
                expiresAt,
            },
        });

        try {
            // Send Email via Nodemailer
            await emailTransporter.sendMail({
                from: `"Nexus Banking" <${config.gmail.user}>`,
                to: email,
                subject: 'Nexus Banking - Your OTP Code',
                text: `Your Nexus Banking OTP is: ${code}. This code is valid for ${config.otpTtlMinutes} minutes.`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #3b82f6; margin: 0;">🏦 NEXUS Banking</h1>
                        </div>
                        <div style="background: #f8fafc; border-radius: 10px; padding: 30px; text-align: center;">
                            <p style="color: #64748b; margin-bottom: 10px;">Your verification code is:</p>
                            <h2 style="font-size: 36px; color: #1e293b; letter-spacing: 8px; margin: 20px 0;">${code}</h2>
                            <p style="color: #94a3b8; font-size: 14px;">
                                Valid for ${config.otpTtlMinutes} minutes
                            </p>
                        </div>
                        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 20px;">
                            If you didn't request this code, please ignore this email.
                        </p>
                    </div>
                `,
            });

            console.log(`✅ Email OTP sent to ${email}`);
            return { success: true };
        } catch (error: any) {
            console.error(`❌ Failed to send email to ${email}:`, error.message);
            // Return code in dev mode for testing even if email fails
            if (config.nodeEnv === 'development') {
                console.log(`📧 [DEV] Email OTP for ${email}: ${code}`);
                return { success: true, code };
            }
            throw new Error(`Email Failed: ${error.message}`);
        }
    },

    /**
     * Verify OTP code
     */
    async verifyOtp(
        identifier: string,
        code: string,
        type: OtpType
    ): Promise<{ valid: boolean; error?: string }> {
        const otp = await prisma.otp.findFirst({
            where: {
                identifier,
                type,
                verified: false,
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!otp) {
            return { valid: false, error: 'No OTP found for this identifier' };
        }

        if (otp.expiresAt < new Date()) {
            await prisma.otp.delete({ where: { id: otp.id } });
            return { valid: false, error: 'OTP has expired' };
        }

        if (otp.attempts >= 3) {
            await prisma.otp.delete({ where: { id: otp.id } });
            return { valid: false, error: 'Too many failed attempts' };
        }

        if (otp.code !== code) {
            await prisma.otp.update({
                where: { id: otp.id },
                data: { attempts: otp.attempts + 1 },
            });
            return { valid: false, error: 'Invalid OTP code' };
        }

        // Mark as verified
        await prisma.otp.update({
            where: { id: otp.id },
            data: { verified: true },
        });

        return { valid: true };
    },

    /**
     * Check if both SMS and Email OTPs are verified for an account
     */
    async checkDualVerification(mobile: string, email: string): Promise<boolean> {
        const smsOtp = await prisma.otp.findFirst({
            where: { identifier: mobile, type: OtpType.SMS, verified: true },
            orderBy: { createdAt: 'desc' },
        });

        const emailOtp = await prisma.otp.findFirst({
            where: { identifier: email, type: OtpType.EMAIL, verified: true },
            orderBy: { createdAt: 'desc' },
        });

        return !!(smsOtp && emailOtp);
    },

    /**
     * Clean up expired OTPs
     */
    async cleanupExpiredOtps(): Promise<number> {
        const result = await prisma.otp.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
        return result.count;
    },
};
