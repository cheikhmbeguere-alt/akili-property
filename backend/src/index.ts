import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import pool from './config/database';

// Import des routes
import authRoutes from './routes/auth.routes';
import sciRoutes from './routes/sci.routes';
import immeublesRoutes from './routes/immeubles.routes';
import lotsRoutes from './routes/lots.routes';
import locatairesRoutes from './routes/locataires.routes';
import bauxRoutes from './routes/baux.routes';
import quittancesRoutes from './routes/quittances.routes';
import encaissementsRoutes from './routes/encaissements.routes';
import impayesRoutes from './routes/impayes.routes';
import reportsRoutes from './routes/reports.routes';
import indicesRoutes from './routes/indices.routes';
import adminRoutes from './routes/admin.routes';
import exportRoutes from './routes/export.routes';
import indexationRoutes from './routes/indexation.routes';
import pennylaneRoutes from './routes/pennylane.routes';
import alertesRoutes from './routes/alertes.routes';
import depotGarantieRoutes from './routes/depot_garantie.routes';
import tenantsRoutes from './routes/tenants.routes';
import chargesReellesRoutes from './routes/charges_reelles.routes';
import notificationsRoutes from './routes/notifications.routes';
import portailRoutes from './routes/portail.routes';
import importGlobalRoutes from './routes/import_global.routes';

// Configuration
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware de sécurité
app.use(helmet());

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  process.env.PORTAL_URL  || 'http://localhost:5174',
  'http://localhost:5175',
  'https://akiliproperty.fr',
  'https://www.akiliproperty.fr',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limite à 100 requêtes par IP
});
app.use('/api/', limiter);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sci', sciRoutes);
app.use('/api/immeubles', immeublesRoutes);
app.use('/api/lots', lotsRoutes);
app.use('/api/locataires', locatairesRoutes);
app.use('/api/baux', bauxRoutes);
app.use('/api/quittances', quittancesRoutes);
app.use('/api/encaissements', encaissementsRoutes);
app.use('/api/impayes', impayesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/indices', indicesRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/indexations', indexationRoutes);
app.use('/api/pennylane',  pennylaneRoutes);
app.use('/api/alertes',        alertesRoutes);
app.use('/api/depot-garantie', depotGarantieRoutes);
app.use('/api/tenants',        tenantsRoutes);
app.use('/api/charges-reelles',  chargesReellesRoutes);
app.use('/api/notifications',    notificationsRoutes);
app.use('/api/portail',          portailRoutes);
app.use('/api/import/global',    importGlobalRoutes);

// Health check
app.get('/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'Connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      database: 'Disconnected'
    });
  }
});

// Route 404
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

// Gestion de l'arrêt propre
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

export default app;
