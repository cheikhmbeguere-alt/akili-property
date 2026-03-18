import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { downloadGlobalTemplate, previewGlobalImport, confirmGlobalImport, uploadGlobal } from '../controllers/import_global.controller';

const router = Router();

router.use(authMiddleware);

router.get('/template',                                          requireRole('editor','admin'), downloadGlobalTemplate);
router.post('/preview', uploadGlobal.single('file'),            requireRole('editor','admin'), previewGlobalImport);
router.post('/confirm',                                          requireRole('editor','admin'), confirmGlobalImport);

export default router;
