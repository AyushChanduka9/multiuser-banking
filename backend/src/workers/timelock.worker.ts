import { timelockService } from '../services/timelock.service';
import { getIO } from '../websocket';

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Time-lock worker that monitors and unlocks transactions
 * Polls every second for unlocked transactions
 */
export async function startTimelockWorker(): Promise<void> {
    if (isRunning) {
        console.log('⚠️ Time-lock worker already running');
        return;
    }

    isRunning = true;
    console.log('🔒 Time-lock worker started (polling every 1s)');

    intervalId = setInterval(async () => {
        try {
            const unlocked = await timelockService.processUnlocked();

            if (unlocked > 0) {
                console.log(`🔓 Unlocked ${unlocked} transaction(s)`);

                // Broadcast update via WebSocket
                const io = getIO();
                if (io) {
                    io.emit('timelock:update', { unlocked });
                    io.emit('queue:update', { reason: 'timelock_release' });
                }
            }
        } catch (error) {
            console.error('❌ Time-lock worker error:', error);
        }
    }, 1000);
}

/**
 * Stop the time-lock worker
 */
export function stopTimelockWorker(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    isRunning = false;
    console.log('🛑 Time-lock worker stopped');
}
