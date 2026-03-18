import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import {
  getConfig,
  envoyerRelance,
  envoyerAlertesEcheance,
  envoyerResumeMensuel,
} from '../controllers/notifications.controller';

const router = Router();
router.use(authMiddleware);

router.get('/config',              getConfig);
router.post('/relance/:bail_id',   requireRole('editor', 'admin'), envoyerRelance);
router.post('/alertes-echeance',   requireRole('admin'),           envoyerAlertesEcheance);
router.post('/resume-mensuel',     requireRole('admin'),           envoyerResumeMensuel);

export default router;
