import { Router } from 'express';
import { 
  getAllImmeubles, 
  getImmeubleById, 
  createImmeuble, 
  updateImmeuble, 
  deleteImmeuble 
} from '../controllers/immeubles.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/',    getAllImmeubles);
router.get('/:id', getImmeubleById);
router.post('/',   requireRole('editor', 'admin'), createImmeuble);
router.put('/:id', requireRole('editor', 'admin'), updateImmeuble);
router.delete('/:id', requireRole('admin'),        deleteImmeuble);

export default router;
