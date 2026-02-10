import redis, { REDIS_KEYS } from '../config/redis';
import { config } from '../config';
import prisma from '../config/database';
import { queueService } from './queue.service';

export class TimelockService {
    /**
     * Add transaction to time-lock heap
     * Score = unlock timestamp (Unix seconds) for min-heap behavior
     */
    async lockTransaction(transactionId: string, durationSeconds: number = config.timelockSeconds): Promise<Date> {
        const unlockTime = new Date(Date.now() + durationSeconds * 1000);
        const score = Math.floor(unlockTime.getTime() / 1000);

        await redis.zadd(REDIS_KEYS.TIMELOCK_HEAP, score, transactionId);

        // Update transaction in DB
        await prisma.transaction.update({
            where: { id: transactionId },
            data: {
                status: 'LOCKED',
                lockedUntil: unlockTime,
            },
        });

        console.log(`🔒 Transaction ${transactionId.slice(0, 8)}... locked until ${unlockTime.toISOString()}`);

        return unlockTime;
    }

    /**
     * Get transactions that have been unlocked (unlock time <= now)
     */
    async getUnlockedTransactions(): Promise<string[]> {
        const nowSeconds = Math.floor(Date.now() / 1000);

        // Get all transactions with score <= now
        const unlocked = await redis.zrangebyscore(
            REDIS_KEYS.TIMELOCK_HEAP,
            '-inf',
            nowSeconds
        );

        return unlocked;
    }

    /**
     * Move unlocked transaction from time-lock heap to priority queue
     */
    async moveToQueue(transactionId: string): Promise<void> {
        // Get transaction details
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
            include: { fromAccount: true },
        });

        if (!transaction) {
            console.error(`Transaction ${transactionId} not found`);
            return;
        }

        // Remove from time-lock heap
        await redis.zrem(REDIS_KEYS.TIMELOCK_HEAP, transactionId);

        // Update status to PENDING_MANUAL (awaiting admin action)
        await prisma.transaction.update({
            where: { id: transactionId },
            data: { status: 'PENDING_MANUAL' },
        });

        // Add to priority queue
        await queueService.enqueue(
            transactionId,
            transaction.basePriority,
            transaction.createdAt
        );

        console.log(`🔓 Transaction ${transactionId.slice(0, 8)}... unlocked and moved to priority queue`);
    }

    /**
     * Process all unlocked transactions
     * Returns number of transactions moved to queue
     */
    async processUnlocked(): Promise<number> {
        const unlocked = await this.getUnlockedTransactions();

        for (const txId of unlocked) {
            await this.moveToQueue(txId);
        }

        return unlocked.length;
    }

    /**
     * Get time-lock heap size
     */
    async getHeapSize(): Promise<number> {
        return redis.zcard(REDIS_KEYS.TIMELOCK_HEAP);
    }

    /**
     * Get all locked transactions with unlock times
     */
    async getLockedTransactions(): Promise<{ id: string; unlockAt: Date }[]> {
        const results = await redis.zrange(
            REDIS_KEYS.TIMELOCK_HEAP,
            0,
            -1,
            'WITHSCORES'
        );

        const items: { id: string; unlockAt: Date }[] = [];
        for (let i = 0; i < results.length; i += 2) {
            items.push({
                id: results[i],
                unlockAt: new Date(parseInt(results[i + 1]) * 1000),
            });
        }

        return items;
    }

    /**
     * Cancel a locked transaction
     */
    async cancelLocked(transactionId: string): Promise<boolean> {
        const removed = await redis.zrem(REDIS_KEYS.TIMELOCK_HEAP, transactionId);

        if (removed > 0) {
            await prisma.transaction.update({
                where: { id: transactionId },
                data: { status: 'CANCELLED' },
            });
            return true;
        }

        return false;
    }
}

export const timelockService = new TimelockService();
