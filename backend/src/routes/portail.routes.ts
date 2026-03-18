import { Router } from 'express';
import {
  portailAuthMiddleware,
  loginPortail,
  getMe,
  getQuittances,
  downloadPdf,
} from '../controllers/portail.controller';

const router = Router();

// Public
router.post('/login', loginPortail);

// Protected (locataire JWT required)
router.get('/me', portailAuthMiddleware, getMe);
router.get('/quittances', portailAuthMiddleware, getQuittances);
router.get('/quittances/:id/pdf', portailAuthMiddleware, downloadPdf);

export default router;
