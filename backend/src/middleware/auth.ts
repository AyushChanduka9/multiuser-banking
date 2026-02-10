import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../config/database';

// Extend Express Request to include user info
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                accountNumber: string;
                role: 'ADMIN' | 'CUSTOMER';
            };
        }
    }
}

export interface JwtPayload {
    id: string;
    accountNumber: string;
    role: 'ADMIN' | 'CUSTOMER';
    iat: number;
    exp: number;
}

/**
 * Middleware to verify JWT token
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
        req.user = {
            id: decoded.id,
            accountNumber: decoded.accountNumber,
            role: decoded.role,
        };
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/**
 * Middleware to require admin role
 */
export function adminOnly(req: Request, res: Response, next: NextFunction): void {
    if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
}

/**
 * Middleware to require customer role
 */
export function customerOnly(req: Request, res: Response, next: NextFunction): void {
    if (!req.user || req.user.role !== 'CUSTOMER') {
        res.status(403).json({ error: 'Customer access required' });
        return;
    }
    next();
}

/**
 * Generate JWT token
 */
export function generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.jwtSecret, {
        expiresIn: config.jwtExpiry as string | number
    } as jwt.SignOptions);
}
