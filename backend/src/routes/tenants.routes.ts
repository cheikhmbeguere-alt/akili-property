import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { getAllTenants, createTenant, updateTenant } from '../controllers/tenants.controller';

const router = Router();
router.use(authMiddleware);
router.use(requireRole('superadmin')); // réservé AKILI uniquement

router.get('/',    getAllTenants);
router.post('/',   createTenant);
router.put('/:id', updateTenant);

export default router;
