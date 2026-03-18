import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest, resolveRequestSciIds } from '../middleware/auth.middleware';

// ─── Alertes & Échéances ──────────────────────────────────────────────────────

export const getAlertes = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);

    // Non-admin sans aucune SCI autorisée → réponse vide
    if (sciIds !== null && sciIds.length === 0) {
      return res.json({
        stats: { bauxExpirant: 0, depotsMissing: 0, quittancesRetard: 0, bauxSansQuittance: 0 },
        bauxExpirant: [], depotsMissing: [], quittancesRetard: [], bauxSansQuittance: [],
      });
    }

    // Clause SCI — sciIds commencent à $1 dans chaque requête
    const base = sciIds ?? [];
    const sciClause = base.length > 0
      ? `AND si.sci_id IN (${base.map((_, i) => `$${i + 1}`).join(',')})`
      : '';

    // ── 1. Baux expirant dans les 90 jours ──────────────────────────────────
    const bauxExpirant = await pool.query(`
      SELECT
        b.id, b.code, b.end_date,
        b.loyer_ht, b.status,
        CASE WHEN loc.type = 'entreprise' THEN loc.company_name
             ELSE CONCAT(loc.first_name, ' ', loc.last_name)
        END AS locataire_nom,
        loc.email AS locataire_email,
        lot.code AS lot_code, lot.name AS lot_name,
        i.code AS immeuble_code, i.name AS immeuble_name,
        s.name AS sci_name,
        (b.end_date::date - CURRENT_DATE) AS jours_restants
      FROM baux b
      JOIN locataires loc ON b.locataire_id = loc.id
      JOIN lots lot ON b.lot_id = lot.id
      JOIN immeubles i ON lot.immeuble_id = i.id
      JOIN sci_immeuble si ON si.immeuble_id = i.id
      JOIN sci s ON s.id = si.sci_id
      WHERE b.status = 'actif'
        AND b.end_date IS NOT NULL
        AND b.end_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
        ${sciClause}
      ORDER BY b.end_date ASC
    `, base);

    // ── 2. Dépôts de garantie manquants ─────────────────────────────────────
    const depotsMissing = await pool.query(`
      SELECT
        b.id, b.code, b.start_date, b.depot_garantie, b.depot_garantie_received_date,
        CASE WHEN loc.type = 'entreprise' THEN loc.company_name
             ELSE CONCAT(loc.first_name, ' ', loc.last_name)
        END AS locataire_nom,
        lot.code AS lot_code, i.name AS immeuble_name, s.name AS sci_name
      FROM baux b
      JOIN locataires loc ON b.locataire_id = loc.id
      JOIN lots lot ON b.lot_id = lot.id
      JOIN immeubles i ON lot.immeuble_id = i.id
      JOIN sci_immeuble si ON si.immeuble_id = i.id
      JOIN sci s ON s.id = si.sci_id
      WHERE b.status = 'actif'
        AND b.depot_garantie > 0
        AND b.depot_garantie_received_date IS NULL
        ${sciClause}
      ORDER BY b.start_date ASC
    `, base);

    // ── 3. Quittances impayées (émises > 30 jours) ───────────────────────────
    const quittancesRetard = await pool.query(`
      SELECT
        q.id, q.code, q.due_date, q.total_ttc, q.emission_date,
        q.period_start, q.period_end,
        b.code AS bail_code,
        CASE WHEN loc.type = 'entreprise' THEN loc.company_name
             ELSE CONCAT(loc.first_name, ' ', loc.last_name)
        END AS locataire_nom,
        loc.email AS locataire_email,
        lot.code AS lot_code, i.name AS immeuble_name, s.name AS sci_name,
        (CURRENT_DATE - q.due_date::date) AS jours_retard
      FROM quittances q
      JOIN baux b ON q.bail_id = b.id
      JOIN locataires loc ON b.locataire_id = loc.id
      JOIN lots lot ON b.lot_id = lot.id
      JOIN immeubles i ON lot.immeuble_id = i.id
      JOIN sci_immeuble si ON si.immeuble_id = i.id
      JOIN sci s ON s.id = si.sci_id
      WHERE q.status = 'emis'
        AND q.due_date::date < CURRENT_DATE - INTERVAL '30 days'
        ${sciClause}
      ORDER BY q.due_date ASC
    `, base);

    // ── 4. Baux sans quittance ce mois-ci ────────────────────────────────────
    const nowY = new Date().getFullYear();
    const nowM = new Date().getMonth() + 1;
    const periodStart = `${nowY}-${String(nowM).padStart(2, '0')}-01`;

    // periodStart = $${base.length + 1}
    const pIdx = base.length + 1;
    const bauxSansQuittance = await pool.query(`
      SELECT
        b.id, b.code, b.loyer_ht, b.quittancement_frequency,
        CASE WHEN loc.type = 'entreprise' THEN loc.company_name
             ELSE CONCAT(loc.first_name, ' ', loc.last_name)
        END AS locataire_nom,
        lot.code AS lot_code, i.name AS immeuble_name, s.name AS sci_name
      FROM baux b
      JOIN locataires loc ON b.locataire_id = loc.id
      JOIN lots lot ON b.lot_id = lot.id
      JOIN immeubles i ON lot.immeuble_id = i.id
      JOIN sci_immeuble si ON si.immeuble_id = i.id
      JOIN sci s ON s.id = si.sci_id
      WHERE b.status = 'actif'
        AND b.quittancement_frequency = 'mensuel'
        AND NOT EXISTS (
          SELECT 1 FROM quittances q
          WHERE q.bail_id = b.id
            AND q.period_start = $${pIdx}
            AND q.status != 'annule'
        )
        ${sciClause}
      ORDER BY b.code ASC
    `, [...base, periodStart]);

    const stats = {
      bauxExpirant:      bauxExpirant.rows.length,
      depotsMissing:     depotsMissing.rows.length,
      quittancesRetard:  quittancesRetard.rows.length,
      bauxSansQuittance: bauxSansQuittance.rows.length,
    };

    res.json({
      stats,
      bauxExpirant:      bauxExpirant.rows,
      depotsMissing:     depotsMissing.rows,
      quittancesRetard:  quittancesRetard.rows,
      bauxSansQuittance: bauxSansQuittance.rows,
    });
  } catch (error) {
    console.error('getAlertes error:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
