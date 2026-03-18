import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => res.json([]));
router.get('/:id', (req, res) => res.json({}));
router.post('/', (req, res) => res.status(201).json({}));
router.put('/:id', (req, res) => res.json({}));

export default router;
