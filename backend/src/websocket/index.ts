import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload } from '../middleware/auth';

let io: SocketServer | null = null;

/**
 * Initialize WebSocket server
 */
export function initWebSocket(server: HttpServer): SocketServer {
    io = new SocketServer(server, {
        cors: {
            origin: config.frontendUrl,
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    // Authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error('Authentication required'));
        }

        try {
            const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
            socket.data.user = decoded;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket: Socket) => {
        const user = socket.data.user as JwtPayload;
        console.log(`🔌 WebSocket connected: ${user.accountNumber} (${user.role})`);

        // Join role-specific room
        socket.join(user.role.toLowerCase());

        // Join personal room for transaction updates
        socket.join(`user:${user.id}`);

        // Handle ping/pong for connection health
        socket.on('ping', () => {
            socket.emit('pong');
        });

        socket.on('disconnect', () => {
            console.log(`🔌 WebSocket disconnected: ${user.accountNumber}`);
        });
    });

    console.log('🔌 WebSocket server initialized');

    return io;
}

/**
 * Get Socket.IO instance
 */
export function getIO(): SocketServer | null {
    return io;
}

/**
 * Emit to specific user
 */
export function emitToUser(userId: string, event: string, data: any): void {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
    }
}

/**
 * Emit to all admins
 */
export function emitToAdmins(event: string, data: any): void {
    if (io) {
        io.to('admin').emit(event, data);
    }
}

/**
 * Emit to all customers
 */
export function emitToCustomers(event: string, data: any): void {
    if (io) {
        io.to('customer').emit(event, data);
    }
}

/**
 * Broadcast to all connected clients
 */
export function broadcast(event: string, data: any): void {
    if (io) {
        io.emit(event, data);
    }
}
