import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import {
  getAllQuittances,
  getQuittanceById,
  generateQuittances,
  getPDF,
  markPaid,
  cancelQuittance,
} from '../controllers/quittances.controller';

const router = Router();
router.use(authMiddleware);

router.get('/',            getAllQuittances);
router.get('/:id',         getQuittanceById);
router.get('/:id/pdf',     getPDF);

router.post('/generate',   requireRole('editor', 'admin'), generateQuittances);
router.post('/:id/paid',   requireRole('editor', 'admin'), markPaid);
router.delete('/:id',      requireRole('editor', 'admin'), cancelQuittance);

export default router;
