import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

const PENNYLANE_BASE = 'https://app.pennylane.com/api/external/v2';

// ─── Helper : récupérer le token d'une SCI ───────────────────────────────────
async function getToken(sciId: number): Promise<string | null> {
  const r = await pool.query(
    `SELECT pennylane_api_token FROM sci WHERE id = $1`, [sciId]
  );
  return r.rows[0]?.pennylane_api_token || null;
}

function pennylaneHeaders(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

// ─── Helper : tester le token ─────────────────────────────────────────────────
async function testToken(token: string): Promise<{ ok: boolean; status?: number }> {
  const r = await fetch(`${PENNYLANE_BASE}/transactions?limit=1`, {
    headers: pennylaneHeaders(token),
  });
  return { ok: r.ok, status: r.status };
}

// ─── Helper : extraire sci_id depuis la query ou le body ─────────────────────
function parseSciId(req: AuthRequest): number | null {
  const raw = req.query.sci_id || req.body?.sci_id;
  const parsed = parseInt(String(raw));
  return isNaN(parsed) ? null : parsed;
}

// ─── GET /pennylane/token?sci_id=X ───────────────────────────────────────────
export const getTokenStatus = async (req: AuthRequest, res: Response) => {
  try {
    const sciId = parseSciId(req);
    if (!sciId) return res.status(400).json({ error: 'sci_id requis' });

    const sciRow = await pool.query(`SELECT name, pennylane_api_token FROM sci WHERE id = $1`, [sciId]);
    if (!sciRow.rows.length) return res.status(404).json({ error: 'SCI introuvable' });

    const { name: sciName, pennylane_api_token: token } = sciRow.rows[0];
    if (!token) return res.json({ configured: false, sci_name: sciName });

    const { ok, status } = await testToken(token);
    if (ok) return res.json({ configured: true, sci_name: sciName });
    return res.json({ configured: true, error: `Token expiré ou invalide (HTTP ${status})` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /pennylane/token ────────────────────────────────────────────────────
export const saveToken = async (req: AuthRequest, res: Response) => {
  try {
    const { token, sci_id } = req.body;
    if (!token) return res.status(400).json({ error: 'token requis' });
    if (!sci_id) return res.status(400).json({ error: 'sci_id requis' });

    const { ok, status } = await testToken(token);
    if (!ok) return res.status(400).json({ error: `Token invalide (HTTP ${status}) — vérifiez le scope "transactions:readonly"` });

    await pool.query(`UPDATE sci SET pennylane_api_token = $1 WHERE id = $2`, [token, sci_id]);

    const sciRow = await pool.query(`SELECT name FROM sci WHERE id = $1`, [sci_id]);
    res.json({ success: true, sci_name: sciRow.rows[0]?.name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE /pennylane/token?sci_id=X ────────────────────────────────────────
export const deleteToken = async (req: AuthRequest, res: Response) => {
  try {
    const sciId = parseSciId(req);
    if (!sciId) return res.status(400).json({ error: 'sci_id requis' });

    await pool.query(`UPDATE sci SET pennylane_api_token = NULL WHERE id = $1`, [sciId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /pennylane/transactions?sci_id=X ────────────────────────────────────
export const getTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const sciId = parseSciId(req);
    if (!sciId) return res.status(400).json({ error: 'sci_id requis' });

    const token = await getToken(sciId);
    if (!token) return res.status(400).json({ error: 'Token Pennylane non configuré pour cette SCI' });

    const cursor = req.query.cursor as string | undefined;
    const params = new URLSearchParams({ 'limit': '50' });
    if (cursor) params.append('cursor', cursor);

    const r = await fetch(`${PENNYLANE_BASE}/transactions?${params}`, {
      headers: pennylaneHeaders(token),
    });

    if (!r.ok) {
      const errText = await r.text();
      // Ne jamais retransmettre un 401 Pennylane → le frontend le confondrait avec une session expirée
      const httpStatus = r.status === 401 ? 400 : r.status;
      return res.status(httpStatus).json({ error: `Token Pennylane invalide ou expiré — reconnectez-le dans les paramètres` });
    }

    const data = await r.json() as any;
    const transactions = (data.items || data.bank_transactions || []) as any[];
    if (transactions.length > 0) console.log('[Pennylane] Champs transaction:', Object.keys(transactions[0]));

    // Marquer celles déjà importées
    const ids = transactions.map((t: any) => t.id).filter(Boolean);
    let importedIds = new Set<string>();
    if (ids.length) {
      const existing = await pool.query(
        `SELECT pennylane_transaction_id FROM encaissements
         WHERE pennylane_transaction_id = ANY($1::text[])`,
        [ids]
      );
      importedIds = new Set(existing.rows.map((r: any) => r.pennylane_transaction_id));
    }

    // Charger les baux actifs de cette SCI uniquement
    const bauxResult = await pool.query(`
      SELECT b.id AS bail_id, b.code AS bail_code,
        lo.code AS lot_code, lo.name AS lot_name,
        im.name AS immeuble_name,
        b.loyer_ht,
        b.locataire_id,
        CASE WHEN loc.type = 'entreprise' THEN loc.company_name
          ELSE TRIM(COALESCE(loc.first_name,'') || ' ' || COALESCE(loc.last_name,''))
        END AS locataire_nom
      FROM baux b
      JOIN lots lo          ON b.lot_id = lo.id
      JOIN immeubles im     ON lo.immeuble_id = im.id
      JOIN sci_immeuble si  ON si.immeuble_id = im.id
      JOIN locataires loc   ON b.locataire_id = loc.id
      WHERE b.status = 'actif' AND si.sci_id = $1
    `, [sciId]);
    const baux = bauxResult.rows;

    // Enrichir chaque transaction avec suggestion de matching
    const enriched = transactions.map((t: any) => {
      const amount = parseFloat(t.amount_eur || t.currency_amount || t.amount || 0);
      const rawDate = t.date || t.transaction_date || t.executed_at || t.execution_date || null;
      const label  = (t.label || t.description || t.title || '').toLowerCase();
      // V2 : tiers dans customer.name (encaissement) ou supplier.name (dépense)
      const thirdpartyRaw = t.customer?.name || t.supplier?.name || t.thirdparty_name || t.counterpart_name || t.third_party || '';
      const thirdparty = thirdpartyRaw.toLowerCase();

      let bestMatch: any = null;
      let bestScore = 0;

      for (const b of baux) {
        let score = 0;
        const nomLow = b.locataire_nom.toLowerCase();

        // Matching montant ±5%
        const loyer = parseFloat(b.loyer_ht);
        if (loyer > 0 && Math.abs(amount - loyer) / loyer < 0.05) score += 40;

        // Matching nom locataire dans le tiers (priorité) ou le libellé
        if (nomLow && (thirdparty.includes(nomLow) || label.includes(nomLow))) score += 50;
        else {
          const parts = nomLow.split(' ');
          const matchParts = parts.filter((p: string) => p.length > 2 && (thirdparty.includes(p) || label.includes(p)));
          score += matchParts.length * 15;
        }

        // Matching code lot
        if (b.lot_code && label.includes(b.lot_code.toLowerCase())) score += 30;

        if (score > bestScore) { bestScore = score; bestMatch = b; }
      }

      return {
        id: t.id,
        date: rawDate,
        label: t.label || t.description || t.title || '',
        amount: amount,
        thirdparty: thirdpartyRaw,
        currency: t.currency || 'EUR',
        already_imported: importedIds.has(String(t.id)),
        suggested_bail: bestScore >= 40 ? { ...bestMatch, score: bestScore } : null,
      };
    });

    res.json({
      transactions: enriched,
      meta: {
        has_more: data.has_more || false,
        next_cursor: data.next_cursor || null,
        total_pages: data.total_pages || null,
        current_page: data.current_page || null,
      },
    });
  } catch (err: any) {
    console.error('getTransactions error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /pennylane/import ───────────────────────────────────────────────────
export const importTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const { transaction_id, bail_id, date, amount, label, periode_mois, periode_annee } = req.body;

    if (!transaction_id || !bail_id || !date || !amount) {
      return res.status(400).json({ error: 'transaction_id, bail_id, date, amount requis' });
    }

    const exists = await pool.query(
      'SELECT id FROM encaissements WHERE pennylane_transaction_id = $1',
      [String(transaction_id)]
    );
    if (exists.rows.length) {
      return res.status(409).json({ error: 'Transaction déjà importée' });
    }

    const bail = await pool.query('SELECT locataire_id FROM baux WHERE id = $1', [bail_id]);
    if (!bail.rows.length) return res.status(404).json({ error: 'Bail introuvable' });
    const { locataire_id } = bail.rows[0];

    const count = await pool.query('SELECT COUNT(*) FROM encaissements');
    const newCode = `ENC-${String(parseInt(count.rows[0].count) + 1).padStart(5, '0')}`;

    const result = await pool.query(
      `INSERT INTO encaissements
        (code, bail_id, locataire_id, payment_date, amount, reference, source,
         pennylane_transaction_id, pennylane_import_date, periode_mois, periode_annee)
       VALUES ($1,$2,$3,$4,$5,$6,'pennylane',$7,NOW(),$8,$9)
       RETURNING *`,
      [
        newCode, bail_id, locataire_id, date, parseFloat(amount),
        label || null, String(transaction_id),
        periode_mois || null, periode_annee || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error('importTransaction error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /pennylane/import-batch ─────────────────────────────────────────────
export const importBatch = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const items: any[] = req.body.items || [];
    let imported = 0;
    const errors: string[] = [];

    const count = await client.query('SELECT COUNT(*) FROM encaissements');
    let counter = parseInt(count.rows[0].count);

    for (const item of items) {
      const { transaction_id, bail_id, date, amount, label, periode_mois, periode_annee } = item;
      if (!transaction_id || !bail_id || !date || !amount) {
        errors.push(`Transaction ${transaction_id}: données incomplètes`); continue;
      }

      const exists = await client.query(
        'SELECT id FROM encaissements WHERE pennylane_transaction_id = $1', [String(transaction_id)]
      );
      if (exists.rows.length) { errors.push(`Transaction ${transaction_id}: déjà importée`); continue; }

      const bail = await client.query('SELECT locataire_id FROM baux WHERE id = $1', [bail_id]);
      if (!bail.rows.length) { errors.push(`Bail #${bail_id}: introuvable`); continue; }

      counter++;
      const code = `ENC-${String(counter).padStart(5, '0')}`;

      await client.query(
        `INSERT INTO encaissements
          (code, bail_id, locataire_id, payment_date, amount, reference, source,
           pennylane_transaction_id, pennylane_import_date, periode_mois, periode_annee)
         VALUES ($1,$2,$3,$4,$5,$6,'pennylane',$7,NOW(),$8,$9)`,
        [code, bail_id, bail.rows[0].locataire_id, date, parseFloat(amount),
         label || null, String(transaction_id), periode_mois || null, periode_annee || null]
      );
      imported++;
    }

    await client.query('COMMIT');
    res.json({ imported, errors });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};
