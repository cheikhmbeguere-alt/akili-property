import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getAlertes } from '../controllers/alertes.controller';

const router = Router();
router.use(authMiddleware);

router.get('/', getAlertes);

export default router;
