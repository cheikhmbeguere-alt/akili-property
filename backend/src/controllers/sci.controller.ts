import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest, getAuthorizedSciIds } from '../middleware/auth.middleware';

export const getAllSCI = async (req: AuthRequest, res: Response) => {
  try {
    const authorizedIds = await getAuthorizedSciIds(req.user!.id, req.user!.role, req.user!.tenantId ?? null);
    if (authorizedIds.length === 0) {
      return res.json([]);
    }
    const placeholders = authorizedIds.map((_: any, i: number) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `SELECT id, code, name, siret, address, tva_number, created_at, updated_at
       FROM sci
       WHERE id IN (${placeholders})
       ORDER BY code`,
      authorizedIds
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get all SCI error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSCIById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT s.*, 
              json_agg(
                json_build_object(
                  'immeuble_id', i.id,
                  'immeuble_code', i.code,
                  'immeuble_name', i.name,
                  'ownership_percentage', si.ownership_percentage,
                  'tantiemes', si.tantiemes
                )
              ) FILTER (WHERE i.id IS NOT NULL) as immeubles
       FROM sci s
       LEFT JOIN sci_immeuble si ON s.id = si.sci_id
       LEFT JOIN immeubles i ON si.immeuble_id = i.id
       WHERE s.id = $1
       GROUP BY s.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SCI not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get SCI by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createSCI = async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, siret, address, tva_number, tenant_id } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }

    // Superadmin peut préciser un tenant_id ; admin hérite du sien
    const assignedTenantId = req.user!.role === 'superadmin'
      ? (tenant_id ?? null)
      : (req.user!.tenantId ?? null);

    const result = await pool.query(
      `INSERT INTO sci (code, name, siret, address, tva_number, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [code, name, siret, address, tva_number, assignedTenantId]
    );

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create', 'sci', result.rows[0].id, JSON.stringify(req.body)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Create SCI error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'SCI code already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateSCI = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { code, name, siret, address, tva_number } = req.body;

    const result = await pool.query(
      `UPDATE sci 
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           siret = COALESCE($3, siret),
           address = COALESCE($4, address),
           tva_number = COALESCE($5, tva_number)
       WHERE id = $6
       RETURNING *`,
      [code, name, siret, address, tva_number, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SCI not found' });
    }

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'update', 'sci', id, JSON.stringify(req.body)]
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Update SCI error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'SCI code already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteSCI = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Vérifier qu'aucun immeuble n'est lié à cette SCI
    const immeubleCheck = await pool.query(
      'SELECT COUNT(*) AS count FROM sci_immeuble WHERE sci_id = $1',
      [id]
    );
    if (parseInt(immeubleCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Impossible de supprimer cette SCI : des immeubles y sont rattachés. Supprimez ou déliez les immeubles d\'abord.'
      });
    }

    const result = await pool.query(
      'DELETE FROM sci WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SCI not found' });
    }

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'delete', 'sci', id]
    );

    res.json({ message: 'SCI deleted successfully' });
  } catch (error) {
    console.error('Delete SCI error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
