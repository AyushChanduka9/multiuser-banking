import { Router, Request, Response } from 'express';
import { validate, schemas } from '../middleware/validation';
import { authService } from '../services/auth.service';

const router = Router();

/**
 * POST /api/auth/admin/login - Admin login
 */
router.post('/admin/login', validate(schemas.login), async (req: Request, res: Response) => {
    try {
        const { accountNumber, pin } = req.body;

        const result = await authService.login(accountNumber, pin);

        if (!result) {
            res.status(401).json({ error: 'Invalid account number or PIN' });
            return;
        }

        // Check if admin role
        if (result.account.role !== 'ADMIN') {
            res.status(403).json({ error: 'Admin access denied' });
            return;
        }

        res.json({
            token: result.token,
            account: result.account,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
