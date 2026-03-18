import { Response, Request } from 'express';
import pool from '../config/database';
import { AuthRequest, resolveRequestSciIds } from '../middleware/auth.middleware';

// ─── Helpers ────────────────────────────────────────────────────────────────

const ENCAISSEMENT_SELECT = `
  SELECT e.*,
    b.code       AS bail_code,
    lo.code      AS lot_code,
    lo.name      AS lot_name,
    i.name       AS immeuble_name,
    loc.code     AS locataire_code,
    loc.type     AS locataire_type,
    loc.company_name  AS locataire_company,
    loc.first_name    AS locataire_first_name,
    loc.last_name     AS locataire_last_name,
    (SELECT json_agg(json_build_object(
        'id', l.id,
        'quittance_id', l.quittance_id,
        'quittance_code', q.code,
        'amount_lettre', l.amount_lettre,
        'period_start', q.period_start,
        'type_document', q.type_document
      ))
     FROM lettrage l
     JOIN quittances q ON q.id = l.quittance_id
     WHERE l.encaissement_id = e.id
    ) AS lettrages
  FROM encaissements e
  LEFT JOIN baux b        ON e.bail_id = b.id
  LEFT JOIN lots lo       ON b.lot_id = lo.id
  LEFT JOIN immeubles i   ON lo.immeuble_id = i.id
  LEFT JOIN locataires loc ON COALESCE(b.locataire_id, e.locataire_id) = loc.id
`;

// ─── CRUD ────────────────────────────────────────────────────────────────────

export const getAllEncaissements = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);
    if (sciIds !== null && sciIds.length === 0) return res.json([]);

    const { bail_id, locataire_id, year, month } = req.query;
    const params: any[] = [];
    const conditions: string[] = [];

    if (sciIds !== null) {
      const ph = sciIds.map((_: any, idx: number) => `$${idx + 1}`).join(',');
      conditions.push(`lo.immeuble_id IN (SELECT immeuble_id FROM sci_immeuble WHERE sci_id IN (${ph}))`);
      params.push(...sciIds);
    }
    if (bail_id)       { conditions.push(`e.bail_id = $${params.length+1}`);                           params.push(bail_id); }
    if (locataire_id)  { conditions.push(`(b.locataire_id = $${params.length+1} OR e.locataire_id = $${params.length+1})`); params.push(locataire_id); }
    if (year)          { conditions.push(`EXTRACT(YEAR FROM e.payment_date) = $${params.length+1}`);   params.push(year); }
    if (month)         { conditions.push(`EXTRACT(MONTH FROM e.payment_date) = $${params.length+1}`);  params.push(month); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `${ENCAISSEMENT_SELECT} ${where} ORDER BY e.payment_date DESC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('getAllEncaissements error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEncaissementById = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `${ENCAISSEMENT_SELECT} WHERE e.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Encaissement introuvable' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createEncaissement = async (req: AuthRequest, res: Response) => {
  try {
    const {
      bail_id, locataire_id, payment_date, amount, payment_method,
      reference, periode_mois, periode_annee, notes, source, pennylane_transaction_id
    } = req.body;

    if (!payment_date || !amount) {
      return res.status(400).json({ error: 'payment_date et amount sont requis' });
    }
    if (!bail_id && !locataire_id) {
      return res.status(400).json({ error: 'bail_id ou locataire_id est requis' });
    }

    // Résoudre locataire_id depuis le bail si non fourni
    let resolvedLocataireId = locataire_id;
    if (bail_id && !locataire_id) {
      const bail = await pool.query('SELECT locataire_id FROM baux WHERE id = $1', [bail_id]);
      if (bail.rows.length) resolvedLocataireId = bail.rows[0].locataire_id;
    }

    const result = await pool.query(
      `INSERT INTO encaissements
        (bail_id, locataire_id, payment_date, amount, payment_method,
         reference, periode_mois, periode_annee, notes, source, pennylane_transaction_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [bail_id || null, resolvedLocataireId || null, payment_date, amount, payment_method || null,
       reference || null, periode_mois || null, periode_annee || null,
       notes || null, source || 'manuel', pennylane_transaction_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('createEncaissement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateEncaissement = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { payment_date, amount, payment_method, reference, periode_mois, periode_annee, notes, bail_id } = req.body;

    const result = await pool.query(
      `UPDATE encaissements SET
        payment_date    = COALESCE($1, payment_date),
        amount          = COALESCE($2, amount),
        payment_method  = COALESCE($3, payment_method),
        reference       = COALESCE($4, reference),
        periode_mois    = COALESCE($5, periode_mois),
        periode_annee   = COALESCE($6, periode_annee),
        notes           = COALESCE($7, notes),
        bail_id         = COALESCE($8, bail_id),
        updated_at      = NOW()
       WHERE id = $9 RETURNING *`,
      [payment_date, amount, payment_method, reference, periode_mois, periode_annee, notes, bail_id, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Introuvable' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteEncaissement = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM encaissements WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Introuvable' });
    res.json({ message: 'Supprimé', id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Lettrage ────────────────────────────────────────────────────────────────

// GET /api/encaissements/:id/lettrage
export const getLettrage = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT l.*,
              q.code AS quittance_code, q.period_start, q.period_end,
              q.total_ttc, q.type_document, q.status AS quittance_status
       FROM lettrage l
       JOIN quittances q ON q.id = l.quittance_id
       WHERE l.encaissement_id = $1
       ORDER BY l.lettrage_date DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/encaissements/:id/quittances-disponibles
// Retourne les quittances 'emis' du même bail pour proposer le lettrage
export const getQuittancesDisponibles = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const enc = await pool.query('SELECT bail_id FROM encaissements WHERE id = $1', [id]);
    if (!enc.rows.length) return res.status(404).json({ error: 'Encaissement introuvable' });
    const bail_id = enc.rows[0].bail_id;
    if (!bail_id) return res.json([]);

    const result = await pool.query(
      `SELECT q.id, q.code, q.type_document, q.period_start, q.period_end,
              q.total_ttc, q.loyer_ht, q.charges_ht, q.status,
              q.due_date
       FROM quittances q
       WHERE q.bail_id = $1 AND q.status = 'emis'
       ORDER BY q.period_start ASC`,
      [bail_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/encaissements/:id/lettrer
export const lettrerEncaissement = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { quittance_ids } = req.body; // tableau de quittance_id

  if (!quittance_ids || !Array.isArray(quittance_ids) || quittance_ids.length === 0) {
    return res.status(400).json({ error: 'quittance_ids (tableau) requis' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérifier l'encaissement
    const enc = await client.query('SELECT * FROM encaissements WHERE id = $1', [id]);
    if (!enc.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Encaissement introuvable' });
    }
    const encaissement = enc.rows[0];

    let nbLettres = 0;
    for (const quittance_id of quittance_ids) {
      // Vérifier la quittance
      const quit = await client.query('SELECT * FROM quittances WHERE id = $1', [quittance_id]);
      if (!quit.rows.length) continue;
      const quittance = quit.rows[0];

      if (quittance.bail_id !== encaissement.bail_id) continue;
      if (quittance.status !== 'emis') continue;

      // Éviter les doublons
      const exists = await client.query(
        'SELECT id FROM lettrage WHERE encaissement_id = $1 AND quittance_id = $2',
        [id, quittance_id]
      );
      if (exists.rows.length) continue;

      await client.query(
        `INSERT INTO lettrage (encaissement_id, quittance_id, amount_lettre, lettrage_date, created_by)
         VALUES ($1, $2, $3, NOW(), $4)`,
        [id, quittance_id, quittance.total_ttc, req.user!.id]
      );

      await client.query(
        `UPDATE quittances SET status = 'paye', updated_at = NOW() WHERE id = $1`,
        [quittance_id]
      );
      nbLettres++;
    }

    await client.query('COMMIT');
    res.json({ success: true, nb_lettres: nbLettres });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// DELETE /api/encaissements/:id/lettrer/:lettrage_id
export const deleteLettrage = async (req: AuthRequest, res: Response) => {
  const { lettrage_id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const l = await client.query('SELECT * FROM lettrage WHERE id = $1', [lettrage_id]);
    if (!l.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lettrage introuvable' });
    }

    // Remettre la quittance en 'emis'
    await client.query(
      `UPDATE quittances SET status = 'emis', updated_at = NOW() WHERE id = $1`,
      [l.rows[0].quittance_id]
    );
    await client.query('DELETE FROM lettrage WHERE id = $1', [lettrage_id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// ─── Import CSV ──────────────────────────────────────────────────────────────

type CsvRow = Record<string, string>;

function detectSeparator(line: string): string {
  return (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ';' : ',';
}

function parseCSV(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = detectSeparator(lines[0]);
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(sep).map(v => v.trim().replace(/^["']|["']$/g, ''));
    const row: CsvRow = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

function findCol(row: CsvRow, candidates: string[]): string | undefined {
  for (const c of candidates) {
    const key = Object.keys(row).find(k => k === c || k.includes(c));
    if (key && row[key]) return row[key];
  }
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? null : Math.abs(n);
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // dd/mm/yyyy → yyyy-mm-dd
  const fr = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  // yyyy-mm-dd already
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.substring(0, 10);
  return null;
}

export const importCSV = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier CSV requis' });

    const content = req.file.buffer.toString('utf-8');
    const rows = parseCSV(content);

    if (!rows.length) return res.status(400).json({ error: 'CSV vide ou mal formaté' });

    // Charger tous les baux actifs pour le matching
    const bauxResult = await pool.query(`
      SELECT b.id, b.code,
        loc.first_name || ' ' || loc.last_name AS nom_complet,
        loc.company_name,
        b.locataire_id
      FROM baux b
      JOIN locataires loc ON b.locataire_id = loc.id
      WHERE b.status = 'actif'
    `);
    const baux = bauxResult.rows;

    let imported = 0, skipped = 0;
    const unmatched: any[] = [];

    for (const row of rows) {
      // Extraire les champs
      const rawDate   = findCol(row, ['date', 'date_paiement', 'date_reglement', 'date_echeance', 'date_operation']);
      const rawAmount = findCol(row, ['montant', 'amount', 'credit', 'debit', 'solde']);
      const rawRef    = findCol(row, ['reference', 'libelle', 'description', 'label', 'intitule']);
      const rawName   = findCol(row, ['locataire', 'client', 'tiers', 'nom', 'contrepartie']);
      const rawPennyId = findCol(row, ['id', 'transaction_id', 'pennylane_id', 'ref']);

      const date   = parseDate(rawDate || '');
      const amount = parseAmount(rawAmount || '');

      if (!date || !amount || amount <= 0) continue;

      // Dédoublonnage
      if (rawPennyId) {
        const exists = await pool.query(
          'SELECT id FROM encaissements WHERE pennylane_transaction_id = $1', [rawPennyId]
        );
        if (exists.rows.length) { skipped++; continue; }
      }

      // Matching bail : code exact → nom locataire partiel
      let matchedBail: any = null;
      const rawCode = findCol(row, ['bail', 'bail_code', 'code_bail']);
      if (rawCode) {
        matchedBail = baux.find(b => b.code.toLowerCase() === rawCode.toLowerCase());
      }
      if (!matchedBail && rawName) {
        const search = rawName.toLowerCase();
        matchedBail = baux.find(b =>
          (b.nom_complet && b.nom_complet.toLowerCase().includes(search)) ||
          (b.company_name && b.company_name.toLowerCase().includes(search))
        );
      }

      if (matchedBail) {
        await pool.query(
          `INSERT INTO encaissements
            (bail_id, locataire_id, payment_date, amount, reference, source, pennylane_transaction_id)
           VALUES ($1,$2,$3,$4,$5,'import_csv',$6)`,
          [matchedBail.id, matchedBail.locataire_id, date, amount, rawRef || rawName || null, rawPennyId || null]
        );
        imported++;
      } else {
        unmatched.push({ date, amount, reference: rawRef || '', locataire: rawName || '', raw: row });
      }
    }

    res.json({
      imported,
      skipped,
      unmatched_count: unmatched.length,
      unmatched: unmatched.slice(0, 50), // max 50 lignes retournées
    });
  } catch (error) {
    console.error('importCSV error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'import' });
  }
};
