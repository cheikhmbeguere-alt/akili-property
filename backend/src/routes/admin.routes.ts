import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { getAllUsers, createUser, updateUser, getUserSciPermissions, setUserSciPermissions, getAuditLogs } from '../controllers/admin.controller';

const router = Router();
router.use(authMiddleware);
router.use(requireRole('admin', 'superadmin')); // admin du tenant ou superadmin AKILI

router.get('/users',                          getAllUsers);
router.post('/users',                         createUser);
router.put('/users/:id',                      updateUser);
router.get('/users/:id/sci-permissions',      getUserSciPermissions);
router.put('/users/:id/sci-permissions',      setUserSciPermissions);

// Journal d'audit — superadmin uniquement
router.get('/audit-logs', requireRole('superadmin'), getAuditLogs);

export default router;
