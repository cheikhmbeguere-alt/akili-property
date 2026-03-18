import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest, resolveRequestSciIds } from '../middleware/auth.middleware';

export const getAllLocataires = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);
    if (sciIds !== null && sciIds.length === 0) return res.json([]);

    const { search } = req.query;
    const params: any[] = [];
    const conditions: string[] = [];

    if (sciIds !== null) {
      const ph = sciIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      conditions.push(`l.id IN (
        SELECT DISTINCT b2.locataire_id FROM baux b2
        JOIN lots lot2 ON b2.lot_id = lot2.id
        WHERE lot2.immeuble_id IN (SELECT immeuble_id FROM sci_immeuble WHERE sci_id IN (${ph}))
      )`);
      params.push(...sciIds);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(
        l.code ILIKE $${params.length} OR
        l.company_name ILIKE $${params.length} OR
        l.first_name ILIKE $${params.length} OR
        l.last_name ILIKE $${params.length} OR
        l.email ILIKE $${params.length}
      )`);
    }

    const where = conditions.length > 0 ? `WHERE ` + conditions.join(' AND ') : '';
    const result = await pool.query(
      `SELECT l.*,
             COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'actif') as active_baux_count
      FROM locataires l
      LEFT JOIN baux b ON l.id = b.locataire_id
      ${where}
      GROUP BY l.id ORDER BY l.code`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get all locataires error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getLocataireById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT l.*,
              json_agg(
                json_build_object(
                  'bail_id', b.id,
                  'bail_code', b.code,
                  'lot_code', lot.code,
                  'immeuble_name', i.name,
                  'loyer_ht', b.loyer_ht,
                  'status', b.status,
                  'start_date', b.start_date,
                  'end_date', b.end_date
                )
              ) FILTER (WHERE b.id IS NOT NULL) as baux
       FROM locataires l
       LEFT JOIN baux b ON l.id = b.locataire_id
       LEFT JOIN lots lot ON b.lot_id = lot.id
       LEFT JOIN immeubles i ON lot.immeuble_id = i.id
       WHERE l.id = $1
       GROUP BY l.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Locataire not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get locataire by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createLocataire = async (req: AuthRequest, res: Response) => {
  try {
    const {
      code,
      type,
      company_name,
      siret,
      first_name,
      last_name,
      email,
      phone,
      address,
      city,
      postal_code,
      tva_number,
      notes
    } = req.body;

    if (!code || !type) {
      return res.status(400).json({ error: 'Code and type are required' });
    }

    if (type === 'entreprise' && !company_name) {
      return res.status(400).json({ error: 'Company name is required for entreprise type' });
    }

    if (type === 'particulier' && (!first_name || !last_name)) {
      return res.status(400).json({ error: 'First name and last name are required for particulier type' });
    }

    const result = await pool.query(
      `INSERT INTO locataires (
        code, type, company_name, siret, first_name, last_name,
        email, phone, address, city, postal_code, tva_number, notes
      ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`,
      [
        code, type, company_name, siret, first_name, last_name,
        email, phone, address, city, postal_code, tva_number, notes
      ]
    );

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create', 'locataire', result.rows[0].id, JSON.stringify(req.body)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Create locataire error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Locataire code already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateLocataire = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      code,
      type,
      company_name,
      siret,
      first_name,
      last_name,
      email,
      phone,
      address,
      city,
      postal_code,
      tva_number,
      notes,
      is_active
    } = req.body;

    const result = await pool.query(
      `UPDATE locataires 
       SET code = COALESCE($1, code),
           type = COALESCE($2, type),
           company_name = COALESCE($3, company_name),
           siret = COALESCE($4, siret),
           first_name = COALESCE($5, first_name),
           last_name = COALESCE($6, last_name),
           email = COALESCE($7, email),
           phone = COALESCE($8, phone),
           address = COALESCE($9, address),
           city = COALESCE($10, city),
           postal_code = COALESCE($11, postal_code),
           tva_number = COALESCE($12, tva_number),
           notes = COALESCE($13, notes),
           is_active = COALESCE($14, is_active)
       WHERE id = $15
       RETURNING *`,
      [
        code, type, company_name, siret, first_name, last_name,
        email, phone, address, city, postal_code, tva_number, notes,
        is_active, id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Locataire not found' });
    }

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'update', 'locataire', id, JSON.stringify(req.body)]
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Update locataire error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Locataire code already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteLocataire = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Vérifier si le locataire a des baux actifs
    const bailCheck = await pool.query(
      'SELECT COUNT(*) as count FROM baux WHERE locataire_id = $1 AND status = $2',
      [id, 'actif']
    );

    if (parseInt(bailCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete locataire with active leases. Please terminate the leases first.' 
      });
    }

    const result = await pool.query(
      'DELETE FROM locataires WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Locataire not found' });
    }

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'delete', 'locataire', id]
    );

    res.json({ message: 'Locataire deleted successfully' });
  } catch (error) {
    console.error('Delete locataire error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
