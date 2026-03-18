import { Router } from 'express';
import { 
  getAllLots, 
  getLotById, 
  getLotsByImmeuble,
  createLot, 
  updateLot, 
  deleteLot 
} from '../controllers/lots.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/',                    getAllLots);
router.get('/immeuble/:immeubleId', getLotsByImmeuble);
router.get('/:id',                 getLotById);
router.post('/',   requireRole('editor', 'admin'), createLot);
router.put('/:id', requireRole('editor', 'admin'), updateLot);
router.delete('/:id', requireRole('admin'),        deleteLot);

export default router;
