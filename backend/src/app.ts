import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config, validateConfig } from './config';
import prisma from './config/database';
import redis from './config/redis';
import { initWebSocket } from './websocket';
import { startTimelockWorker, stopTimelockWorker } from './workers/timelock.worker';
import { startQueueWorker, stopQueueWorker } from './workers/queue.worker';

// Controllers
import adminController from './controllers/admin.controller';
import customerController from './controllers/customer.controller';
import otpController from './controllers/otp.controller';
import authController from './controllers/auth.controller';

// Validate configuration
validateConfig();

// Create Express app
const app: Express = express();
const httpServer = createServer(app);

// Middleware
app.use(cors({
    origin: config.frontendUrl,
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authController);
app.use('/api/otp', otpController);
app.use('/api/admin', adminController);
app.use('/api/customer', customerController);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
});

// Initialize WebSocket
initWebSocket(httpServer);

// Graceful shutdown
async function shutdown() {
    console.log('\n🛑 Shutting down...');

    stopTimelockWorker();
    stopQueueWorker();

    await prisma.$disconnect();
    await redis.quit();

    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
async function start() {
    try {
        // Connect to Redis
        await redis.connect();

        // Test database connection
        await prisma.$connect();
        console.log('✅ Database connected');

        // Start workers
        startTimelockWorker();
        startQueueWorker();

        // Start HTTP server
        httpServer.listen(config.port, () => {
            console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🏦  NEXUS BANKING SYSTEM                           ║
║                                                       ║
║   Server running on http://localhost:${config.port}           ║
║   Environment: ${config.nodeEnv.padEnd(39)}║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
      `);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

start();
