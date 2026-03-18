import { Response } from 'express';
import pool from '../config/database';
import { AuthRequest, resolveRequestSciIds } from '../middleware/auth.middleware';

const TYPES_CHARGE = ['eau', 'electricite', 'chauffage', 'gaz', 'gardiennage',
  'entretien', 'travaux', 'assurance', 'taxe_fonciere', 'autre'];

// ─── GET /api/charges-reelles ─────────────────────────────────────────────────
export const getAllChargesReelles = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);
    if (sciIds !== null && sciIds.length === 0) return res.json([]);

    const { annee, immeuble_id, type_charge, sci_id } = req.query;
    const params: any[] = [];
    const filters: string[] = [];

    if (sciIds) {
      const ph = sciIds.map((_, i) => `$${params.push(sciIds[i])}`).join(',');
      filters.push(`cr.sci_id IN (${ph})`);
    } else if (sci_id) {
      filters.push(`cr.sci_id = $${params.push(Number(sci_id))}`);
    }
    if (annee)       filters.push(`cr.periode_annee = $${params.push(Number(annee))}`);
    if (immeuble_id) filters.push(`cr.immeuble_id  = $${params.push(Number(immeuble_id))}`);
    if (type_charge) filters.push(`cr.type_charge  = $${params.push(type_charge)}`);

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT cr.*,
             s.name   AS sci_name,
             im.name  AS immeuble_name,
             lo.code  AS lot_code, lo.name AS lot_name,
             b.code   AS bail_code,
             CONCAT(loc.first_name, ' ', loc.last_name) AS locataire_nom
      FROM charges_reelles cr
      LEFT JOIN sci        s   ON s.id  = cr.sci_id
      LEFT JOIN immeubles  im  ON im.id = cr.immeuble_id
      LEFT JOIN lots       lo  ON lo.id = cr.lot_id
      LEFT JOIN baux       b   ON b.id  = cr.bail_id
      LEFT JOIN locataires loc ON loc.id = b.locataire_id
      ${where}
      ORDER BY cr.periode_annee DESC, cr.date_facture DESC NULLS LAST, cr.id DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('getAllChargesReelles error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─── POST /api/charges-reelles ────────────────────────────────────────────────
export const createChargeReelle = async (req: AuthRequest, res: Response) => {
  const {
    sci_id, immeuble_id, lot_id, bail_id,
    periode_annee, periode_mois,
    type_charge, libelle,
    montant_ht, tva_taux, montant_ttc,
    date_facture, reference, notes, source, pennylane_id,
  } = req.body;

  if (!periode_annee || !libelle || montant_ttc == null) {
    return res.status(400).json({ error: 'Champs requis : periode_annee, libelle, montant_ttc' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO charges_reelles
        (sci_id, immeuble_id, lot_id, bail_id, periode_annee, periode_mois,
         type_charge, libelle, montant_ht, tva_taux, montant_ttc,
         date_facture, reference, notes, source, pennylane_id, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      sci_id ?? null, immeuble_id ?? null, lot_id ?? null, bail_id ?? null,
      periode_annee, periode_mois ?? null,
      type_charge ?? 'autre', libelle,
      montant_ht ?? 0, tva_taux ?? 0, montant_ttc,
      date_facture || null, reference || null, notes || null,
      source ?? 'manuel', pennylane_id ?? null,
      req.user!.id,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Transaction Pennylane déjà importée' });
    console.error('createChargeReelle error:', err);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
};

// ─── PUT /api/charges-reelles/:id ────────────────────────────────────────────
export const updateChargeReelle = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    sci_id, immeuble_id, lot_id, bail_id,
    periode_annee, periode_mois, type_charge, libelle,
    montant_ht, tva_taux, montant_ttc,
    date_facture, reference, notes,
  } = req.body;

  try {
    const result = await pool.query(`
      UPDATE charges_reelles SET
        sci_id        = COALESCE($1,  sci_id),
        immeuble_id   = COALESCE($2,  immeuble_id),
        lot_id        = $3,
        bail_id       = $4,
        periode_annee = COALESCE($5,  periode_annee),
        periode_mois  = $6,
        type_charge   = COALESCE($7,  type_charge),
        libelle       = COALESCE($8,  libelle),
        montant_ht    = COALESCE($9,  montant_ht),
        tva_taux      = COALESCE($10, tva_taux),
        montant_ttc   = COALESCE($11, montant_ttc),
        date_facture  = $12,
        reference     = $13,
        notes         = $14,
        updated_at    = NOW()
      WHERE id = $15
      RETURNING *
    `, [
      sci_id, immeuble_id, lot_id ?? null, bail_id ?? null,
      periode_annee, periode_mois ?? null, type_charge, libelle,
      montant_ht, tva_taux, montant_ttc,
      date_facture ?? null, reference ?? null, notes ?? null,
      id,
    ]);
    if (!result.rows.length) return res.status(404).json({ error: 'Charge introuvable' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('updateChargeReelle error:', err);
    res.status(500).json({ error: 'Erreur mise à jour' });
  }
};

// ─── DELETE /api/charges-reelles/:id ─────────────────────────────────────────
export const deleteChargeReelle = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM charges_reelles WHERE id=$1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Charge introuvable' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('deleteChargeReelle error:', err);
    res.status(500).json({ error: 'Erreur suppression' });
  }
};

// ─── POST /api/charges-reelles/import-batch ───────────────────────────────────
export const importBatchCharges = async (req: AuthRequest, res: Response) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Liste items requise' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let imported = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        await client.query(`
          INSERT INTO charges_reelles
            (sci_id, immeuble_id, lot_id, bail_id, periode_annee, periode_mois,
             type_charge, libelle, montant_ht, tva_taux, montant_ttc,
             date_facture, reference, source, pennylane_id, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          ON CONFLICT (pennylane_id) DO NOTHING
        `, [
          item.sci_id ?? null, item.immeuble_id ?? null, item.lot_id ?? null, item.bail_id ?? null,
          item.periode_annee, item.periode_mois ?? null,
          item.type_charge ?? 'autre', item.libelle,
          item.montant_ht ?? 0, item.tva_taux ?? 0, item.montant_ttc,
          item.date_facture ?? null, item.reference ?? null,
          'pennylane', item.pennylane_id ?? null,
          req.user!.id,
        ]);
        imported++;
      } catch (e: any) {
        errors.push(`${item.libelle}: ${e.message}`);
      }
    }

    await client.query('COMMIT');
    res.json({ imported, errors });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('importBatchCharges error:', err);
    res.status(500).json({ error: 'Erreur import' });
  } finally {
    client.release();
  }
};

// ─── GET /api/charges-reelles/regularisation ─────────────────────────────────
// Calcule pour chaque bail actif sur l'année : provisions vs charges réelles
export const getRegularisation = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);
    if (sciIds !== null && sciIds.length === 0) return res.json({ lignes: [], kpis: {} });

    const annee      = req.query.annee      ? parseInt(String(req.query.annee))      : new Date().getFullYear();
    const immeuble_id = req.query.immeuble_id ? parseInt(String(req.query.immeuble_id)) : null;

    const params: any[] = [annee];
    let sciFilter   = '';
    let immFilter   = '';

    if (sciIds) {
      const ph = sciIds.map((_, i) => `$${params.push(sciIds[i])}`).join(',');
      sciFilter = `AND im.id IN (SELECT immeuble_id FROM sci_immeuble WHERE sci_id IN (${ph}))`;
    }
    if (immeuble_id) immFilter = `AND im.id = $${params.push(immeuble_id)}`;

    // 1. Baux actifs ou terminés dans l'année (pour couvrir les baux interrompus)
    const bauxResult = await pool.query(`
      SELECT
        b.id         AS bail_id,
        b.code       AS bail_code,
        b.charges_ht,
        b.start_date,
        b.end_date,
        b.status,
        lo.id        AS lot_id,
        lo.code      AS lot_code,
        lo.name      AS lot_name,
        lo.surface,
        im.id        AS immeuble_id,
        im.name      AS immeuble_name,
        CASE WHEN loc.type = 'entreprise' THEN loc.company_name
             ELSE CONCAT(loc.first_name, ' ', loc.last_name) END AS locataire_nom,
        loc.email    AS locataire_email,
        -- Nb mois actif dans l'année
        GREATEST(0, LEAST(12,
          (EXTRACT(MONTH FROM LEAST(
            COALESCE(b.end_date, ($1::int || '-12-31')::date),
            ($1::int || '-12-31')::date
          )) -
          EXTRACT(MONTH FROM GREATEST(
            b.start_date,
            ($1::int || '-01-01')::date
          )) + 1)
        ))::int AS nb_mois_actif
      FROM baux b
      JOIN lots       lo  ON lo.id  = b.lot_id
      JOIN immeubles  im  ON im.id  = lo.immeuble_id
      JOIN locataires loc ON loc.id = b.locataire_id
      WHERE (b.status = 'actif'
         OR (b.status = 'terminé' AND EXTRACT(YEAR FROM b.end_date) >= $1))
        AND EXTRACT(YEAR FROM b.start_date) <= $1
        ${sciFilter} ${immFilter}
      ORDER BY im.name, lo.code
    `, params);

    const baux = bauxResult.rows;
    if (!baux.length) return res.json({ lignes: [], kpis: { total_provisions: 0, total_charges: 0, total_solde: 0 } });

    // 2. Charges réelles de l'année, groupées par (immeuble + lot + bail)
    const bailIds     = baux.map(b => b.bail_id);
    const immeubleIds = [...new Set(baux.map(b => b.immeuble_id))];
    const lotIds      = [...new Set(baux.map(b => b.lot_id))];

    const chargesResult = await pool.query(`
      SELECT
        COALESCE(bail_id, -1)     AS bail_id,
        COALESCE(lot_id, -1)      AS lot_id,
        COALESCE(immeuble_id, -1) AS immeuble_id,
        SUM(montant_ht)           AS total_ht
      FROM charges_reelles
      WHERE periode_annee = $1
        AND (
          bail_id     = ANY($2::int[])
          OR lot_id   = ANY($3::int[])
          OR immeuble_id = ANY($4::int[])
        )
      GROUP BY bail_id, lot_id, immeuble_id
    `, [annee, bailIds, lotIds, immeubleIds]);

    // 3. Pour les charges au niveau immeuble : répartition au prorata des surfaces
    // Construire une map immeuble → total surface occupée
    const surfaceByImm = new Map<number, number>();
    const bailsByImm   = new Map<number, typeof baux>();
    for (const b of baux) {
      const surf = parseFloat(b.surface) || 1;
      surfaceByImm.set(b.immeuble_id, (surfaceByImm.get(b.immeuble_id) || 0) + surf);
      if (!bailsByImm.has(b.immeuble_id)) bailsByImm.set(b.immeuble_id, []);
      bailsByImm.get(b.immeuble_id)!.push(b);
    }

    // Répartir les charges par bail
    const chargesParBail = new Map<number, number>();
    for (const cr of chargesResult.rows) {
      const total = parseFloat(cr.total_ht) || 0;
      if (cr.bail_id > 0) {
        // Charge directement sur un bail
        chargesParBail.set(cr.bail_id, (chargesParBail.get(cr.bail_id) || 0) + total);
      } else if (cr.lot_id > 0) {
        // Charge sur un lot → bail du lot
        const bail = baux.find(b => b.lot_id === cr.lot_id);
        if (bail) chargesParBail.set(bail.bail_id, (chargesParBail.get(bail.bail_id) || 0) + total);
      } else if (cr.immeuble_id > 0) {
        // Charge sur un immeuble → répartir au prorata surfaces
        const totalSurf = surfaceByImm.get(cr.immeuble_id) || 1;
        const bailsImm  = bailsByImm.get(cr.immeuble_id) || [];
        for (const b of bailsImm) {
          const surf  = parseFloat(b.surface) || 1;
          const share = (surf / totalSurf) * total;
          chargesParBail.set(b.bail_id, (chargesParBail.get(b.bail_id) || 0) + share);
        }
      }
    }

    // 4. Construire les lignes de régularisation
    const lignes = baux.map(b => {
      const charges_ht      = parseFloat(b.charges_ht) || 0;
      const nb_mois         = b.nb_mois_actif || 0;
      const provisions      = charges_ht * nb_mois;
      const charges_reelles = chargesParBail.get(b.bail_id) || 0;
      const solde           = charges_reelles - provisions; // + = à payer, - = à rembourser

      return {
        bail_id:          b.bail_id,
        bail_code:        b.bail_code,
        lot_code:         b.lot_code,
        lot_name:         b.lot_name,
        immeuble_id:      b.immeuble_id,
        immeuble_name:    b.immeuble_name,
        locataire_nom:    b.locataire_nom,
        locataire_email:  b.locataire_email,
        charges_ht_mensuel: charges_ht,
        nb_mois,
        provisions:       Math.round(provisions * 100) / 100,
        charges_reelles:  Math.round(charges_reelles * 100) / 100,
        solde:            Math.round(solde * 100) / 100,
        type: solde > 0.01 ? 'complement' : solde < -0.01 ? 'remboursement' : 'equilibre',
      };
    });

    const total_provisions = lignes.reduce((s, l) => s + l.provisions, 0);
    const total_charges    = lignes.reduce((s, l) => s + l.charges_reelles, 0);
    const total_solde      = lignes.reduce((s, l) => s + l.solde, 0);

    res.json({
      annee,
      lignes,
      kpis: {
        total_provisions:   Math.round(total_provisions * 100) / 100,
        total_charges:      Math.round(total_charges * 100) / 100,
        total_solde:        Math.round(total_solde * 100) / 100,
        nb_complements:     lignes.filter(l => l.type === 'complement').length,
        nb_remboursements:  lignes.filter(l => l.type === 'remboursement').length,
        nb_equilibres:      lignes.filter(l => l.type === 'equilibre').length,
      },
    });
  } catch (err) {
    console.error('getRegularisation error:', err);
    res.status(500).json({ error: 'Erreur calcul régularisation' });
  }
};

export { TYPES_CHARGE };
