import { queueService } from '../services/queue.service';
import { getIO } from '../websocket';

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

const AGING_UPDATE_INTERVAL = 5000; // Update priorities every 5 seconds

/**
 * Queue worker that handles priority aging
 * Periodically recalculates effective priorities
 */
export async function startQueueWorker(): Promise<void> {
    if (isRunning) {
        console.log('⚠️ Queue worker already running');
        return;
    }

    isRunning = true;
    console.log('📊 Queue worker started (aging update every 5s)');

    intervalId = setInterval(async () => {
        try {
            const updated = await queueService.updateAllPriorities();

            if (updated > 0) {
                // Broadcast queue update via WebSocket
                const io = getIO();
                if (io) {
                    const stats = await queueService.getStats();
                    io.emit('queue:stats', stats);
                }
            }
        } catch (error) {
            console.error('❌ Queue worker error:', error);
        }
    }, AGING_UPDATE_INTERVAL);
}

/**
 * Stop the queue worker
 */
export function stopQueueWorker(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    isRunning = false;
    console.log('🛑 Queue worker stopped');
}
