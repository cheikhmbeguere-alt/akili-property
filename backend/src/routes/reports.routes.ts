import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getCompteRenduGestion, exportCRGExcel } from '../controllers/crg.controller';

const router = Router();
router.use(authMiddleware);

router.get('/compte-rendu-gestion',        getCompteRenduGestion);
router.get('/compte-rendu-gestion/export', exportCRGExcel);

export default router;
