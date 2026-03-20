import { Router } from 'express';
import { login, getMe, logout, changePassword, microsoftAuth, microsoftCallback } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.post('/login',              login);
router.get('/microsoft',           microsoftAuth);
router.get('/callback/azure-ad',   microsoftCallback);
router.get('/me',                  authMiddleware, getMe);
router.post('/logout',             authMiddleware, logout);
router.put('/password',            authMiddleware, changePassword);

export default router;
