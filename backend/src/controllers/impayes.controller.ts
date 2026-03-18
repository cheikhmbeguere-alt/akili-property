import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest, resolveRequestSciIds } from '../middleware/auth.middleware';

// ─── Rapport impayés ─────────────────────────────────────────────────────────
// Pour chaque bail actif :
//   solde = solde_reprise + SUM(quittances.total_ttc WHERE status = 'emis')
//   jours_retard = jours depuis la période de la quittance émise la plus ancienne
// Le solde_reprise permet de saisir un historique lors d'une reprise de portefeuille

export const getImpayesReport = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);
    if (sciIds !== null && sciIds.length === 0) {
      return res.json({ baux: [], kpis: { total_impayes: 0, nb_en_retard: 0, total_baux: 0 } });
    }

    const params: any[] = [];
    let sciFilter = '';
    if (sciIds !== null) {
      const ph = sciIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      sciFilter = `AND lo.immeuble_id IN (SELECT immeuble_id FROM sci_immeuble WHERE sci_id IN (${ph}))`;
      params.push(...sciIds);
    }

    const result = await pool.query(`
      WITH quittances_ouvertes AS (
        -- Quittances émises (non payées, non annulées) par bail
        SELECT bail_id,
          COALESCE(SUM(total_ttc), 0) AS total_emis,
          COUNT(*)                    AS nb_quittances,
          MIN(period_start)           AS plus_ancienne_periode
        FROM quittances
        WHERE status = 'emis'
        GROUP BY bail_id
      ),
      derniere_relance AS (
        SELECT DISTINCT ON (bail_id)
          bail_id, type, date_envoi
        FROM bail_relances
        ORDER BY bail_id, date_envoi DESC
      )
      SELECT
        b.id                                                     AS bail_id,
        b.code                                                   AS bail_code,
        b.start_date,
        b.loyer_ht,
        b.charges_ht,
        (b.loyer_ht + b.charges_ht)                              AS loyer_mensuel,
        b.solde_reprise,
        COALESCE(qo.total_emis, 0)                               AS total_quittances_ouvertes,
        COALESCE(qo.nb_quittances, 0)                            AS nb_quittances_ouvertes,
        b.solde_reprise + COALESCE(qo.total_emis, 0)             AS solde,
        CASE
          WHEN b.solde_reprise + COALESCE(qo.total_emis, 0) <= 0 THEN 0
          ELSE (CURRENT_DATE - COALESCE(qo.plus_ancienne_periode, CURRENT_DATE))::int
        END                                                      AS jours_retard,
        lo.code                       AS lot_code,
        lo.name                       AS lot_name,
        im.name                       AS immeuble_name,
        loc.code                      AS locataire_code,
        loc.type                      AS locataire_type,
        loc.first_name                AS locataire_first_name,
        loc.last_name                 AS locataire_last_name,
        loc.company_name              AS locataire_company,
        loc.email                     AS locataire_email,
        CASE
          WHEN loc.type = 'entreprise' THEN loc.company_name
          ELSE TRIM(COALESCE(loc.first_name, '') || ' ' || COALESCE(loc.last_name, ''))
        END                           AS locataire_nom,
        dr.type                       AS derniere_relance,
        dr.date_envoi                 AS derniere_relance_date
      FROM baux b
      JOIN lots lo         ON b.lot_id = lo.id
      JOIN immeubles im    ON lo.immeuble_id = im.id
      JOIN locataires loc  ON b.locataire_id = loc.id
      LEFT JOIN quittances_ouvertes qo ON qo.bail_id = b.id
      LEFT JOIN derniere_relance dr    ON dr.bail_id = b.id
      WHERE b.status = 'actif'
      ${sciFilter}
      ORDER BY solde DESC, b.start_date ASC
    `, params);

    const rows = result.rows.map(r => ({
      ...r,
      solde: parseFloat(r.solde),
      solde_reprise: parseFloat(r.solde_reprise || 0),
      total_quittances_ouvertes: parseFloat(r.total_quittances_ouvertes || 0),
      nb_quittances_ouvertes: parseInt(r.nb_quittances_ouvertes || 0),
      loyer_mensuel: parseFloat(r.loyer_mensuel),
    }));

    const total_impayes = rows.reduce((s, r) => s + Math.max(0, r.solde), 0);
    const nb_en_retard  = rows.filter(r => r.solde > 0).length;

    res.json({ baux: rows, kpis: { total_impayes, nb_en_retard, total_baux: rows.length } });
  } catch (error) {
    console.error('getImpayesReport error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Relances ─────────────────────────────────────────────────────────────────

export const createRelance = async (req: AuthRequest, res: Response) => {
  try {
    const { bail_id } = req.params;
    const { type, montant_du, notes } = req.body;

    if (!type) return res.status(400).json({ error: 'Le type de relance est requis' });

    const validTypes = ['relance1', 'relance2', 'mise_en_demeure'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Type invalide. Valeurs acceptées : ${validTypes.join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO bail_relances (bail_id, type, montant_du, notes, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [bail_id, type, montant_du || null, notes || null, req.user?.id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('createRelance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRelancesByBail = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT r.*,
         u.first_name AS created_by_name
       FROM bail_relances r
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.bail_id = $1
       ORDER BY r.date_envoi DESC`,
      [req.params.bail_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
