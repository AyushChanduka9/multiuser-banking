import Redis from 'ioredis';
import { config } from './index';

// Create Redis client
const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

redis.on('connect', () => {
    console.log('✅ Redis connected');
});

redis.on('error', (err) => {
    console.error('❌ Redis error:', err.message);
});

// Redis keys constants
export const REDIS_KEYS = {
    PRIORITY_QUEUE: 'zset:priority_queue',
    TIMELOCK_HEAP: 'zset:timelock_heap',
    TXN_DATA: (id: string) => `hash:txn:${id}`,
    TXN_LOCK: (id: string) => `lock:txn:${id}`,
    QUEUE_STATS: 'hash:queue_stats',
};

// Graceful shutdown
process.on('beforeExit', async () => {
    await redis.quit();
});

export default redis;
