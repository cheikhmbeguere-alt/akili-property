import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import {
  getAllChargesReelles,
  createChargeReelle,
  updateChargeReelle,
  deleteChargeReelle,
  importBatchCharges,
  getRegularisation,
} from '../controllers/charges_reelles.controller';

const router = Router();
router.use(authMiddleware);

router.get('/',                 getAllChargesReelles);
router.get('/regularisation',   getRegularisation);
router.post('/',                requireRole('editor', 'admin', 'superadmin'), createChargeReelle);
router.put('/:id',              requireRole('editor', 'admin', 'superadmin'), updateChargeReelle);
router.delete('/:id',           requireRole('admin', 'superadmin'),           deleteChargeReelle);
router.post('/import-batch',    requireRole('editor', 'admin', 'superadmin'), importBatchCharges);

export default router;
