import { Router } from 'express';
import { 
  getAllLocataires, 
  getLocataireById, 
  createLocataire, 
  updateLocataire, 
  deleteLocataire 
} from '../controllers/locataires.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/',    getAllLocataires);
router.get('/:id', getLocataireById);
router.post('/',   requireRole('editor', 'admin'), createLocataire);
router.put('/:id', requireRole('editor', 'admin'), updateLocataire);
router.delete('/:id', requireRole('admin'),        deleteLocataire);

export default router;
