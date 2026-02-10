import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';
import { accountService } from '../services/account.service';
import { otpService } from '../services/otp.service';
import { transactionService } from '../services/transaction.service';
import { queueService } from '../services/queue.service';
import { timelockService } from '../services/timelock.service';
import prisma from '../config/database';
import { emitToAdmins, emitToUser } from '../websocket';

const router = Router();

// All admin routes require authentication + admin role
router.use(authMiddleware, adminOnly);

/**
 * POST /api/admin/accounts - Create a new customer account
 */
router.post(
    '/accounts',
    validate(schemas.createAccount),
    async (req: Request, res: Response) => {
        try {
            const { fullName, aadhaar, pan, mobile, tier, initialDeposit } = req.body;
            let { email } = req.body;

            // Generate dummy email if not provided (Mobile-only flow)
            if (!email) {
                email = `${mobile}@nexus.local`;
            }

            // Check for duplicates
            const duplicate = await accountService.checkDuplicates({ aadhaar, pan, mobile, email });
            if (duplicate) {
                res.status(400).json({ error: duplicate.message, field: duplicate.field });
                return;
            }

            // Check if Mobile OTP is verified (Email skipped)
            const otpsVerified = await otpService.checkMobileVerification(mobile);
            if (!otpsVerified) {
                res.status(400).json({ error: 'Mobile OTP verification required' });
                return;
            }

            // Create account
            const account = await accountService.createAccount({ fullName, aadhaar, pan, mobile, email, tier, initialDeposit });

            res.status(201).json({
                message: 'Account created successfully',
                account: {
                    fullName: account.fullName,
                    accountNumber: account.accountNumber,
                    mobile: account.mobile,
                    email: account.email,
                    tier: account.tier,
                    balance: account.balance,
                },
            });
        } catch (error: any) {
            console.error('Error creating account:', error);
            res.status(500).json({ error: error.message || 'Failed to create account' });
        }
    }
);

/**
 * GET /api/admin/accounts - Get all customer accounts
 */
router.get('/accounts', async (req: Request, res: Response) => {
    try {
        const accounts = await accountService.getAllAccounts();
        res.json({ accounts });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/admin/queues - Get current queue status
 */
router.get('/queues', async (req: Request, res: Response) => {
    try {
        const stats = await queueService.getStats();
        const locked = await timelockService.getLockedTransactions();

        // Get transaction details for locked items
        const lockedWithDetails = await Promise.all(
            locked.map(async (item) => {
                const tx = await transactionService.getById(item.id);
                return {
                    ...item,
                    transaction: tx,
                };
            })
        );

        res.json({
            priorityQueue: stats,
            timelockHeap: lockedWithDetails,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/admin/pending - Get transactions awaiting manual completion
 */
router.get('/pending', async (req: Request, res: Response) => {
    try {
        const pending = await transactionService.getPending();
        res.json({ pending });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/admin/transactions/:id/complete - Complete a pending transaction
 */
router.post('/transactions/:id/complete', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const success = await transactionService.completeManual(id);

        if (!success) {
            res.status(400).json({ error: 'Failed to complete transaction' });
            return;
        }

        const transaction = await transactionService.getById(id);

        // Notify relevant users via WebSocket
        if (transaction) {
            emitToUser(transaction.fromAccountId, 'transaction:status', {
                id: transaction.id,
                status: 'COMPLETED',
            });
            emitToUser(transaction.toAccountId, 'transaction:status', {
                id: transaction.id,
                status: 'COMPLETED',
            });
            emitToAdmins('queue:update', { reason: 'transaction_completed' });
        }

        res.json({ message: 'Transaction completed', transaction });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/admin/transactions/:id/cancel - Cancel a pending transaction
 */
router.post('/transactions/:id/cancel', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const success = await transactionService.rollback(id, reason || 'Cancelled by admin');

        if (!success) {
            res.status(400).json({ error: 'Failed to cancel transaction' });
            return;
        }

        const transaction = await transactionService.getById(id);

        // Notify relevant users
        if (transaction) {
            emitToUser(transaction.fromAccountId, 'transaction:status', {
                id: transaction.id,
                status: 'CANCELLED',
                reason,
            });
            emitToAdmins('queue:update', { reason: 'transaction_cancelled' });
        }

        res.json({ message: 'Transaction cancelled', transaction });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * POST /api/admin/process-next - Process the next highest-priority transaction
 */
router.post('/process-next', async (req: Request, res: Response) => {
    try {
        const result = await transactionService.processNext();

        if (!result.success) {
            res.status(400).json({ error: 'No pending transactions to process or processing failed' });
            return;
        }

        const transaction = await transactionService.getById(result.transactionId!);

        // Notify relevant users via WebSocket
        if (transaction) {
            emitToUser(transaction.fromAccountId, 'transaction:status', {
                id: transaction.id,
                status: 'COMPLETED',
            });
            emitToUser(transaction.toAccountId, 'transaction:status', {
                id: transaction.id,
                status: 'COMPLETED',
            });
            emitToAdmins('queue:update', { reason: 'transaction_completed' });
        }

        res.json({ message: 'Transaction processed successfully', transaction });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
