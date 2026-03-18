import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { dbContextMiddleware } from './db-context.middleware';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    tenantId: number | null; // null = superadmin (accès cross-tenant)
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // Vérifier que l'utilisateur existe toujours et récupérer tenant_id
    const result = await pool.query(
      'SELECT id, email, role, is_active, tenant_id FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = {
      id:       result.rows[0].id,
      email:    result.rows[0].email,
      role:     result.rows[0].role,
      tenantId: result.rows[0].tenant_id ?? null,
    };

    // Ouvrir le contexte DB (transaction dédiée + variables RLS)
    return dbContextMiddleware(req, res, next);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const adminOnly = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ─── Helper : IDs des SCI autorisées pour un utilisateur ─────────────────────
// superadmin → toutes les SCI (tous tenants)
// admin      → toutes les SCI du son tenant
// Autres     → uniquement celles dans user_sci_permissions
export const getAuthorizedSciIds = async (
  userId: number,
  role: string,
  tenantId: number | null
): Promise<number[]> => {
  if (role === 'superadmin') {
    const r = await pool.query('SELECT id FROM sci ORDER BY id');
    return r.rows.map((row: any) => row.id);
  }
  if (role === 'admin') {
    if (tenantId === null) return [];
    const r = await pool.query(
      'SELECT id FROM sci WHERE tenant_id = $1 ORDER BY id',
      [tenantId]
    );
    return r.rows.map((row: any) => row.id);
  }
  const r = await pool.query(
    'SELECT sci_id FROM user_sci_permissions WHERE user_id = $1',
    [userId]
  );
  return r.rows.map((row: any) => row.sci_id);
};

// ─── Helper : résout les SCI filtrées pour une requête ────────────────────────
// Retourne null = pas de restriction (superadmin sans filtre).
// Retourne [] = aucune donnée visible.
// Retourne [1,2,...] = restreindre à ces SCI IDs.
export const resolveRequestSciIds = async (
  req: AuthRequest
): Promise<number[] | null> => {
  const sciIdParam = req.query.sci_id ? Number(req.query.sci_id) : null;
  const { role, id: userId, tenantId } = req.user!;

  if (role === 'superadmin') {
    // Superadmin sans filtre = toutes les données
    if (!sciIdParam) return null;
    return [sciIdParam];
  }

  if (role === 'admin') {
    // Admin tenant : données de son tenant uniquement
    if (!tenantId) return [];
    if (!sciIdParam) return null; // null = toutes les SCI du tenant (RLS s'en charge)
    // Vérifier que le sci_id demandé appartient bien au tenant de l'admin
    const check = await pool.query(
      'SELECT id FROM sci WHERE id = $1 AND tenant_id = $2',
      [sciIdParam, tenantId]
    );
    return check.rows.length > 0 ? [sciIdParam] : [];
  }

  // Viewer / Editor : restreindre aux SCI autorisées
  const authorizedIds = await getAuthorizedSciIds(userId, role, tenantId);
  if (!sciIdParam) return authorizedIds;
  return authorizedIds.includes(sciIdParam) ? [sciIdParam] : [];
};

// Middleware générique — requireRole('editor', 'admin')
// superadmin est toujours autorisé, quel que soit le rôle requis
export const requireRole = (...roles: string[]) => (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || (req.user.role !== 'superadmin' && !roles.includes(req.user.role))) {
    return res.status(403).json({
      error: 'Accès refusé — droits insuffisants',
      required: roles,
      current: req.user?.role ?? 'none',
    });
  }
  next();
};
