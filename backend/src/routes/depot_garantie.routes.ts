import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getDepotGarantie,
  getCalculSortie,
  enregistrerSortie,
  getMouvements,
} from '../controllers/depot_garantie.controller';

const router = Router();
router.use(authMiddleware);

router.get('/',                         getDepotGarantie);
router.get('/baux/:id/calcul-sortie',   getCalculSortie);
router.post('/baux/:id/sortie',         enregistrerSortie);
router.get('/mouvements/:bailId',       getMouvements);

export default router;
