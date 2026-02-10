import prisma from '../config/database';
import bcrypt from 'bcrypt';
import { generateToken } from '../middleware/auth';
import { Account, Role } from '@prisma/client';

const SALT_ROUNDS = 12;

export class AuthService {
    /**
     * Login with account number and PIN
     */
    async login(accountNumber: string, pin: string): Promise<{
        token: string;
        account: Partial<Account>;
        isFirstLogin: boolean;
    } | null> {
        const account = await prisma.account.findUnique({
            where: { accountNumber },
        });

        if (!account || !account.isActive) {
            return null;
        }

        // Check if first login (no PIN set yet)
        if (!account.pinHash) {
            return {
                token: generateToken({
                    id: account.id,
                    accountNumber: account.accountNumber,
                    role: account.role,
                }),
                account: this.sanitizeAccount(account),
                isFirstLogin: true,
            };
        }

        // Verify PIN
        const isValid = await bcrypt.compare(pin, account.pinHash);
        if (!isValid) {
            return null;
        }

        return {
            token: generateToken({
                id: account.id,
                accountNumber: account.accountNumber,
                role: account.role,
            }),
            account: this.sanitizeAccount(account),
            isFirstLogin: account.isFirstLogin,
        };
    }

    /**
     * Set PIN for first-time login
     */
    async setPin(accountId: string, pin: string): Promise<Account | null> {
        const account = await prisma.account.findUnique({
            where: { id: accountId },
        });

        if (!account || !account.isFirstLogin) {
            return null;
        }

        const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);

        return prisma.account.update({
            where: { id: accountId },
            data: {
                pinHash,
                isFirstLogin: false,
            },
        });
    }

    /**
     * Change existing PIN
     */
    async changePin(accountId: string, oldPin: string, newPin: string): Promise<boolean> {
        const account = await prisma.account.findUnique({
            where: { id: accountId },
        });

        if (!account || !account.pinHash) {
            return false;
        }

        // Verify old PIN
        const isValid = await bcrypt.compare(oldPin, account.pinHash);
        if (!isValid) {
            return false;
        }

        // Hash and save new PIN
        const pinHash = await bcrypt.hash(newPin, SALT_ROUNDS);

        await prisma.account.update({
            where: { id: accountId },
            data: { pinHash },
        });

        return true;
    }

    /**
     * Get account by ID
     */
    async getAccountById(id: string): Promise<Account | null> {
        return prisma.account.findUnique({
            where: { id },
        });
    }

    /**
     * Remove sensitive data from account object
     */
    private sanitizeAccount(account: Account): Partial<Account> {
        const { pinHash, ...sanitized } = account;
        return sanitized;
    }
}

export const authService = new AuthService();
