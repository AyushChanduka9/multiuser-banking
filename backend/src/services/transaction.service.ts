import prisma from '../config/database';
import { config } from '../config';
import { queueService } from './queue.service';
import { timelockService } from './timelock.service';
import { Decimal } from '@prisma/client/runtime/library';
import { Transaction, TxStatus, Urgency } from '@prisma/client';

export class TransactionService {
    /**
     * Initiate a new transfer
     */
    async initiateTransfer(
        fromAccountId: string,
        toAccountNumber: string,
        amount: number,
        urgency: Urgency = 'NORMAL'
    ): Promise<Transaction> {
        // Get sender account
        const fromAccount = await prisma.account.findUnique({
            where: { id: fromAccountId },
        });

        if (!fromAccount) {
            throw new Error('Sender account not found');
        }

        // Get recipient account
        const toAccount = await prisma.account.findUnique({
            where: { accountNumber: toAccountNumber },
        });

        if (!toAccount) {
            throw new Error('Recipient account not found');
        }

        if (fromAccount.id === toAccount.id) {
            throw new Error('Cannot transfer to same account');
        }

        // Check available balance
        const availableBalance = fromAccount.balance.minus(fromAccount.reservedAmount);
        const tierReserve = new Decimal(config.tierReserves[fromAccount.tier] || 0);

        if (availableBalance.minus(tierReserve).lessThan(amount)) {
            throw new Error(`Insufficient balance. Minimum balance of ₹${tierReserve} must be maintained.`);
        }

        // Calculate base priority
        const basePriority = queueService.calculateBasePriority(
            urgency,
            fromAccount.tier,
            fromAccount.riskScore
        );

        // Create transaction
        const transaction = await prisma.transaction.create({
            data: {
                fromAccountId: fromAccount.id,
                toAccountId: toAccount.id,
                amount: new Decimal(amount),
                urgency,
                basePriority,
                status: 'CREATED',
            },
        });

        // Determine if time-lock is needed (amount > threshold)
        if (amount > config.timelockThreshold) {
            await timelockService.lockTransaction(transaction.id);
        } else {
            // Add directly to priority queue
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: { status: 'QUEUED' },
            });
            await queueService.enqueue(transaction.id, basePriority, transaction.createdAt);
        }

        return transaction;
    }

    /**
     * Reserve funds for a transaction (atomic DB operation)
     */
    async reserveFunds(transactionId: string): Promise<boolean> {
        return prisma.$transaction(async (tx) => {
            const transaction = await tx.transaction.findUnique({
                where: { id: transactionId },
            });

            if (!transaction || !['QUEUED', 'PENDING_MANUAL'].includes(transaction.status)) {
                return false;
            }

            const fromAccount = await tx.account.findUnique({
                where: { id: transaction.fromAccountId },
            });

            if (!fromAccount) {
                return false;
            }

            // Check available balance
            const availableBalance = fromAccount.balance.minus(fromAccount.reservedAmount);
            const tierReserve = new Decimal(config.tierReserves[fromAccount.tier] || 0);

            if (availableBalance.minus(tierReserve).lessThan(transaction.amount)) {
                await tx.transaction.update({
                    where: { id: transactionId },
                    data: {
                        status: 'FAILED',
                        failureReason: 'Insufficient balance (Minimum balance requirement)',
                    },
                });
                return false;
            }

            // Reserve funds
            await tx.account.update({
                where: { id: fromAccount.id },
                data: {
                    reservedAmount: { increment: transaction.amount },
                },
            });

            // Create ledger entry
            await tx.ledgerEntry.create({
                data: {
                    accountId: fromAccount.id,
                    transactionId,
                    type: 'RESERVE',
                    amount: transaction.amount,
                    balanceAfter: fromAccount.balance,
                    description: `Reserved for transfer to ${transaction.toAccountId}`,
                },
            });

            // Update transaction status
            await tx.transaction.update({
                where: { id: transactionId },
                data: {
                    status: 'RESERVED',
                    reservedAt: new Date(),
                },
            });

            console.log(`💰 Reserved ₹${transaction.amount} for transaction ${transactionId.slice(0, 8)}...`);

            return true;
        });
    }

    /**
     * Finalize a transaction (complete the transfer)
     */
    async finalize(transactionId: string): Promise<boolean> {
        return prisma.$transaction(async (tx) => {
            const transaction = await tx.transaction.findUnique({
                where: { id: transactionId },
            });

            if (!transaction || transaction.status !== 'RESERVED') {
                return false;
            }

            // Debit from sender
            const fromAccount = await tx.account.update({
                where: { id: transaction.fromAccountId },
                data: {
                    balance: { decrement: transaction.amount },
                    reservedAmount: { decrement: transaction.amount },
                },
            });

            // Credit to receiver
            const toAccount = await tx.account.update({
                where: { id: transaction.toAccountId },
                data: {
                    balance: { increment: transaction.amount },
                },
            });

            // Create ledger entries
            await tx.ledgerEntry.createMany({
                data: [
                    {
                        accountId: transaction.fromAccountId,
                        transactionId,
                        type: 'DEBIT',
                        amount: transaction.amount,
                        balanceAfter: fromAccount.balance,
                        description: `Transfer to ${transaction.toAccountId}`,
                    },
                    {
                        accountId: transaction.toAccountId,
                        transactionId,
                        type: 'CREDIT',
                        amount: transaction.amount,
                        balanceAfter: toAccount.balance,
                        description: `Transfer from ${transaction.fromAccountId}`,
                    },
                ],
            });

            // Update transaction
            await tx.transaction.update({
                where: { id: transactionId },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                },
            });

            // Remove from queue
            await queueService.dequeue(transactionId);

            console.log(`✅ Transaction ${transactionId.slice(0, 8)}... completed`);

            return true;
        });
    }

    /**
     * Rollback a transaction (release reserved funds)
     */
    async rollback(transactionId: string, reason: string = 'Cancelled'): Promise<boolean> {
        return prisma.$transaction(async (tx) => {
            const transaction = await tx.transaction.findUnique({
                where: { id: transactionId },
            });

            if (!transaction) {
                return false;
            }

            // Only rollback if funds were reserved
            if (transaction.status === 'RESERVED') {
                const fromAccount = await tx.account.update({
                    where: { id: transaction.fromAccountId },
                    data: {
                        reservedAmount: { decrement: transaction.amount },
                    },
                });

                // Create release ledger entry
                await tx.ledgerEntry.create({
                    data: {
                        accountId: transaction.fromAccountId,
                        transactionId,
                        type: 'RELEASE',
                        amount: transaction.amount,
                        balanceAfter: fromAccount.balance,
                        description: `Released: ${reason}`,
                    },
                });
            }

            // Update transaction
            await tx.transaction.update({
                where: { id: transactionId },
                data: {
                    status: 'CANCELLED',
                    failureReason: reason,
                },
            });

            // Remove from queue
            await queueService.dequeue(transactionId);

            console.log(`❌ Transaction ${transactionId.slice(0, 8)}... rolled back: ${reason}`);

            return true;
        });
    }

    /**
     * Get transaction by ID
     */
    async getById(transactionId: string): Promise<Transaction | null> {
        return prisma.transaction.findUnique({
            where: { id: transactionId },
            include: {
                fromAccount: {
                    select: { accountNumber: true, email: true },
                },
                toAccount: {
                    select: { accountNumber: true, email: true },
                },
            },
        });
    }

    /**
     * Get transactions for an account
     */
    async getForAccount(accountId: string): Promise<Transaction[]> {
        return prisma.transaction.findMany({
            where: {
                OR: [
                    { fromAccountId: accountId },
                    { toAccountId: accountId },
                ],
            },
            include: {
                fromAccount: { select: { accountNumber: true } },
                toAccount: { select: { accountNumber: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }

    /**
     * Get pending transactions (awaiting manual completion)
     */
    async getPending(): Promise<Transaction[]> {
        return prisma.transaction.findMany({
            where: {
                status: { in: ['QUEUED', 'PENDING_MANUAL', 'RESERVED'] },
            },
            include: {
                fromAccount: { select: { accountNumber: true, tier: true } },
                toAccount: { select: { accountNumber: true } },
            },
            orderBy: [
                { basePriority: 'desc' },
                { createdAt: 'asc' },
            ],
        });
    }

    /**
     * Complete a pending transaction (admin action)
     */
    async completeManual(transactionId: string): Promise<boolean> {
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
        });

        if (!transaction) {
            return false;
        }

        // If not yet reserved, reserve first (handles QUEUED and PENDING_MANUAL)
        if (['QUEUED', 'PENDING_MANUAL'].includes(transaction.status)) {
            const reserved = await this.reserveFunds(transactionId);
            if (!reserved) {
                return false;
            }
        }

        // Then finalize
        return this.finalize(transactionId);
    }

    /**
     * Process the next highest-priority transaction from the queue
     */
    async processNext(): Promise<{ success: boolean; transactionId?: string }> {
        // Get the highest priority pending transaction
        const nextTx = await prisma.transaction.findFirst({
            where: {
                status: { in: ['QUEUED', 'PENDING_MANUAL', 'RESERVED'] },
            },
            orderBy: [
                { basePriority: 'desc' },
                { createdAt: 'asc' },
            ],
        });

        if (!nextTx) {
            return { success: false };
        }

        const completed = await this.completeManual(nextTx.id);
        return { success: completed, transactionId: nextTx.id };
    }
}

export const transactionService = new TransactionService();
