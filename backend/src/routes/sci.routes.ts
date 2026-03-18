import { Router } from 'express';
import { 
  getAllSCI, 
  getSCIById, 
  createSCI, 
  updateSCI, 
  deleteSCI 
} from '../controllers/sci.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/',    getAllSCI);
router.get('/:id', getSCIById);
router.post('/',   requireRole('editor', 'admin'), createSCI);
router.put('/:id', requireRole('editor', 'admin'), updateSCI);
router.delete('/:id', requireRole('admin'),        deleteSCI);

export default router;
