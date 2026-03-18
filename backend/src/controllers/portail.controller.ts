import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';

// ─── Interface requête portail locataire ─────────────────────────────────────
export interface PortailRequest extends Request {
  locataire?: { id: number; email: string; role: 'locataire' }
}

// ─── Middleware auth portail ──────────────────────────────────────────────────
export const portailAuthMiddleware = (req: PortailRequest, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requis' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    if (decoded.role !== 'locataire') {
      return res.status(403).json({ error: 'Accès réservé aux locataires' });
    }
    req.locataire = { id: decoded.locataireId, email: decoded.email, role: 'locataire' };
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

// ─── POST /api/portail/login ──────────────────────────────────────────────────
// Connexion par email uniquement (prototype — pas de mot de passe)
export const loginPortail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });

    // Chercher le locataire par email
    const locResult = await pool.query(
      `SELECT l.id, l.email, l.type, l.first_name, l.last_name, l.company_name
       FROM locataires l
       WHERE LOWER(l.email) = LOWER($1) AND l.is_active = true`,
      [email]
    );

    if (locResult.rows.length === 0) {
      return res.status(404).json({ error: 'Aucun locataire trouvé pour cet email' });
    }

    const locataire = locResult.rows[0];

    // Vérifier qu'il a un bail actif
    const bailResult = await pool.query(
      `SELECT b.id, b.code, b.loyer_ht, b.charges_ht, b.quittancement_frequency,
              b.start_date, b.end_date, b.tva_applicable, b.tva_rate,
              lo.code AS lot_code, lo.name AS lot_name,
              im.name AS immeuble_name, im.address AS immeuble_address,
              im.city AS immeuble_city
       FROM baux b
       JOIN lots lo ON lo.id = b.lot_id
       JOIN immeubles im ON im.id = lo.immeuble_id
       WHERE b.locataire_id = $1 AND b.status = 'actif'
       LIMIT 1`,
      [locataire.id]
    );

    if (bailResult.rows.length === 0) {
      return res.status(404).json({ error: 'Aucun bail actif trouvé pour cet email' });
    }

    const token = jwt.sign(
      { locataireId: locataire.id, email: locataire.email, role: 'locataire' },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    const nom = locataire.type === 'entreprise'
      ? locataire.company_name
      : `${locataire.first_name} ${locataire.last_name}`;

    res.json({ token, locataire: { id: locataire.id, email: locataire.email, nom } });
  } catch (err) {
    console.error('loginPortail error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─── GET /api/portail/me ──────────────────────────────────────────────────────
export const getMe = async (req: PortailRequest, res: Response) => {
  try {
    const locataireId = req.locataire!.id;

    // Profil locataire + bail actif
    const result = await pool.query(
      `SELECT
         l.id, l.email, l.type, l.first_name, l.last_name, l.company_name,
         l.phone,
         b.id AS bail_id, b.code AS bail_code,
         b.loyer_ht, b.charges_ht, b.tva_applicable, b.tva_rate,
         b.quittancement_frequency, b.start_date, b.end_date,
         b.indexation_date_month, b.indexation_date_day,
         lo.code AS lot_code, lo.name AS lot_name, lo.floor AS lot_floor,
         im.name AS immeuble_name, im.address AS immeuble_address,
         im.city AS immeuble_city, im.postal_code AS immeuble_postal_code
       FROM locataires l
       JOIN baux b ON b.locataire_id = l.id AND b.status = 'actif'
       JOIN lots lo ON lo.id = b.lot_id
       JOIN immeubles im ON im.id = lo.immeuble_id
       WHERE l.id = $1
       LIMIT 1`,
      [locataireId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bail actif introuvable' });
    }

    const row = result.rows[0];

    // Solde impayé (quittances emis)
    const soldeResult = await pool.query(
      `SELECT COALESCE(SUM(total_ttc), 0) AS solde_impaye,
              COUNT(*) AS nb_impayees
       FROM quittances
       WHERE bail_id = $1 AND status = 'emis'`,
      [row.bail_id]
    );

    // Prochaine quittance attendue
    const prochainResult = await pool.query(
      `SELECT period_start, period_end, total_ttc, due_date
       FROM quittances
       WHERE bail_id = $1 AND status = 'emis'
       ORDER BY period_start ASC LIMIT 1`,
      [row.bail_id]
    );

    const nom = row.type === 'entreprise'
      ? row.company_name
      : `${row.first_name} ${row.last_name}`;

    res.json({
      locataire: { id: row.id, nom, email: row.email, phone: row.phone, type: row.type },
      bail: {
        id: row.bail_id, code: row.bail_code,
        loyer_ht: parseFloat(row.loyer_ht),
        charges_ht: parseFloat(row.charges_ht),
        tva_applicable: row.tva_applicable,
        tva_rate: row.tva_rate ? parseFloat(row.tva_rate) : null,
        quittancement_frequency: row.quittancement_frequency,
        start_date: row.start_date,
        end_date: row.end_date,
      },
      logement: {
        lot_code: row.lot_code, lot_name: row.lot_name, lot_floor: row.lot_floor,
        immeuble_name: row.immeuble_name,
        adresse: `${row.immeuble_address}, ${row.immeuble_postal_code} ${row.immeuble_city}`,
      },
      solde: {
        impaye: parseFloat(soldeResult.rows[0].solde_impaye),
        nb_impayees: parseInt(soldeResult.rows[0].nb_impayees),
      },
      prochaine_quittance: prochainResult.rows[0] || null,
    });
  } catch (err) {
    console.error('getMe portail error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─── GET /api/portail/quittances ──────────────────────────────────────────────
export const getQuittances = async (req: PortailRequest, res: Response) => {
  try {
    const locataireId = req.locataire!.id;

    const result = await pool.query(
      `SELECT q.id, q.code, q.status, q.type_document,
              q.period_start, q.period_end, q.due_date, q.emission_date,
              q.loyer_ht, q.charges_ht, q.total_ttc, q.tva_amount,
              q.is_prorata, q.prorata_jours, q.prorata_total
       FROM quittances q
       JOIN baux b ON b.id = q.bail_id
       WHERE b.locataire_id = $1 AND q.status != 'annule'
       ORDER BY q.period_start DESC`,
      [locataireId]
    );

    res.json(result.rows.map(q => ({
      ...q,
      loyer_ht: parseFloat(q.loyer_ht),
      charges_ht: parseFloat(q.charges_ht),
      total_ttc: parseFloat(q.total_ttc),
      tva_amount: q.tva_amount ? parseFloat(q.tva_amount) : 0,
    })));
  } catch (err) {
    console.error('getQuittances portail error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─── GET /api/portail/quittances/:id/pdf ──────────────────────────────────────
export const downloadPdf = async (req: PortailRequest, res: Response) => {
  try {
    const locataireId = req.locataire!.id;
    const quittanceId = parseInt(req.params.id);

    // Vérifier que cette quittance appartient bien à ce locataire
    const check = await pool.query(
      `SELECT q.id FROM quittances q
       JOIN baux b ON b.id = q.bail_id
       WHERE q.id = $1 AND b.locataire_id = $2 AND q.status != 'annule'`,
      [quittanceId, locataireId]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Quittance introuvable ou accès refusé' });
    }

    // Déléguer au générateur PDF existant
    const { getPDF } = await import('./quittances.controller');
    const fakeReq = { params: { id: String(quittanceId) }, user: { id: 0, role: 'locataire' } } as any;
    return getPDF(fakeReq, res);
  } catch (err) {
    console.error('downloadPdf portail error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
