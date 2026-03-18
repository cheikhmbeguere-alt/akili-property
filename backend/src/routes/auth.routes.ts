import { Router } from 'express';
import { login, getMe, logout, changePassword } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', login);
router.get('/me', authMiddleware, getMe);
router.post('/logout', authMiddleware, logout);
router.put('/password', authMiddleware, changePassword);

export default router;
