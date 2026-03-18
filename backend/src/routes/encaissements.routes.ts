import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import {
  getAllEncaissements,
  getEncaissementById,
  createEncaissement,
  updateEncaissement,
  deleteEncaissement,
  importCSV,
  getLettrage,
  getQuittancesDisponibles,
  lettrerEncaissement,
  deleteLettrage,
} from '../controllers/encaissements.controller';

const router = Router();
router.use(authMiddleware);

// CSV en mémoire (pas de fichier disque)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/',    getAllEncaissements);
router.get('/:id', getEncaissementById);
router.post('/',             requireRole('editor', 'admin'), createEncaissement);
router.put('/:id',           requireRole('editor', 'admin'), updateEncaissement);
router.delete('/:id',        requireRole('admin'),           deleteEncaissement);
router.post('/import/csv',   requireRole('editor', 'admin'), upload.single('file'), importCSV);

// Lettrage
router.get('/:id/lettrage',               getLettrage);
router.get('/:id/quittances-disponibles', getQuittancesDisponibles);
router.post('/:id/lettrer',               requireRole('editor', 'admin'), lettrerEncaissement);
router.delete('/:id/lettrer/:lettrage_id', requireRole('editor', 'admin'), deleteLettrage);

export default router;
