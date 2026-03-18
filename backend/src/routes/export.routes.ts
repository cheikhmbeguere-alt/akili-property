import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { exportEtatLocatif, exportFEC } from '../controllers/export.controller';

const router = Router();

router.use(authMiddleware);

router.get('/etat-locatif', exportEtatLocatif);
router.get('/fec',          exportFEC);

export default router;
