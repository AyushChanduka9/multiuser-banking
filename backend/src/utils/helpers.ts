import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a 12-digit unique account number
 */
export function generateAccountNumber(): string {
    // Format: YYYYMMDD + 4 random digits
    const now = new Date();
    const datePart = [
        now.getFullYear().toString(),
        (now.getMonth() + 1).toString().padStart(2, '0'),
        now.getDate().toString().padStart(2, '0'),
    ].join('');

    const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
    return datePart + randomPart;
}

/**
 * Generate a 6-digit OTP code
 */
export function generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Calculate seconds since a given date
 */
export function secondsSince(date: Date): number {
    return Math.floor((Date.now() - date.getTime()) / 1000);
}

/**
 * Format currency in INR
 */
export function formatINR(amount: number | string): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
    }).format(num);
}

/**
 * Generate UUID
 */
export function generateId(): string {
    return uuidv4();
}

/**
 * Mask sensitive data for logging
 */
export function maskString(str: string, visibleChars: number = 4): string {
    if (str.length <= visibleChars) return str;
    return '*'.repeat(str.length - visibleChars) + str.slice(-visibleChars);
}

/**
 * Validate Aadhaar number (12 digits)
 */
export function isValidAadhaar(aadhaar: string): boolean {
    return /^\d{12}$/.test(aadhaar);
}

/**
 * Validate PAN (XXXXX0000X format)
 */
export function isValidPAN(pan: string): boolean {
    return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase());
}

/**
 * Validate mobile number (10 digits)
 */
export function isValidMobile(mobile: string): boolean {
    return /^[6-9]\d{9}$/.test(mobile);
}

/**
 * Validate email
 */
export function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
