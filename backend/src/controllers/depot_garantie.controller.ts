import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// ─── GET /api/depot-garantie ───────────────────────────────────────────────────
// Vue d'ensemble : tous les baux (actifs + terminés avec sortie < 6 mois)
export const getDepotGarantie = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        b.id                          AS bail_id,
        b.code                        AS bail_code,
        b.status                      AS bail_status,
        b.start_date,
        b.end_date,
        b.depot_garantie,
        b.depot_garantie_received_date,
        CASE
          WHEN loc.type = 'entreprise' THEN loc.company_name
          ELSE CONCAT(loc.first_name, ' ', loc.last_name)
        END                           AS locataire_nom,
        loc.email                     AS locataire_email,
        lot.code                      AS lot_code,
        lot.name                      AS lot_name,
        i.name                        AS immeuble_name,
        s.name                        AS sci_name,
        -- Statut du dépôt de garantie
        CASE
          WHEN b.depot_garantie IS NULL OR b.depot_garantie = 0 THEN 'non_applicable'
          WHEN EXISTS (
            SELECT 1 FROM depot_garantie_mouvements dgm
            WHERE dgm.bail_id = b.id AND dgm.type IN ('restitution','retenue_totale')
          ) THEN 'restitue_ou_retenu'
          WHEN b.depot_garantie_received_date IS NOT NULL THEN 'recu'
          ELSE 'en_attente'
        END                           AS dg_statut,
        -- Mouvement de restitution si existe
        (SELECT dgm.type FROM depot_garantie_mouvements dgm
         WHERE dgm.bail_id = b.id AND dgm.type IN ('restitution','retenue_partielle','retenue_totale')
         ORDER BY dgm.created_at DESC LIMIT 1) AS derniere_action_dg,
        (SELECT dgm.montant FROM depot_garantie_mouvements dgm
         WHERE dgm.bail_id = b.id AND dgm.type IN ('restitution','retenue_partielle','retenue_totale')
         ORDER BY dgm.created_at DESC LIMIT 1) AS montant_derniere_action,
        -- Sortie enregistrée ?
        sl.id                         AS sortie_id,
        sl.date_sortie,
        sl.montant_restitue,
        sl.retenues                   AS retenues_sortie,
        sl.solde_quittances
      FROM baux b
      JOIN locataires loc ON b.locataire_id = loc.id
      JOIN lots lot       ON b.lot_id = lot.id
      JOIN immeubles i    ON lot.immeuble_id = i.id
      LEFT JOIN sci_immeuble si ON si.immeuble_id = i.id
      LEFT JOIN sci s     ON s.id = si.sci_id
      LEFT JOIN sorties_locataires sl ON sl.bail_id = b.id
      WHERE b.status IN ('actif', 'terminé')
        AND (b.depot_garantie > 0 OR b.status = 'actif')
      ORDER BY b.status ASC, i.name ASC, lot.code ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('getDepotGarantie error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── GET /api/depot-garantie/baux/:id/calcul-sortie ───────────────────────────
// Pré-calcul pour le modal de sortie
export const getCalculSortie = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Infos du bail
    const bailResult = await pool.query(`
      SELECT
        b.*,
        CASE
          WHEN loc.type = 'entreprise' THEN loc.company_name
          ELSE CONCAT(loc.first_name, ' ', loc.last_name)
        END AS locataire_nom,
        lot.code AS lot_code, lot.name AS lot_name,
        i.name AS immeuble_name
      FROM baux b
      JOIN locataires loc ON b.locataire_id = loc.id
      JOIN lots lot ON b.lot_id = lot.id
      JOIN immeubles i ON lot.immeuble_id = i.id
      WHERE b.id = $1
    `, [id]);

    if (bailResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bail introuvable' });
    }
    const bail = bailResult.rows[0];

    // Détail quittances par statut
    const quittancesResult = await pool.query(`
      SELECT
        COALESCE(SUM(total_ttc) FILTER (WHERE status != 'annule'), 0) AS total_emis_et_paye,
        COALESCE(SUM(total_ttc) FILTER (WHERE status = 'emis'),    0) AS total_emis,
        COALESCE(SUM(total_ttc) FILTER (WHERE status = 'paye'),    0) AS total_paye_quitt,
        COALESCE(SUM(total_ttc) FILTER (WHERE status = 'annule'),  0) AS total_annule,
        COUNT(*) FILTER (WHERE status = 'emis')    AS nb_emis,
        COUNT(*) FILTER (WHERE status != 'annule') AS nb_total
      FROM quittances
      WHERE bail_id = $1
    `, [id]);
    const q = quittancesResult.rows[0];
    const total_emis      = parseFloat(q.total_emis);       // quittances émises non payées
    const total_paye_quitt = parseFloat(q.total_paye_quitt); // quittances marquées payées

    // Encaissements enregistrés
    const encaissResult = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total_encaisse
      FROM encaissements
      WHERE bail_id = $1
    `, [id]);
    const total_encaisse = parseFloat(encaissResult.rows[0].total_encaisse);

    // Solde impayé = quittances 'emis' (non encore réglées)
    // Les quittances 'paye' sont déjà réglées (avec ou sans encaissement enregistré)
    const solde_impaye = total_emis;

    const depot_recu = bail.depot_garantie_received_date
      ? parseFloat(bail.depot_garantie || 0)
      : 0;

    res.json({
      bail_id: bail.id,
      bail_code: bail.code,
      locataire_nom: bail.locataire_nom,
      lot_code: bail.lot_code,
      lot_name: bail.lot_name,
      immeuble_name: bail.immeuble_name,
      start_date: bail.start_date,
      loyer_ht: bail.loyer_ht,
      // Détail quittances
      total_quittances: parseFloat(q.total_emis_et_paye),
      total_paye_quitt,
      total_emis,
      total_encaisse,
      nb_emis:  parseInt(q.nb_emis),
      nb_total: parseInt(q.nb_total),
      // Solde
      solde_impaye,
      depot_garantie: parseFloat(bail.depot_garantie || 0),
      depot_garantie_recu: depot_recu,
      depot_garantie_received_date: bail.depot_garantie_received_date,
      // Suggestion
      montant_restitue_suggere: Math.max(0, depot_recu - solde_impaye),
    });
  } catch (error) {
    console.error('getCalculSortie error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /api/depot-garantie/baux/:id/sortie ─────────────────────────────────
// Enregistre la sortie complète et termine le bail
export const enregistrerSortie = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      date_sortie,
      etat_des_lieux = 'bon_etat',
      retenues = 0,
      notes,
    } = req.body;

    if (!date_sortie) {
      return res.status(400).json({ error: 'La date de sortie est obligatoire' });
    }

    await client.query('BEGIN');

    // Vérifier que le bail existe et est actif
    const bailResult = await client.query(
      `SELECT b.*, b.depot_garantie_received_date
       FROM baux b WHERE b.id = $1 AND b.status = 'actif'`,
      [id]
    );
    if (bailResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bail introuvable ou déjà terminé' });
    }
    const bail = bailResult.rows[0];

    // Calcul solde quittances — uniquement les quittances 'emis' (non encore réglées)
    // Les quittances 'paye' sont considérées comme réglées (avec ou sans encaissement)
    const qdResult = await client.query(
      `SELECT COALESCE(SUM(total_ttc),0) AS total_emis FROM quittances
       WHERE bail_id = $1 AND status = 'emis'`, [id]
    );
    const solde_quittances = parseFloat(qdResult.rows[0].total_emis);
    const depot_recu = bail.depot_garantie_received_date
      ? parseFloat(bail.depot_garantie || 0)
      : 0;
    const retenues_num = parseFloat(retenues);
    const montant_restitue = Math.max(0, depot_recu - retenues_num - solde_quittances);

    // Insérer la sortie
    const sortieResult = await client.query(`
      INSERT INTO sorties_locataires
        (bail_id, date_sortie, etat_des_lieux, solde_quittances, depot_garantie_recu, retenues, montant_restitue, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [id, date_sortie, etat_des_lieux, solde_quittances, depot_recu, retenues_num, montant_restitue, notes || null, req.user!.id]);

    // Insérer le mouvement DG
    if (depot_recu > 0) {
      const typeMouvement = montant_restitue === 0
        ? 'retenue_totale'
        : retenues_num > 0 || solde_quittances > 0
        ? 'restitution'  // partielle
        : 'restitution';
      await client.query(`
        INSERT INTO depot_garantie_mouvements
          (bail_id, type, montant, date_mouvement, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [id, typeMouvement, montant_restitue, date_sortie,
          `Sortie du ${date_sortie}${notes ? ' — ' + notes : ''}`, req.user!.id]);
    }

    // Terminer le bail
    await client.query(
      `UPDATE baux SET status = 'terminé', end_date = $1 WHERE id = $2`,
      [date_sortie, id]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1,'sortie','bail',$2,$3)`,
      [req.user!.id, id, JSON.stringify({ date_sortie, montant_restitue, retenues: retenues_num })]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Sortie enregistrée avec succès',
      sortie: sortieResult.rows[0],
      montant_restitue,
      solde_quittances,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('enregistrerSortie error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// ─── GET /api/depot-garantie/mouvements/:bailId ───────────────────────────────
export const getMouvements = async (req: AuthRequest, res: Response) => {
  try {
    const { bailId } = req.params;
    const result = await pool.query(`
      SELECT dgm.*, u.first_name || ' ' || u.last_name AS created_by_name
      FROM depot_garantie_mouvements dgm
      LEFT JOIN users u ON u.id = dgm.created_by
      WHERE dgm.bail_id = $1
      ORDER BY dgm.date_mouvement DESC
    `, [bailId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
