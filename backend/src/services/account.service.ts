import prisma from '../config/database';
import { generateAccountNumber } from '../utils/helpers';
import { config } from '../config';
import { Account, Tier, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const INITIAL_BALANCE = 1000;

export class AccountService {
    /**
     * Create a new customer account (called by admin)
     */
    async createAccount(data: {
        fullName: string;
        aadhaar: string;
        pan: string;
        mobile: string;
        email: string;
        tier?: Tier;
        initialDeposit?: number;
    }): Promise<Account> {
        // Generate unique account number
        let accountNumber = generateAccountNumber();

        // Ensure uniqueness
        while (await prisma.account.findUnique({ where: { accountNumber } })) {
            accountNumber = generateAccountNumber();
        }

        const initialBalance = data.initialDeposit || 1000;

        const account = await prisma.account.create({
            data: {
                accountNumber,
                fullName: data.fullName,
                aadhaar: data.aadhaar,
                pan: data.pan.toUpperCase(),
                mobile: data.mobile,
                email: data.email.toLowerCase(),
                tier: data.tier || 'BASIC',
                balance: new Decimal(initialBalance),
                role: 'CUSTOMER',
            },
        });

        // Mock: Send account number via SMS
        console.log('\n📱 ====== ACCOUNT CREATED - MOCK SMS ======');
        console.log(`To: ${data.mobile}`);
        console.log(`Welcome to Nexus Banking!`);
        console.log(`Your Account Number: ${accountNumber}`);
        console.log(`Initial Balance: ₹${initialBalance}`);
        console.log(`Please login and set your PIN.`);
        console.log('==========================================\n');

        return account;
    }

    /**
     * Get all accounts (admin view)
     */
    async getAllAccounts(): Promise<Partial<Account>[]> {
        const accounts = await prisma.account.findMany({
            where: { role: 'CUSTOMER' },
            orderBy: { createdAt: 'desc' },
        });

        return accounts.map(acc => {
            const { pinHash, ...sanitized } = acc;
            return sanitized;
        });
    }

    /**
     * Get account by account number
     */
    async getByAccountNumber(accountNumber: string): Promise<Account | null> {
        return prisma.account.findUnique({
            where: { accountNumber },
        });
    }

    /**
     * Get available balance (balance - reserved)
     */
    async getAvailableBalance(accountId: string): Promise<Decimal> {
        const account = await prisma.account.findUnique({
            where: { id: accountId },
            select: { balance: true, reservedAmount: true, tier: true },
        });

        if (!account) {
            throw new Error('Account not found');
        }

        const tierReserve = new Decimal(config.tierReserves[account.tier] || 0);
        return account.balance.minus(account.reservedAmount).minus(tierReserve);
    }

    /**
     * Update account tier
     */
    async updateTier(accountId: string, tier: Tier): Promise<Account> {
        return prisma.account.update({
            where: { id: accountId },
            data: { tier },
        });
    }

    /**
     * Update risk score
     */
    async updateRiskScore(accountId: string, riskScore: number): Promise<Account> {
        if (riskScore < 0 || riskScore > 10) {
            throw new Error('Risk score must be between 0 and 10');
        }

        return prisma.account.update({
            where: { id: accountId },
            data: { riskScore },
        });
    }

    /**
     * Check if account exists by Aadhaar, PAN, mobile, or email
     */
    async checkDuplicates(data: {
        aadhaar: string;
        pan: string;
        mobile: string;
        email: string;
    }): Promise<{ field: string; message: string } | null> {
        if (await prisma.account.findUnique({ where: { aadhaar: data.aadhaar } })) {
            return { field: 'aadhaar', message: 'Aadhaar already registered' };
        }
        if (await prisma.account.findUnique({ where: { pan: data.pan.toUpperCase() } })) {
            return { field: 'pan', message: 'PAN already registered' };
        }
        if (await prisma.account.findUnique({ where: { mobile: data.mobile } })) {
            return { field: 'mobile', message: 'Mobile already registered' };
        }
        if (await prisma.account.findUnique({ where: { email: data.email.toLowerCase() } })) {
            return { field: 'email', message: 'Email already registered' };
        }
        return null;
    }
}

export const accountService = new AccountService();
