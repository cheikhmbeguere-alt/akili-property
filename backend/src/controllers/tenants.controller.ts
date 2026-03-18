import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// GET /api/tenants
export const getAllTenants = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.slug, t.is_active, t.created_at,
              COUNT(DISTINCT u.id) AS nb_users,
              COUNT(DISTINCT s.id) AS nb_sci
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id
       LEFT JOIN sci s   ON s.tenant_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('getAllTenants error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/tenants
export const createTenant = async (req: AuthRequest, res: Response) => {
  const { name, slug } = req.body;
  if (!name || !slug) {
    return res.status(400).json({ error: 'name et slug sont requis' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO tenants (name, slug) VALUES ($1, $2)
       RETURNING id, name, slug, is_active, created_at`,
      [name.trim(), slug.toLowerCase().trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ce slug est déjà utilisé' });
    }
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
};

// PUT /api/tenants/:id
export const updateTenant = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, is_active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tenants
       SET name      = COALESCE($1, name),
           is_active = COALESCE($2, is_active),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, slug, is_active`,
      [name, is_active, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant introuvable' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
};
