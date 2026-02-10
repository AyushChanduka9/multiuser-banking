import redis, { REDIS_KEYS } from '../config/redis';
import { config } from '../config';
import prisma from '../config/database';
import { Transaction, Urgency, Tier } from '@prisma/client';

export class QueueService {
    /**
     * Calculate base priority score
     * Priority = (Urgency * 2.0) + (Tier * 1.5) - (Risk * 0.5)
     */
    calculateBasePriority(urgency: Urgency, tier: Tier, riskScore: number): number {
        const urgencyWeight = config.urgencyWeights[urgency];
        const tierWeight = config.tierWeights[tier];

        return (urgencyWeight * 2.0) + (tierWeight * 1.5) - (riskScore * 0.5);
    }

    /**
     * Calculate effective priority with aging
     * EffectivePriority = BasePriority + (WaitSeconds * AgingFactor)
     */
    calculateEffectivePriority(basePriority: number, createdAt: Date): number {
        const waitSeconds = Math.floor((Date.now() - createdAt.getTime()) / 1000);
        return basePriority + (waitSeconds * config.agingFactor);
    }

    /**
     * Add transaction to priority queue
     * Using negative score so highest priority = lowest score (Redis ZSET)
     */
    async enqueue(transactionId: string, basePriority: number, createdAt: Date): Promise<void> {
        const effectivePriority = this.calculateEffectivePriority(basePriority, createdAt);
        const score = -effectivePriority;

        await redis.zadd(REDIS_KEYS.PRIORITY_QUEUE, score, transactionId);

        // Cache transaction metadata for quick access
        await redis.hset(REDIS_KEYS.TXN_DATA(transactionId), {
            basePriority: basePriority.toString(),
            createdAt: createdAt.toISOString(),
        });
    }

    /**
     * Remove transaction from queue
     */
    async dequeue(transactionId: string): Promise<void> {
        await redis.zrem(REDIS_KEYS.PRIORITY_QUEUE, transactionId);
        await redis.del(REDIS_KEYS.TXN_DATA(transactionId));
    }

    /**
     * Get top N transactions from queue with updated priorities
     */
    async getTop(count: number = 10): Promise<{ id: string; score: number }[]> {
        const results = await redis.zrange(
            REDIS_KEYS.PRIORITY_QUEUE,
            0,
            count - 1,
            'WITHSCORES'
        );

        const items: { id: string; score: number }[] = [];
        for (let i = 0; i < results.length; i += 2) {
            items.push({
                id: results[i],
                score: parseFloat(results[i + 1]),
            });
        }

        return items;
    }

    /**
     * Get highest priority transaction ID
     */
    async popTop(): Promise<string | null> {
        const result = await redis.zrange(REDIS_KEYS.PRIORITY_QUEUE, 0, 0);
        return result[0] || null;
    }

    /**
     * Recalculate and update priorities for all queued transactions
     * Called periodically by worker to implement aging
     */
    async updateAllPriorities(): Promise<number> {
        const members = await redis.zrange(REDIS_KEYS.PRIORITY_QUEUE, 0, -1);
        let updated = 0;

        for (const txId of members) {
            const data = await redis.hgetall(REDIS_KEYS.TXN_DATA(txId));

            if (data.basePriority && data.createdAt) {
                const basePriority = parseFloat(data.basePriority);
                const createdAt = new Date(data.createdAt);
                const effectivePriority = this.calculateEffectivePriority(basePriority, createdAt);

                await redis.zadd(REDIS_KEYS.PRIORITY_QUEUE, -effectivePriority, txId);
                updated++;
            }
        }

        return updated;
    }

    /**
     * Get queue size
     */
    async getQueueSize(): Promise<number> {
        return redis.zcard(REDIS_KEYS.PRIORITY_QUEUE);
    }

    /**
     * Acquire lock for processing a transaction
     * Returns true if lock acquired, false if already locked
     */
    async acquireLock(transactionId: string, ttlMs: number = 30000): Promise<boolean> {
        const result = await redis.set(
            REDIS_KEYS.TXN_LOCK(transactionId),
            Date.now().toString(),
            'PX',
            ttlMs,
            'NX'
        );
        return result === 'OK';
    }

    /**
     * Release lock for a transaction
     */
    async releaseLock(transactionId: string): Promise<void> {
        await redis.del(REDIS_KEYS.TXN_LOCK(transactionId));
    }

    /**
     * Get queue statistics
     */
    async getStats(): Promise<{
        queueSize: number;
        timelockSize: number;
        topItems: { id: string; effectivePriority: number }[];
    }> {
        const [queueSize, timelockSize] = await Promise.all([
            redis.zcard(REDIS_KEYS.PRIORITY_QUEUE),
            redis.zcard(REDIS_KEYS.TIMELOCK_HEAP),
        ]);

        const topRaw = await this.getTop(5);
        const topItems = topRaw.map(item => ({
            id: item.id,
            effectivePriority: -item.score, // Convert back to positive
        }));

        return { queueSize, timelockSize, topItems };
    }
}

export const queueService = new QueueService();
