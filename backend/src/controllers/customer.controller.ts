import { Router, Request, Response } from 'express';
import { authMiddleware, customerOnly, generateToken } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';
import { authService } from '../services/auth.service';
import { accountService } from '../services/account.service';
import { transactionService } from '../services/transaction.service';
import prisma from '../config/database';
import { config } from '../config';
import { Decimal } from '@prisma/client/runtime/library';
import { emitToAdmins, emitToUser } from '../websocket';

const router = Router();

/**
 * POST /api/customer/login - Customer login
 */
router.post('/login', validate(schemas.login), async (req: Request, res: Response) => {
    try {
        const { accountNumber, pin } = req.body;

        const result = await authService.login(accountNumber, pin);

        if (!result) {
            res.status(401).json({ error: 'Invalid account number or PIN' });
            return;
        }

        // Check if customer role
        if (result.account.role !== 'CUSTOMER') {
            res.status(403).json({ error: 'Please use admin login' });
            return;
        }

        res.json({
            token: result.token,
            account: result.account,
            isFirstLogin: result.isFirstLogin,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/customer/pin/set - Set PIN for first-time login
 */
router.post(
    '/pin/set',
    authMiddleware,
    customerOnly,
    validate(schemas.setPin),
    async (req: Request, res: Response) => {
        try {
            const { pin } = req.body;
            const userId = req.user!.id;

            const account = await authService.setPin(userId, pin);

            if (!account) {
                res.status(400).json({ error: 'PIN already set or account not found' });
                return;
            }

            // Generate new token with updated info
            const token = generateToken({
                id: account.id,
                accountNumber: account.accountNumber,
                role: account.role,
            });

            res.json({
                message: 'PIN set successfully',
                token,
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
);

/**
 * POST /api/customer/pin/change - Change existing PIN
 */
router.post(
    '/pin/change',
    authMiddleware,
    customerOnly,
    validate(schemas.changePin),
    async (req: Request, res: Response) => {
        try {
            const { oldPin, newPin } = req.body;
            const userId = req.user!.id;

            const success = await authService.changePin(userId, oldPin, newPin);

            if (!success) {
                res.status(400).json({ error: 'Invalid current PIN' });
                return;
            }

            res.json({ message: 'PIN changed successfully' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
);

/**
 * GET /api/customer/account - Get account details
 */
router.get(
    '/account',
    authMiddleware,
    customerOnly,
    async (req: Request, res: Response) => {
        try {
            const userId = req.user!.id;

            const account = await prisma.account.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    accountNumber: true,
                    mobile: true,
                    email: true,
                    balance: true,
                    reservedAmount: true,
                    tier: true,
                    createdAt: true,
                },
            });

            if (!account) {
                res.status(404).json({ error: 'Account not found' });
                return;
            }

            const availableBalance = await accountService.getAvailableBalance(account.id);
            const tierReserve = new Decimal(config.tierReserves[account.tier] || 0);

            res.json({
                ...account,
                reservedAmount: account.reservedAmount.plus(tierReserve),
                availableBalance,
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
);

/**
 * POST /api/customer/transfer - Initiate a transfer
 */
router.post(
    '/transfer',
    authMiddleware,
    customerOnly,
    validate(schemas.transfer),
    async (req: Request, res: Response) => {
        try {
            const { toAccountNumber, amount, urgency } = req.body;
            const userId = req.user!.id;

            const transaction = await transactionService.initiateTransfer(
                userId,
                toAccountNumber,
                amount,
                urgency
            );

            // Notify admins about new transaction
            emitToAdmins('transaction:new', {
                id: transaction.id,
                amount,
                status: transaction.status,
                urgency,
            });

            res.status(201).json({
                message: transaction.status === 'LOCKED'
                    ? `Transfer initiated. High-value transfer locked for ${30} seconds.`
                    : 'Transfer queued for processing',
                transaction: {
                    id: transaction.id,
                    amount: transaction.amount,
                    status: transaction.status,
                    lockedUntil: transaction.lockedUntil,
                    createdAt: transaction.createdAt,
                },
            });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }
);

/**
 * GET /api/customer/transactions - Get transaction history
 */
router.get(
    '/transactions',
    authMiddleware,
    customerOnly,
    async (req: Request, res: Response) => {
        try {
            const userId = req.user!.id;

            const transactions = await transactionService.getForAccount(userId);

            res.json({ transactions });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
);

/**
 * GET /api/customer/transactions/:id - Get single transaction
 */
router.get(
    '/transactions/:id',
    authMiddleware,
    customerOnly,
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const userId = req.user!.id;

            const transaction = await transactionService.getById(id);

            if (!transaction) {
                res.status(404).json({ error: 'Transaction not found' });
                return;
            }

            // Verify user owns this transaction
            if (transaction.fromAccountId !== userId && transaction.toAccountId !== userId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            res.json({ transaction });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
);
/**
 * POST /api/customer/transactions/:id/cancel - Cancel a time-locked transaction
 */
router.post(
    '/transactions/:id/cancel',
    authMiddleware,
    customerOnly,
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const userId = req.user!.id;

            // Get the transaction
            const transaction = await transactionService.getById(id);

            if (!transaction) {
                res.status(404).json({ error: 'Transaction not found' });
                return;
            }

            // Verify user is the sender
            if (transaction.fromAccountId !== userId) {
                res.status(403).json({ error: 'You can only cancel your own transactions' });
                return;
            }

            // Only allow cancelling LOCKED transactions
            if (transaction.status !== 'LOCKED') {
                res.status(400).json({ error: 'Only time-locked transactions can be cancelled' });
                return;
            }

            // Cancel the timelock and release reserved funds
            const { timelockService } = await import('../services/timelock.service');
            await timelockService.cancelLocked(id);

            // Release the reserved amount back to sender
            await prisma.account.update({
                where: { id: transaction.fromAccountId },
                data: {
                    reservedAmount: { decrement: transaction.amount },
                },
            });

            // Notify admins
            emitToAdmins('queue:update', { reason: 'transaction_cancelled_by_customer' });

            res.json({ message: 'Time-locked transaction cancelled successfully' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
);

export default router;
