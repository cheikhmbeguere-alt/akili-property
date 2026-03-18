import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest, resolveRequestSciIds } from '../middleware/auth.middleware';

export const getAllLots = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);
    if (sciIds !== null && sciIds.length === 0) return res.json([]);

    let whereClause = '';
    const params: any[] = [];
    if (sciIds !== null) {
      const ph = sciIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      whereClause = `WHERE l.immeuble_id IN (SELECT immeuble_id FROM sci_immeuble WHERE sci_id IN (${ph}))`;
      params.push(...sciIds);
    }

    const result = await pool.query(
      `SELECT l.*,
              i.code as immeuble_code,
              i.name as immeuble_name,
              b.status as bail_status,
              json_agg(
                json_build_object(
                  'sci_id', s.id,
                  'sci_code', s.code,
                  'sci_name', s.name
                )
              ) FILTER (WHERE s.id IS NOT NULL) as sci_list
       FROM lots l
       JOIN immeubles i ON l.immeuble_id = i.id
       LEFT JOIN baux b ON b.lot_id = l.id AND b.status = 'actif'
       LEFT JOIN sci_immeuble si ON i.id = si.immeuble_id
       LEFT JOIN sci s ON si.sci_id = s.id
       ${whereClause}
       GROUP BY l.id, i.id, b.status
       ORDER BY i.code, l.code`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get all lots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getLotById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT l.*, 
              i.code as immeuble_code,
              i.name as immeuble_name
       FROM lots l
       JOIN immeubles i ON l.immeuble_id = i.id
       WHERE l.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lot not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get lot by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getLotsByImmeuble = async (req: AuthRequest, res: Response) => {
  try {
    const { immeubleId } = req.params;

    const result = await pool.query(
      `SELECT l.*,
              i.code as immeuble_code,
              i.name as immeuble_name,
              b.id as bail_id,
              b.status as bail_status,
              loc.company_name as locataire_name
       FROM lots l
       JOIN immeubles i ON l.immeuble_id = i.id
       LEFT JOIN baux b ON l.id = b.lot_id AND b.status = 'actif'
       LEFT JOIN locataires loc ON b.locataire_id = loc.id
       WHERE l.immeuble_id = $1
       ORDER BY l.code`,
      [immeubleId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get lots by immeuble error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createLot = async (req: AuthRequest, res: Response) => {
  try {
    const { immeuble_id, code, name, surface, floor, type, description } = req.body;

    if (!immeuble_id || !code || !surface) {
      return res.status(400).json({ error: 'Immeuble, code and surface are required' });
    }

    const result = await pool.query(
      `INSERT INTO lots (immeuble_id, code, name, surface, floor, type, description) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [immeuble_id, code, name, surface, floor, type, description]
    );

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create', 'lot', result.rows[0].id, JSON.stringify(req.body)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Create lot error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Lot code already exists for this immeuble' });
    }
    if (error.code === '23503') {
      return res.status(404).json({ error: 'Immeuble not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateLot = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { code, name, surface, floor, type, description } = req.body;

    const result = await pool.query(
      `UPDATE lots 
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           surface = COALESCE($3, surface),
           floor = COALESCE($4, floor),
           type = COALESCE($5, type),
           description = COALESCE($6, description)
       WHERE id = $7
       RETURNING *`,
      [code, name, surface, floor, type, description, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lot not found' });
    }

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'update', 'lot', id, JSON.stringify(req.body)]
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Update lot error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Lot code already exists for this immeuble' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteLot = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Vérifier si le lot a des baux actifs
    const bailCheck = await pool.query(
      'SELECT COUNT(*) as count FROM baux WHERE lot_id = $1 AND status = $2',
      [id, 'actif']
    );

    if (parseInt(bailCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete lot with active leases. Please terminate the lease first.' 
      });
    }

    const result = await pool.query(
      'DELETE FROM lots WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lot not found' });
    }

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'delete', 'lot', id]
    );

    res.json({ message: 'Lot deleted successfully' });
  } catch (error) {
    console.error('Delete lot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
