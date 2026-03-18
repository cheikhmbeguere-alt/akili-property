import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest, resolveRequestSciIds } from '../middleware/auth.middleware';

export const getAllImmeubles = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);
    if (sciIds !== null && sciIds.length === 0) return res.json([]);

    let whereClause = '';
    const params: any[] = [];
    if (sciIds !== null) {
      const ph = sciIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      whereClause = `WHERE i.id IN (SELECT immeuble_id FROM sci_immeuble WHERE sci_id IN (${ph}))`;
      params.push(...sciIds);
    }

    const result = await pool.query(
      `SELECT i.*,
              json_agg(
                json_build_object(
                  'sci_id', s.id,
                  'sci_code', s.code,
                  'sci_name', s.name,
                  'ownership_percentage', si.ownership_percentage,
                  'tantiemes', si.tantiemes
                )
              ) FILTER (WHERE s.id IS NOT NULL) as sci_links
       FROM immeubles i
       LEFT JOIN sci_immeuble si ON i.id = si.immeuble_id
       LEFT JOIN sci s ON si.sci_id = s.id
       ${whereClause}
       GROUP BY i.id
       ORDER BY i.code`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get all immeubles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getImmeubleById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT i.*, 
              json_agg(
                json_build_object(
                  'sci_id', s.id,
                  'sci_code', s.code,
                  'sci_name', s.name,
                  'ownership_percentage', si.ownership_percentage,
                  'tantiemes', si.tantiemes
                )
              ) FILTER (WHERE s.id IS NOT NULL) as sci_links
       FROM immeubles i
       LEFT JOIN sci_immeuble si ON i.id = si.immeuble_id
       LEFT JOIN sci s ON si.sci_id = s.id
       WHERE i.id = $1
       GROUP BY i.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Immeuble not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get immeuble by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createImmeuble = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { code, name, address, city, postal_code, total_surface, construction_year, sci_links } = req.body;

    if (!code || !name || !address) {
      return res.status(400).json({ error: 'Code, name and address are required' });
    }

    // Créer l'immeuble
    const immeubleResult = await client.query(
      `INSERT INTO immeubles (code, name, address, city, postal_code, total_surface, construction_year) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [code, name, address, city, postal_code, total_surface, construction_year]
    );

    const immeubleId = immeubleResult.rows[0].id;

    // Créer les liens avec les SCI
    if (sci_links && Array.isArray(sci_links) && sci_links.length > 0) {
      for (const link of sci_links) {
        await client.query(
          `INSERT INTO sci_immeuble (sci_id, immeuble_id, ownership_percentage, tantiemes)
           VALUES ($1, $2, $3, $4)`,
          [link.sci_id, immeubleId, link.ownership_percentage, link.tantiemes]
        );
      }
    }

    await client.query('COMMIT');

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create', 'immeuble', immeubleId, JSON.stringify(req.body)]
    );

    res.status(201).json(immeubleResult.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Create immeuble error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Immeuble code already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const updateImmeuble = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { code, name, address, city, postal_code, total_surface, construction_year, sci_links } = req.body;

    // Mettre à jour l'immeuble
    const immeubleResult = await client.query(
      `UPDATE immeubles 
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           address = COALESCE($3, address),
           city = COALESCE($4, city),
           postal_code = COALESCE($5, postal_code),
           total_surface = COALESCE($6, total_surface),
           construction_year = COALESCE($7, construction_year)
       WHERE id = $8
       RETURNING *`,
      [code, name, address, city, postal_code, total_surface, construction_year, id]
    );

    if (immeubleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Immeuble not found' });
    }

    // Mettre à jour les liens SCI si fournis
    if (sci_links !== undefined) {
      // Supprimer les anciens liens
      await client.query('DELETE FROM sci_immeuble WHERE immeuble_id = $1', [id]);

      // Créer les nouveaux liens
      if (Array.isArray(sci_links) && sci_links.length > 0) {
        for (const link of sci_links) {
          await client.query(
            `INSERT INTO sci_immeuble (sci_id, immeuble_id, ownership_percentage, tantiemes)
             VALUES ($1, $2, $3, $4)`,
            [link.sci_id, id, link.ownership_percentage, link.tantiemes]
          );
        }
      }
    }

    await client.query('COMMIT');

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'update', 'immeuble', id, JSON.stringify(req.body)]
    );

    res.json(immeubleResult.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Update immeuble error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Immeuble code already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const deleteImmeuble = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM immeubles WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Immeuble not found' });
    }

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'delete', 'immeuble', id]
    );

    res.json({ message: 'Immeuble deleted successfully' });
  } catch (error) {
    console.error('Delete immeuble error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
