import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { getImpayesReport, createRelance, getRelancesByBail } from '../controllers/impayes.controller';

const router = Router();
router.use(authMiddleware);

router.get('/report',                  getImpayesReport);
router.get('/:bail_id/relances',       getRelancesByBail);
router.post('/:bail_id/relance',       requireRole('editor', 'admin'), createRelance);

export default router;
