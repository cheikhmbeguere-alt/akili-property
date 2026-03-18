import { Router } from 'express';
import {
  getBauxAIndexer,
  applyIndexation,
  applyBatchIndexation,
  getHistorique,
  getIndices,
  getIndiceValues,
  addIndiceValue,
  syncInsee,
  getRattrapage,
} from '../controllers/indexation.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/a-faire',              getBauxAIndexer);
router.get('/rattrapage/:bail_id',  getRattrapage);
router.post('/apply/:bail_id',      requireRole('editor', 'admin'), applyIndexation);
router.post('/apply-batch',         requireRole('editor', 'admin'), applyBatchIndexation);
router.get('/historique',           getHistorique);
router.get('/indices',              getIndices);
router.get('/indices/:id/values',   getIndiceValues);
router.post('/indices/:id/values',  requireRole('editor', 'admin'), addIndiceValue);
router.post('/sync-insee',          requireRole('admin'), syncInsee);

export default router;
