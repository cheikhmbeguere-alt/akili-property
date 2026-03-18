import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// ─── GET /indexations/a-faire ─────────────────────────────────────────────────
// Baux actifs avec indexation applicable dont la date est dépassée cette année
// et qui n'ont pas encore été indexés cette année.
export const getBauxAIndexer = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        b.id            AS bail_id,
        b.code          AS bail_code,
        b.loyer_ht,
        b.charges_ht,
        b.indice_base_value,
        b.indice_base_year,
        b.indice_base_quarter,
        b.indexation_date_month,
        b.indexation_date_day,
        b.last_indexation_date,
        b.start_date,
        lo.code         AS lot_code,
        lo.name         AS lot_name,
        im.name         AS immeuble_name,
        CASE
          WHEN loc.type = 'entreprise' THEN loc.company_name
          ELSE TRIM(COALESCE(loc.first_name,'') || ' ' || COALESCE(loc.last_name,''))
        END             AS locataire_nom,
        i.code          AS indice_code,
        i.name          AS indice_name,
        -- Dernier indice disponible
        lv.value        AS indice_nouveau,
        lv.year         AS indice_year,
        lv.quarter      AS indice_quarter,
        -- Indice utilisé lors de la dernière indexation (base de calcul pour la prochaine)
        COALESCE(last_ix.indice_nouveau, b.indice_base_value) AS indice_ancien,
        -- Loyer effectif actuel = dernier nouveau_loyer_ht ou loyer contractuel de base
        COALESCE(last_ix.nouveau_loyer_ht, b.loyer_ht) AS loyer_effectif,
        -- Date d'indexation prévue cette année
        TO_DATE(
          EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' ||
          LPAD(b.indexation_date_month::text, 2, '0') || '-' ||
          LPAD(COALESCE(b.indexation_date_day, 1)::text, 2, '0'),
          'YYYY-MM-DD'
        ) AS date_prevue,
        -- Nouveau loyer calculé depuis le loyer effectif × ratio d'indices
        CASE
          WHEN lv.value IS NOT NULL
            AND COALESCE(last_ix.indice_nouveau, b.indice_base_value) > 0
          THEN ROUND(
            COALESCE(last_ix.nouveau_loyer_ht, b.loyer_ht) * lv.value
            / NULLIF(COALESCE(last_ix.indice_nouveau, b.indice_base_value), 0),
            2)
          ELSE NULL
        END AS nouveau_loyer_ht,
        -- Variation %
        CASE
          WHEN lv.value IS NOT NULL
            AND COALESCE(last_ix.indice_nouveau, b.indice_base_value) > 0
          THEN ROUND(
            (lv.value / NULLIF(COALESCE(last_ix.indice_nouveau, b.indice_base_value), 0) - 1) * 100,
            2)
          ELSE NULL
        END AS variation_pct
      FROM baux b
      JOIN lots lo         ON b.lot_id        = lo.id
      JOIN immeubles im     ON lo.immeuble_id  = im.id
      JOIN locataires loc   ON b.locataire_id  = loc.id
      JOIN indices i        ON b.indice_id     = i.id
      -- Dernier indice publié
      LEFT JOIN LATERAL (
        SELECT value, year, quarter
        FROM indice_values
        WHERE indice_id = b.indice_id
        ORDER BY year DESC, quarter DESC
        LIMIT 1
      ) lv ON true
      -- Dernière indexation effectuée
      LEFT JOIN LATERAL (
        SELECT indice_nouveau, nouveau_loyer_ht
        FROM indexations
        WHERE bail_id = b.id
        ORDER BY indexation_date DESC
        LIMIT 1
      ) last_ix ON true
      WHERE b.status = 'actif'
        AND b.indexation_applicable = true
        AND b.indice_id IS NOT NULL
        AND b.indice_base_value IS NOT NULL
        AND b.indexation_date_month IS NOT NULL
        AND TO_DATE(
          EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' ||
          LPAD(b.indexation_date_month::text, 2, '0') || '-' ||
          LPAD(COALESCE(b.indexation_date_day, 1)::text, 2, '0'),
          'YYYY-MM-DD'
        ) <= CURRENT_DATE
        AND (
          b.last_indexation_date IS NULL
          OR EXTRACT(YEAR FROM b.last_indexation_date) < EXTRACT(YEAR FROM CURRENT_DATE)
        )
      ORDER BY date_prevue ASC
    `);

    res.json(result.rows.map(r => ({
      ...r,
      loyer_ht:         parseFloat(r.loyer_ht),
      loyer_effectif:   r.loyer_effectif   ? parseFloat(r.loyer_effectif)   : parseFloat(r.loyer_ht),
      nouveau_loyer_ht: r.nouveau_loyer_ht ? parseFloat(r.nouveau_loyer_ht) : null,
      variation_pct:    r.variation_pct    ? parseFloat(r.variation_pct)    : null,
      indice_nouveau:   r.indice_nouveau   ? parseFloat(r.indice_nouveau)   : null,
      indice_ancien:    r.indice_ancien    ? parseFloat(r.indice_ancien)    : null,
    })));
  } catch (err) {
    console.error('getBauxAIndexer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /indexations/apply/:bail_id ────────────────────────────────────────
export const applyIndexation = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { bail_id } = req.params;
    // indexation_date optionnel pour les rattrapages rétroactifs (format YYYY-MM-DD)
    const { nouveau_loyer_ht, indice_ancien, indice_nouveau, notes, indexation_date } = req.body;

    if (!nouveau_loyer_ht || !indice_ancien || !indice_nouveau) {
      return res.status(400).json({ error: 'Données insuffisantes' });
    }

    if (parseFloat(indice_ancien) <= 0) {
      return res.status(400).json({ error: 'L\'indice de base doit être supérieur à 0' });
    }

    // Date effective de l'indexation (peut être dans le passé pour un rattrapage)
    const effectiveDate = indexation_date || null; // null = CURRENT_DATE via SQL

    // Vérifier bail
    const bail = await client.query('SELECT * FROM baux WHERE id = $1 AND status = $2', [bail_id, 'actif']);
    if (!bail.rows.length) return res.status(404).json({ error: 'Bail introuvable' });

    // Loyer effectif = dernier nouveau_loyer_ht AVANT cette date ou loyer contractuel de base
    const lastIx = await client.query(
      `SELECT nouveau_loyer_ht FROM indexations
       WHERE bail_id = $1 AND indexation_date < COALESCE($2::date, CURRENT_DATE)
       ORDER BY indexation_date DESC LIMIT 1`,
      [bail_id, effectiveDate]
    );
    const ancien_loyer_ht = lastIx.rows.length
      ? parseFloat(lastIx.rows[0].nouveau_loyer_ht)
      : parseFloat(bail.rows[0].loyer_ht);

    const coefficient = parseFloat(indice_nouveau) / parseFloat(indice_ancien);

    // Enregistrer l'indexation (loyer contractuel baux.loyer_ht ne change PAS)
    const ix = await client.query(
      `INSERT INTO indexations
         (bail_id, indexation_date, ancien_loyer_ht, nouveau_loyer_ht, indice_ancien, indice_nouveau, coefficient, notes)
       VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [bail_id, effectiveDate, ancien_loyer_ht, parseFloat(nouveau_loyer_ht), parseFloat(indice_ancien),
       parseFloat(indice_nouveau), coefficient, notes || null]
    );

    // Mettre à jour last_indexation_date = la date la plus récente de toutes les indexations
    await client.query(
      `UPDATE baux SET
         last_indexation_date = (SELECT MAX(indexation_date) FROM indexations WHERE bail_id = $1),
         updated_at = NOW()
       WHERE id = $1`,
      [bail_id]
    );

    await client.query('COMMIT');
    res.json(ix.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('applyIndexation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// ─── POST /indexations/apply-batch ───────────────────────────────────────────
export const applyBatchIndexation = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const items: { bail_id: number; nouveau_loyer_ht: number; indice_ancien: number; indice_nouveau: number }[] = req.body.items || [];
    let applied = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        const bail = await client.query('SELECT loyer_ht FROM baux WHERE id = $1 AND status = $2', [item.bail_id, 'actif']);
        if (!bail.rows.length) { errors.push(`Bail #${item.bail_id} introuvable`); continue; }

        const coefficient = item.indice_nouveau / item.indice_ancien;

        // Loyer effectif = dernier nouveau_loyer_ht ou loyer contractuel de base
        const lastIxBatch = await client.query(
          `SELECT nouveau_loyer_ht FROM indexations WHERE bail_id = $1 ORDER BY indexation_date DESC LIMIT 1`,
          [item.bail_id]
        );
        const ancien_loyer_ht = lastIxBatch.rows.length
          ? parseFloat(lastIxBatch.rows[0].nouveau_loyer_ht)
          : parseFloat(bail.rows[0].loyer_ht);

        await client.query(
          `INSERT INTO indexations (bail_id, indexation_date, ancien_loyer_ht, nouveau_loyer_ht, indice_ancien, indice_nouveau, coefficient)
           VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)`,
          [item.bail_id, ancien_loyer_ht, item.nouveau_loyer_ht, item.indice_ancien, item.indice_nouveau, coefficient]
        );

        // Mettre à jour uniquement la date de dernière indexation (loyer_ht reste intact)
        await client.query(
          `UPDATE baux SET last_indexation_date = CURRENT_DATE, updated_at = NOW() WHERE id = $1`,
          [item.bail_id]
        );
        applied++;
      } catch (e: any) {
        errors.push(`Bail #${item.bail_id}: ${e.message}`);
      }
    }

    await client.query('COMMIT');
    res.json({ applied, errors });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('applyBatchIndexation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// ─── GET /indexations/rattrapage/:bail_id ────────────────────────────────────
// Calcule toutes les indexations annuelles manquantes depuis le début du bail
// Utilise le trimestre T4 comme référence pour une anniversary en janvier (T3 sinon)
export const getRattrapage = async (req: AuthRequest, res: Response) => {
  try {
    const { bail_id } = req.params;

    // Récupérer le bail avec ses paramètres
    const bailRes = await pool.query(`
      SELECT b.id, b.loyer_ht, b.start_date,
             b.indice_id, b.indice_base_value, b.indice_base_year, b.indice_base_quarter,
             b.indexation_date_month, b.indexation_date_day,
             b.solde_reprise_date, b.loyer_reprise,
             i.code AS indice_code
      FROM baux b
      JOIN indices i ON i.id = b.indice_id
      WHERE b.id = $1 AND b.status = 'actif'
        AND b.indexation_applicable = true
    `, [bail_id]);

    if (!bailRes.rows.length) return res.status(404).json({ error: 'Bail introuvable ou indexation non applicable' });
    const bail = bailRes.rows[0];

    // Indexations déjà enregistrées
    const existingRes = await pool.query(
      `SELECT EXTRACT(YEAR FROM indexation_date)::int AS year, indexation_date, nouveau_loyer_ht, indice_ancien, indice_nouveau
       FROM indexations WHERE bail_id = $1 ORDER BY indexation_date ASC`,
      [bail_id]
    );
    const existingByYear = new Map(existingRes.rows.map((r: any) => [r.year, r]));

    // Tous les indices disponibles triés
    const indicesRes = await pool.query(
      `SELECT year, quarter, value FROM indice_values WHERE indice_id = $1 ORDER BY year ASC, quarter ASC`,
      [bail.indice_id]
    );
    // Map year→quarter→value
    const indiceMap = new Map<string, number>();
    for (const r of indicesRes.rows) {
      indiceMap.set(`${r.year}-${r.quarter}`, parseFloat(r.value));
    }

    const anniversaryMonth = parseInt(bail.indexation_date_month) || 1;

    // Trimestre de référence : utiliser indice_base_quarter du bail (explicitement saisi)
    // Fallback : dériver du mois d'anniversaire si non défini
    const refQuarter = bail.indice_base_quarter
      ? parseInt(bail.indice_base_quarter)
      : (anniversaryMonth <= 3 ? 4 : anniversaryMonth <= 6 ? 1 : anniversaryMonth <= 9 ? 2 : 3);

    // Année de départ : utiliser la date de reprise si saisie, sinon la date de début du bail
    // (permet d'éviter de recalculer les années avant l'entrée dans le système)
    const startYear = bail.solde_reprise_date
      ? new Date(bail.solde_reprise_date).getFullYear()
      : new Date(bail.start_date).getFullYear();
    const baseYear = bail.indice_base_year ? parseInt(bail.indice_base_year) : new Date(bail.start_date).getFullYear();
    const baseValue = parseFloat(bail.indice_base_value);
    const currentYear = new Date().getFullYear();

    // Construire le tableau an par an
    const rows: any[] = [];
    // Loyer de base : si loyer_reprise saisi ET aucune indexation déjà enregistrée,
    // utiliser ce loyer (qui reflète les indexations appliquées avant la reprise)
    let loyerCourant = (bail.loyer_reprise && existingRes.rows.length === 0)
      ? parseFloat(bail.loyer_reprise)
      : parseFloat(bail.loyer_ht);

    for (let year = startYear + 1; year <= currentYear; year++) {
      const anniversaryDate = `${year}-${String(anniversaryMonth).padStart(2, '0')}-01`;

      // Chaîne basée sur l'indice_base_year du bail :
      // Année Y → ancien = baseYear + (Y - startYear - 1), nouveau = baseYear + (Y - startYear)
      const yearsFromStart = year - startYear;
      const refYearAncien = baseYear + yearsFromStart - 1;
      const refYearNouveau = baseYear + yearsFromStart;

      // Pour la première indexation, l'ancien = indice_base_value du bail (valeur certaine)
      // Pour les suivantes, récupérer depuis la table indice_values
      const indiceAncien = refYearAncien === baseYear
        ? baseValue
        : (indiceMap.get(`${refYearAncien}-${refQuarter}`) ?? null);

      const indiceNouveau = indiceMap.get(`${refYearNouveau}-${refQuarter}`) ??
        // Fallback : trimestre le plus récent disponible si le trimestre exact n'existe pas encore
        (() => {
          for (let q = 4; q >= 1; q--) {
            const v = indiceMap.get(`${refYearNouveau}-${q}`);
            if (v) return v;
          }
          return null;
        })();

      const alreadyDone = existingByYear.has(year);

      // Loyer de base = valeur courante accumulée (chaîne depuis la 1ère année)
      // Si une indexation a déjà été appliquée pour cette année, on prend sa valeur réelle
      const existingRow = alreadyDone ? existingByYear.get(year) : null;
      const loyerBase = loyerCourant;

      const nouveauLoyer = (indiceAncien && indiceNouveau)
        ? Math.round(loyerBase * indiceNouveau / indiceAncien * 100) / 100
        : null;
      const variation = (indiceAncien && indiceNouveau)
        ? Math.round((indiceNouveau / indiceAncien - 1) * 10000) / 100
        : null;

      rows.push({
        year,
        anniversary_date: anniversaryDate,
        ref_quarter: refQuarter,
        ref_year_ancien: refYearAncien,
        ref_year_nouveau: refYearNouveau,
        indice_ancien: indiceAncien || null,
        indice_nouveau: indiceNouveau || null,
        loyer_base: loyerBase,
        nouveau_loyer: alreadyDone ? parseFloat(existingRow.nouveau_loyer_ht) : nouveauLoyer,
        variation_pct: variation,
        already_done: alreadyDone,
        existing: existingRow || null,
        can_apply: !alreadyDone && !!indiceAncien && !!indiceNouveau,
      });

      // Mettre à jour le loyer courant pour la prochaine année
      if (alreadyDone && existingRow) {
        loyerCourant = parseFloat(existingRow.nouveau_loyer_ht);
      } else if (!alreadyDone && nouveauLoyer) {
        loyerCourant = nouveauLoyer;
      }
    }

    res.json({
      bail_id: parseInt(bail_id),
      loyer_contractuel: parseFloat(bail.loyer_ht),
      loyer_reprise: bail.loyer_reprise ? parseFloat(bail.loyer_reprise) : null,
      solde_reprise_date: bail.solde_reprise_date || null,
      indice_code: bail.indice_code,
      indice_base_value: baseValue,
      indice_base_year: baseYear,
      ref_quarter: refQuarter,
      rows,
    });
  } catch (err) {
    console.error('getRattrapage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── GET /indexations/historique ─────────────────────────────────────────────
export const getHistorique = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        ix.*,
        b.code          AS bail_code,
        lo.code         AS lot_code,
        lo.name         AS lot_name,
        im.name         AS immeuble_name,
        CASE
          WHEN loc.type = 'entreprise' THEN loc.company_name
          ELSE TRIM(COALESCE(loc.first_name,'') || ' ' || COALESCE(loc.last_name,''))
        END             AS locataire_nom,
        i.code          AS indice_code
      FROM indexations ix
      JOIN baux b        ON b.id            = ix.bail_id
      JOIN lots lo       ON b.lot_id        = lo.id
      JOIN immeubles im  ON lo.immeuble_id  = im.id
      JOIN locataires loc ON b.locataire_id = loc.id
      LEFT JOIN indices i ON b.indice_id   = i.id
      ORDER BY ix.indexation_date DESC
      LIMIT 200
    `);
    res.json(result.rows.map(r => ({
      ...r,
      ancien_loyer_ht:  parseFloat(r.ancien_loyer_ht),
      nouveau_loyer_ht: parseFloat(r.nouveau_loyer_ht),
      coefficient:      parseFloat(r.coefficient),
    })));
  } catch (err) {
    console.error('getHistorique error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── GET /indices ─────────────────────────────────────────────────────────────
export const getIndices = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT i.*,
        lv.value      AS derniere_valeur,
        lv.year       AS derniere_annee,
        lv.quarter    AS dernier_trimestre
      FROM indices i
      LEFT JOIN LATERAL (
        SELECT value, year, quarter
        FROM indice_values
        WHERE indice_id = i.id
        ORDER BY year DESC, quarter DESC
        LIMIT 1
      ) lv ON true
      ORDER BY i.code
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('getIndices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── GET /indices/:id/values ──────────────────────────────────────────────────
export const getIndiceValues = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM indice_values WHERE indice_id = $1 ORDER BY year DESC, quarter DESC`,
      [req.params.id]
    );
    res.json(result.rows.map(r => ({ ...r, value: parseFloat(r.value) })));
  } catch (err) {
    console.error('getIndiceValues error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /indexations/sync-insee ─────────────────────────────────────────────
// Récupère les dernières valeurs IRL/ILC/ILAT/ICC depuis l'API INSEE BDM
// Requiert INSEE_CLIENT_KEY + INSEE_CLIENT_SECRET dans .env (inscription gratuite api.insee.fr)
export const syncInsee = async (_req: AuthRequest, res: Response) => {
  // Codes de séries INSEE BDM (surchargeables par variables d'environnement)
  const INSEE_SERIES: Record<string, string> = {
    IRL:  process.env.INSEE_SERIES_IRL  || '001515333',
    ILC:  process.env.INSEE_SERIES_ILC  || '001532540',
    ILAT: process.env.INSEE_SERIES_ILAT || '001617112',
    ICC:  process.env.INSEE_SERIES_ICC  || '000008630',
  };

  const clientKey    = process.env.INSEE_CLIENT_KEY;
  const clientSecret = process.env.INSEE_CLIENT_SECRET;

  // Récupération du token OAuth2
  let accessToken: string | null = null;
  if (clientKey && clientSecret) {
    try {
      const credentials = Buffer.from(`${clientKey}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch('https://api.insee.fr/token', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json() as any;
        accessToken = tokenData.access_token;
      }
    } catch { /* fallback to guest mode */ }
  }

  const fetchHeaders: Record<string, string> = { 'Accept': 'application/xml' };
  if (accessToken) fetchHeaders['Authorization'] = `Bearer ${accessToken}`;

  const results: { code: string; imported: number; error?: string }[] = [];
  let totalImported = 0;

  for (const [code, seriesId] of Object.entries(INSEE_SERIES)) {
    try {
      const url = `https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/${seriesId}?lastNObservations=20`;
      const dataRes = await fetch(url, { headers: fetchHeaders });

      if (!dataRes.ok) {
        results.push({ code, imported: 0, error: `INSEE HTTP ${dataRes.status}` });
        continue;
      }

      const xml = await dataRes.text();

      // Parse SDMX StructureSpecificData — format INSEE BDM
      // Ex: <Obs TIME_PERIOD="2025-Q3" OBS_VALUE="143.21" .../>
      const obsRegex = /TIME_PERIOD="(\d{4})-Q(\d)"[^>]*OBS_VALUE="([\d.]+)"/g;
      const observations: { year: number; quarter: number; value: number }[] = [];

      for (const match of xml.matchAll(obsRegex)) {
        observations.push({ year: parseInt(match[1]), quarter: parseInt(match[2]), value: parseFloat(match[3]) });
      }

      if (!observations.length) {
        results.push({ code, imported: 0, error: 'Aucune observation trouvée (vérifiez le code série)' });
        continue;
      }

      const indiceRow = await pool.query('SELECT id FROM indices WHERE code = $1', [code]);
      if (!indiceRow.rows.length) { results.push({ code, imported: 0, error: 'Indice absent en base' }); continue; }
      const indice_id = indiceRow.rows[0].id;

      for (const obs of observations) {
        await pool.query(
          `INSERT INTO indice_values (indice_id, year, quarter, value)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (indice_id, year, quarter) DO UPDATE SET value = EXCLUDED.value`,
          [indice_id, obs.year, obs.quarter, obs.value]
        );
      }

      results.push({ code, imported: observations.length });
      totalImported += observations.length;
    } catch (err: any) {
      results.push({ code, imported: 0, error: err.message });
    }
  }

  res.json({ success: true, totalImported, details: results, timestamp: new Date().toISOString() });
};

// ─── POST /indices/:id/values ─────────────────────────────────────────────────
export const addIndiceValue = async (req: AuthRequest, res: Response) => {
  try {
    const { year, quarter, value, publication_date } = req.body;
    if (!year || !quarter || !value) return res.status(400).json({ error: 'year, quarter et value sont requis' });

    const result = await pool.query(
      `INSERT INTO indice_values (indice_id, year, quarter, value, publication_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (indice_id, year, quarter) DO UPDATE SET value = EXCLUDED.value, publication_date = EXCLUDED.publication_date
       RETURNING *`,
      [req.params.id, year, quarter, value, publication_date || null]
    );
    res.status(201).json({ ...result.rows[0], value: parseFloat(result.rows[0].value) });
  } catch (err) {
    console.error('addIndiceValue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
