import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest, resolveRequestSciIds } from '../middleware/auth.middleware';

export const getAllBaux = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);
    if (sciIds !== null && sciIds.length === 0) return res.json([]);

    const { status } = req.query;
    const params: any[] = [];
    const conditions: string[] = [];

    if (sciIds !== null) {
      const ph = sciIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      conditions.push(`lot.immeuble_id IN (SELECT immeuble_id FROM sci_immeuble WHERE sci_id IN (${ph}))`);
      params.push(...sciIds);
    }
    if (status) {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ` + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT b.*,
             lot.code as lot_code,
             lot.name as lot_name,
             lot.surface as lot_surface,
             i.code as immeuble_code,
             i.name as immeuble_name,
             loc.code as locataire_code,
             loc.type as locataire_type,
             loc.company_name as locataire_company_name,
             loc.first_name as locataire_first_name,
             loc.last_name as locataire_last_name,
             ind.code as indice_code,
             ind.name as indice_name
      FROM baux b
      JOIN lots lot ON b.lot_id = lot.id
      JOIN immeubles i ON lot.immeuble_id = i.id
      JOIN locataires loc ON b.locataire_id = loc.id
      LEFT JOIN indices ind ON b.indice_id = ind.id
      ${where}
      ORDER BY b.start_date DESC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get all baux error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBailById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT b.*,
              lot.code as lot_code,
              lot.name as lot_name,
              lot.surface as lot_surface,
              i.code as immeuble_code,
              i.name as immeuble_name,
              loc.code as locataire_code,
              loc.type as locataire_type,
              loc.company_name as locataire_company_name,
              loc.first_name as locataire_first_name,
              loc.last_name as locataire_last_name,
              ind.code as indice_code,
              ind.name as indice_name
       FROM baux b
       JOIN lots lot ON b.lot_id = lot.id
       JOIN immeubles i ON lot.immeuble_id = i.id
       JOIN locataires loc ON b.locataire_id = loc.id
       LEFT JOIN indices ind ON b.indice_id = ind.id
       WHERE b.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bail not found' });
    }

    // Récupérer l'historique des indexations
    const indexations = await pool.query(
      `SELECT * FROM indexations WHERE bail_id = $1 ORDER BY indexation_date DESC`,
      [id]
    );

    res.json({
      ...result.rows[0],
      indexations: indexations.rows
    });
  } catch (error) {
    console.error('Get bail by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createBail = async (req: AuthRequest, res: Response) => {
  try {
    const {
      code,
      lot_id,
      locataire_id,
      start_date,
      end_date,
      notice_period_months,
      loyer_ht,
      charges_ht,
      tva_applicable,
      tva_rate,
      tva_on_charges,
      depot_garantie,
      depot_garantie_received_date,
      indexation_applicable,
      indice_id,
      indice_base_value,
      indice_base_year,
      indice_base_quarter,
      indexation_date_month,
      indexation_date_day,
      indexation_frequency,
      franchise_start_date,
      franchise_end_date,
      quittancement_frequency,
      type_bail,
      notes,
      solde_reprise,
      solde_reprise_date,
      loyer_reprise
    } = req.body;

    // Validations
    if (!code || !lot_id || !locataire_id || !start_date || !loyer_ht) {
      return res.status(400).json({ 
        error: 'Code, lot, locataire, start date and loyer are required' 
      });
    }

    // Vérifier que le lot n'est pas déjà loué
    const existingBail = await pool.query(
      `SELECT id FROM baux 
       WHERE lot_id = $1 
       AND status = 'actif' 
       AND (
         (start_date <= $2 AND (end_date IS NULL OR end_date >= $2))
         OR (start_date <= $3 AND (end_date IS NULL OR end_date >= $3))
         OR (start_date >= $2 AND start_date <= $3)
       )`,
      [lot_id, start_date, end_date || '9999-12-31']
    );

    if (existingBail.rows.length > 0) {
      return res.status(409).json({ 
        error: 'This lot already has an active lease for this period' 
      });
    }

    // Vérifier que l'indice existe si indexation activée
    if (indexation_applicable && indice_id) {
      const indiceCheck = await pool.query(
        'SELECT id FROM indices WHERE id = $1',
        [indice_id]
      );
      if (indiceCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Indice not found' });
      }
    }

    const result = await pool.query(
      `INSERT INTO baux (
        code, lot_id, locataire_id, start_date, end_date, notice_period_months,
        loyer_ht, charges_ht, tva_applicable, tva_rate, tva_on_charges,
        depot_garantie, depot_garantie_received_date,
        indexation_applicable, indice_id, indice_base_value, indice_base_year, indice_base_quarter,
        indexation_date_month, indexation_date_day, indexation_frequency,
        franchise_start_date, franchise_end_date, quittancement_frequency,
        type_bail, status, notes, solde_reprise, solde_reprise_date, loyer_reprise
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
       RETURNING *`,
      [
        code, lot_id, locataire_id, start_date, end_date, notice_period_months,
        loyer_ht, charges_ht || 0, tva_applicable !== false, tva_rate || 20.00, tva_on_charges || false,
        depot_garantie, depot_garantie_received_date,
        indexation_applicable !== false, indice_id, indice_base_value, indice_base_year, indice_base_quarter,
        indexation_date_month, indexation_date_day, indexation_frequency || 'annuelle',
        franchise_start_date, franchise_end_date, quittancement_frequency || 'mensuel',
        type_bail || 'commercial', 'actif', notes, solde_reprise || 0,
        solde_reprise_date || null, loyer_reprise || null
      ]
    );

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create', 'bail', result.rows[0].id, JSON.stringify(req.body)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Create bail error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Bail code already exists' });
    }
    if (error.code === '23503') {
      return res.status(404).json({ error: 'Lot or locataire not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateBail = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      start_date,
      loyer_ht,
      charges_ht,
      tva_applicable,
      tva_rate,
      tva_on_charges,
      end_date,
      notice_period_months,
      depot_garantie,
      depot_garantie_received_date,
      indexation_applicable,
      indice_id,
      indice_base_value,
      indice_base_year,
      indice_base_quarter,
      indexation_date_month,
      indexation_date_day,
      indexation_frequency,
      franchise_start_date,
      franchise_end_date,
      quittancement_frequency,
      type_bail,
      status,
      notes,
      solde_reprise,
      solde_reprise_date,
      loyer_reprise
    } = req.body;

    const result = await pool.query(
      `UPDATE baux
       SET start_date = COALESCE($1, start_date),
           loyer_ht = COALESCE($2, loyer_ht),
           charges_ht = COALESCE($3, charges_ht),
           tva_applicable = COALESCE($4, tva_applicable),
           tva_rate = COALESCE($5, tva_rate),
           tva_on_charges = COALESCE($6, tva_on_charges),
           end_date = COALESCE($7, end_date),
           notice_period_months = COALESCE($8, notice_period_months),
           depot_garantie = COALESCE($9, depot_garantie),
           depot_garantie_received_date = COALESCE($10, depot_garantie_received_date),
           indexation_applicable = COALESCE($11, indexation_applicable),
           indice_id = COALESCE($12, indice_id),
           indice_base_value = COALESCE($13, indice_base_value),
           indice_base_year = COALESCE($14, indice_base_year),
           indice_base_quarter = COALESCE($15, indice_base_quarter),
           indexation_date_month = COALESCE($16, indexation_date_month),
           indexation_date_day = COALESCE($17, indexation_date_day),
           indexation_frequency = COALESCE($18, indexation_frequency),
           franchise_start_date = COALESCE($19, franchise_start_date),
           franchise_end_date = COALESCE($20, franchise_end_date),
           quittancement_frequency = COALESCE($21, quittancement_frequency),
           type_bail = COALESCE($22::type_bail_enum, type_bail),
           status = COALESCE($23, status),
           notes = COALESCE($24, notes),
           solde_reprise = COALESCE($25, solde_reprise),
           solde_reprise_date = $26,
           loyer_reprise = $27
       WHERE id = $28
       RETURNING *`,
      [
        start_date || null, loyer_ht, charges_ht, tva_applicable, tva_rate, tva_on_charges,
        end_date, notice_period_months, depot_garantie, depot_garantie_received_date,
        indexation_applicable, indice_id,
        indice_base_value, indice_base_year, indice_base_quarter,
        indexation_date_month, indexation_date_day, indexation_frequency || null,
        franchise_start_date, franchise_end_date, quittancement_frequency,
        type_bail, status, notes, solde_reprise,
        solde_reprise_date || null, loyer_reprise || null, id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bail not found' });
    }

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'update', 'bail', id, JSON.stringify(req.body)]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update bail error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteBail = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Vérifier s'il y a des quittances
    const quittanceCheck = await pool.query(
      'SELECT COUNT(*) as count FROM quittances WHERE bail_id = $1',
      [id]
    );

    if (parseInt(quittanceCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete bail with existing quittances. Please delete quittances first or terminate the lease.' 
      });
    }

    const result = await pool.query(
      'DELETE FROM baux WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bail not found' });
    }

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'delete', 'bail', id]
    );

    res.json({ message: 'Bail deleted successfully' });
  } catch (error) {
    console.error('Delete bail error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const terminateBail = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { end_date } = req.body;

    if (!end_date) {
      return res.status(400).json({ error: 'End date is required' });
    }

    const result = await pool.query(
      `UPDATE baux 
       SET end_date = $1, status = 'terminé'
       WHERE id = $2
       RETURNING *`,
      [end_date, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bail not found' });
    }

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'terminate', 'bail', id, JSON.stringify({ end_date })]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Terminate bail error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
