import { Router } from 'express';
import {
  getAllBaux,
  getBailById,
  createBail,
  updateBail,
  deleteBail,
  terminateBail
} from '../controllers/baux.controller';
import { downloadTemplate, previewImport, confirmImport, upload } from '../controllers/import.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

// Import Excel
router.get('/import/template',                requireRole('editor', 'admin'), downloadTemplate);
router.post('/import/preview',  upload.single('file'), requireRole('editor', 'admin'), previewImport);
router.post('/import/confirm',                requireRole('editor', 'admin'), confirmImport);

router.get('/',    getAllBaux);
router.get('/:id', getBailById);
router.post('/',               requireRole('editor', 'admin'), createBail);
router.put('/:id',             requireRole('editor', 'admin'), updateBail);
router.post('/:id/terminate',  requireRole('editor', 'admin'), terminateBail);
router.delete('/:id',          requireRole('admin'),           deleteBail);

export default router;
