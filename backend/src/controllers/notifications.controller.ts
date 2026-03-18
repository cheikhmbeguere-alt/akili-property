import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  isMailConfigured,
  sendRelance,
  sendAlerteEcheance,
  sendResumeMensuel,
} from '../services/mail.service';

// ─── GET /api/notifications/config ────────────────────────────────────────────
export const getConfig = async (_req: AuthRequest, res: Response) => {
  res.json({ configured: isMailConfigured() });
};

// ─── POST /api/notifications/relance/:bail_id ─────────────────────────────────
export const envoyerRelance = async (req: AuthRequest, res: Response) => {
  if (!isMailConfigured()) {
    return res.status(503).json({
      error: 'Email non configuré. Ajoutez SMTP_HOST, SMTP_USER et SMTP_PASS dans le .env',
    });
  }

  const { bail_id } = req.params;
  const { type = 'premier_rappel' } = req.body;

  const validTypes = ['premier_rappel', 'deuxieme_rappel', 'mise_en_demeure'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Type invalide' });
  }

  try {
    // Récupérer les données du bail + impayés
    const bailResult = await pool.query(`
      SELECT
        b.id, b.code AS bail_code, b.lot_id,
        lot.code AS lot_code,
        im.name  AS immeuble_name,
        CASE WHEN loc.type = 'entreprise' THEN loc.company_name
             ELSE CONCAT(loc.first_name, ' ', loc.last_name) END AS locataire_nom,
        loc.email AS locataire_email,
        COALESCE(SUM(q.total_ttc) FILTER (WHERE q.status = 'emis'), 0) AS montant_impaye,
        COUNT(q.id) FILTER (WHERE q.status = 'emis') AS nb_quittances
      FROM baux b
      JOIN lots       lot ON lot.id  = b.lot_id
      JOIN immeubles  im  ON im.id   = lot.immeuble_id
      JOIN locataires loc ON loc.id  = b.locataire_id
      LEFT JOIN quittances q ON q.bail_id = b.id
      WHERE b.id = $1
      GROUP BY b.id, b.code, b.lot_id, lot.code, im.name, loc.type,
               loc.company_name, loc.first_name, loc.last_name, loc.email
    `, [bail_id]);

    if (!bailResult.rows.length) {
      return res.status(404).json({ error: 'Bail introuvable' });
    }
    const bail = bailResult.rows[0];

    if (!bail.locataire_email) {
      return res.status(400).json({ error: 'Le locataire n\'a pas d\'adresse email' });
    }
    if (parseFloat(bail.montant_impaye) <= 0) {
      return res.status(400).json({ error: 'Aucun impayé sur ce bail' });
    }

    await sendRelance({
      locataire_nom:   bail.locataire_nom,
      locataire_email: bail.locataire_email,
      bail_code:       bail.bail_code,
      lot_code:        bail.lot_code,
      immeuble_name:   bail.immeuble_name,
      montant_impaye:  parseFloat(bail.montant_impaye),
      nb_quittances:   parseInt(bail.nb_quittances),
      type: type as any,
    });

    // Log dans les relances
    await pool.query(
      `INSERT INTO relances_impayes (bail_id, type, montant_concerne, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [bail_id, type, bail.montant_impaye, req.user!.id]
    ).catch(() => {
      // La table relances_impayes peut ne pas exister — on ignore l'erreur
    });

    res.json({
      success: true,
      message: `Relance envoyée à ${bail.locataire_email}`,
      recipient: bail.locataire_email,
    });
  } catch (err: any) {
    console.error('envoyerRelance error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'envoi : ' + (err.message || 'erreur inconnue') });
  }
};

// ─── POST /api/notifications/alertes-echeance ─────────────────────────────────
// Envoie des alertes aux locataires dont le bail expire dans X jours
export const envoyerAlertesEcheance = async (req: AuthRequest, res: Response) => {
  if (!isMailConfigured()) {
    return res.status(503).json({
      error: 'Email non configuré',
    });
  }

  const { jours = 90 } = req.body;

  try {
    const result = await pool.query(`
      SELECT
        b.id, b.code AS bail_code, b.end_date,
        lot.code AS lot_code,
        im.name  AS immeuble_name,
        CASE WHEN loc.type = 'entreprise' THEN loc.company_name
             ELSE CONCAT(loc.first_name, ' ', loc.last_name) END AS locataire_nom,
        loc.email AS locataire_email,
        (b.end_date::date - CURRENT_DATE) AS jours_restants
      FROM baux b
      JOIN lots       lot ON lot.id  = b.lot_id
      JOIN immeubles  im  ON im.id   = lot.immeuble_id
      JOIN locataires loc ON loc.id  = b.locataire_id
      WHERE b.status = 'actif'
        AND b.end_date IS NOT NULL
        AND (b.end_date::date - CURRENT_DATE) BETWEEN 1 AND $1
        AND loc.email IS NOT NULL AND loc.email != ''
      ORDER BY b.end_date ASC
    `, [jours]);

    const baux = result.rows;
    if (!baux.length) {
      return res.json({ success: true, nb_envoyes: 0, message: 'Aucun bail à alerter' });
    }

    const resultats: { bail_code: string; email: string; ok: boolean; erreur?: string }[] = [];

    for (const bail of baux) {
      try {
        await sendAlerteEcheance({
          locataire_nom:   bail.locataire_nom,
          locataire_email: bail.locataire_email,
          bail_code:       bail.bail_code,
          lot_code:        bail.lot_code,
          immeuble_name:   bail.immeuble_name,
          end_date:        bail.end_date,
          jours_restants:  parseInt(bail.jours_restants),
        });
        resultats.push({ bail_code: bail.bail_code, email: bail.locataire_email, ok: true });
      } catch (err: any) {
        resultats.push({ bail_code: bail.bail_code, email: bail.locataire_email, ok: false, erreur: err.message });
      }
    }

    const nb_envoyes = resultats.filter(r => r.ok).length;
    const nb_erreurs = resultats.filter(r => !r.ok).length;

    res.json({
      success: true,
      nb_envoyes,
      nb_erreurs,
      resultats,
    });
  } catch (err: any) {
    console.error('envoyerAlertesEcheance error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─── POST /api/notifications/resume-mensuel ───────────────────────────────────
export const envoyerResumeMensuel = async (req: AuthRequest, res: Response) => {
  if (!isMailConfigured()) {
    return res.status(503).json({ error: 'Email non configuré' });
  }

  const { email, nom } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });

  try {
    const now   = new Date();
    const mois  = now.getMonth() + 1;
    const annee = now.getFullYear();
    const moisLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    // Encaissements du mois
    const encResult = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM encaissements
       WHERE EXTRACT(MONTH FROM payment_date) = $1 AND EXTRACT(YEAR FROM payment_date) = $2`,
      [mois, annee]
    );

    // Impayés
    const impResult = await pool.query(
      `SELECT COUNT(DISTINCT b.id) AS nb, COALESCE(SUM(q.total_ttc),0) AS montant
       FROM quittances q JOIN baux b ON b.id = q.bail_id
       WHERE q.status = 'emis'`
    );

    // Baux actifs
    const bauxResult = await pool.query(`SELECT COUNT(*) AS nb FROM baux WHERE status = 'actif'`);

    // Alertes échéance (90j)
    const alertResult = await pool.query(
      `SELECT COUNT(*) AS nb FROM baux
       WHERE status = 'actif' AND end_date IS NOT NULL
         AND (end_date::date - CURRENT_DATE) BETWEEN 1 AND 90`
    );

    await sendResumeMensuel({
      gestionnaire_email:  email,
      gestionnaire_nom:    nom || 'Gestionnaire',
      mois_label:          moisLabel,
      total_encaisse:      parseFloat(encResult.rows[0].total),
      nb_impayes:          parseInt(impResult.rows[0].nb),
      montant_impayes:     parseFloat(impResult.rows[0].montant),
      nb_baux_actifs:      parseInt(bauxResult.rows[0].nb),
      nb_alertes_echeance: parseInt(alertResult.rows[0].nb),
    });

    res.json({ success: true, message: `Résumé envoyé à ${email}` });
  } catch (err: any) {
    console.error('envoyerResumeMensuel error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'envoi : ' + err.message });
  }
};
