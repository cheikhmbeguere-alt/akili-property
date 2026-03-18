import { Router } from 'express';
import {
  getTokenStatus,
  saveToken,
  deleteToken,
  getTransactions,
  importTransaction,
  importBatch,
} from '../controllers/pennylane.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/token',            getTokenStatus);
router.post('/token',           requireRole('admin'), saveToken);
router.delete('/token',         requireRole('admin'), deleteToken);
router.get('/transactions',     getTransactions);
router.post('/import',          requireRole('editor', 'admin'), importTransaction);
router.post('/import-batch',    requireRole('editor', 'admin'), importBatch);

export default router;
