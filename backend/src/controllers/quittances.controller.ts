import { Response } from 'express';
import PDFDocument from 'pdfkit';
import pool from '../config/database';
import { AuthRequest, resolveRequestSciIds } from '../middleware/auth.middleware';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOIS_FR = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function buildNumero(typDoc: string, id: number, mois: number, annee: number): string {
  const prefix = typDoc === 'facture' ? 'F' : typDoc === 'quittance' ? 'Q' : 'A';
  return `${prefix}${annee}${String(mois).padStart(2, '0')}-${String(id).padStart(5, '0')}`;
}

function detectTypeDocument(typeBail: string, tvaApplicable: boolean): string {
  if (typeBail === 'habitation') return 'quittance';
  if (tvaApplicable) return 'facture';
  return 'appel_loyer';
}

function calcMontants(bail: any, jours?: number, totalJours?: number) {
  let loyerHT = parseFloat(bail.loyer_ht);
  let chargesHT = parseFloat(bail.charges_ht) || 0;

  if (jours && totalJours && jours < totalJours) {
    loyerHT   = parseFloat((loyerHT   * jours / totalJours).toFixed(2));
    chargesHT = parseFloat((chargesHT * jours / totalJours).toFixed(2));
  }

  const tvaRate = bail.tva_applicable ? parseFloat(bail.tva_rate) / 100 : 0;
  const tvaLoyer   = parseFloat((loyerHT * tvaRate).toFixed(2));
  const tvaCharges = bail.tva_on_charges ? parseFloat((chargesHT * tvaRate).toFixed(2)) : 0;
  const totalTTC   = parseFloat((loyerHT + chargesHT + tvaLoyer + tvaCharges).toFixed(2));

  return { loyerHT, chargesHT, tvaLoyer, tvaCharges, totalTTC, tvaRate };
}

function joursInMonth(mois: number, annee: number): number {
  return new Date(annee, mois, 0).getDate();
}

/** Construit une date YYYY-MM-DD SANS conversion UTC (évite le décalage timezone) */
function dateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Convertit une date PostgreSQL (objet Date ou string) en YYYY-MM-DD local */
function toLocalDateStr(pgDate: any): string {
  if (!pgDate) return '';
  const d = pgDate instanceof Date ? pgDate : new Date(pgDate);
  return dateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// ─── Requête de base (avec toutes les jointures) ──────────────────────────────
const BASE_QUERY = `
  SELECT q.*,
         b.code as bail_code, b.type_bail, b.tva_applicable, b.tva_rate, b.tva_on_charges,
         b.loyer_ht as bail_loyer_ht, b.charges_ht as bail_charges_ht,
         b.quittancement_frequency,
         lot.code as lot_code, lot.name as lot_name, lot.surface,
         lot.floor, lot.description as lot_description,
         i.code as immeuble_code, i.name as immeuble_name,
         i.address as immeuble_address, i.city as immeuble_city,
         i.postal_code as immeuble_postal_code,
         loc.code as locataire_code, loc.type as locataire_type,
         loc.company_name, loc.first_name, loc.last_name,
         loc.email as locataire_email,
         loc.siret as locataire_siret,
         loc.address as locataire_address, loc.city as locataire_city,
         loc.postal_code as locataire_postal_code,
         loc.tva_number as locataire_tva_number
  FROM quittances q
  JOIN baux b ON q.bail_id = b.id
  JOIN lots lot ON b.lot_id = lot.id
  JOIN immeubles i ON lot.immeuble_id = i.id
  JOIN locataires loc ON b.locataire_id = loc.id
`;

// ─── Controllers ──────────────────────────────────────────────────────────────

export const getAllQuittances = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);
    if (sciIds !== null && sciIds.length === 0) return res.json([]);

    const { mois, annee, bail_id, status, type_document } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (sciIds !== null) {
      const ph = sciIds.map(() => `$${i++}`).join(',');
      conditions.push(`lot.immeuble_id IN (SELECT immeuble_id FROM sci_immeuble WHERE sci_id IN (${ph}))`);
      params.push(...sciIds);
    }
    if (mois && annee) {
      const m2 = parseInt(mois as string);
      const y2 = parseInt(annee as string);
      const start = dateStr(y2, m2, 1);
      const end   = dateStr(y2, m2, joursInMonth(m2, y2));
      conditions.push(`q.period_start >= $${i++}::date AND q.period_start <= $${i++}::date`);
      params.push(start, end);
    } else if (annee) {
      conditions.push(`EXTRACT(YEAR FROM q.period_start) = $${i++}`); params.push(annee);
    }
    if (bail_id) { conditions.push(`q.bail_id = $${i++}`); params.push(bail_id); }
    if (status) { conditions.push(`q.status = $${i++}`); params.push(status); }
    if (type_document) { conditions.push(`q.type_document = $${i++}`); params.push(type_document); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `${BASE_QUERY} ${where} ORDER BY q.period_start DESC, b.code`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('getAllQuittances error:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getQuittanceById = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`${BASE_QUERY} WHERE q.id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quittance introuvable' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('getQuittanceById error:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const generateQuittances = async (req: AuthRequest, res: Response) => {
  try {
    const { mois, annee, bail_ids } = req.body;

    if (!mois || !annee) return res.status(400).json({ error: 'mois et annee sont requis' });

    const m = parseInt(mois);
    const y = parseInt(annee);
    // ⚠ On construit les dates directement en YYYY-MM-DD pour éviter tout décalage UTC
    const periodStart = dateStr(y, m, 1);
    const periodEnd   = dateStr(y, m, joursInMonth(m, y));
    const dueDate     = dateStr(y, m, 5); // J+5 du mois

    // Récupérer les baux actifs (ou filtrés)
    let bauxQuery = `
      SELECT b.*, loc.email as locataire_email
      FROM baux b
      JOIN locataires loc ON b.locataire_id = loc.id
      WHERE b.status = 'actif'
        AND b.start_date <= $1
        AND (b.end_date IS NULL OR b.end_date >= $2)
    `;
    const bauxParams: any[] = [periodEnd, periodStart];

    if (bail_ids && Array.isArray(bail_ids) && bail_ids.length > 0) {
      bauxQuery += ` AND b.id = ANY($3)`;
      bauxParams.push(bail_ids);
    }

    const bauxResult = await pool.query(bauxQuery, bauxParams);
    const created: any[] = [];
    const skipped: any[] = [];

    for (const bail of bauxResult.rows) {
      // Vérifier si déjà généré
      const exists = await pool.query(
        `SELECT id FROM quittances WHERE bail_id = $1 AND period_start = $2 AND status != 'annule'`,
        [bail.id, periodStart]
      );
      if (exists.rows.length > 0) {
        skipped.push({ bail_id: bail.id, reason: 'déjà générée' });
        continue;
      }

      // Calculer prorata si démarrage en cours de mois
      const totalJours = joursInMonth(m, y);
      let jours = totalJours;
      let isProrata = false;

      // Convertir start_date en YYYY-MM-DD local (même format que periodStart/periodEnd)
      const startDateStr = toLocalDateStr(bail.start_date);
      if (startDateStr > periodStart && startDateStr <= periodEnd) {
        const startDay = parseInt(startDateStr.split('-')[2], 10);
        jours = totalJours - startDay + 1;
        isProrata = true;
      }

      const { loyerHT, chargesHT, tvaLoyer, tvaCharges, totalTTC } = calcMontants(bail, jours, totalJours);
      const typeDoc = detectTypeDocument(bail.type_bail, bail.tva_applicable);

      // Générer un code de référence temporaire (mis à jour après INSERT avec l'id réel)
      const q = await pool.query(
        `INSERT INTO quittances (
          bail_id, code, type_document,
          period_start, period_end, due_date, emission_date,
          loyer_ht, charges_ht, tva_loyer, tva_charges,
          tva_rate, tva_on_charges, tva_amount, total_ttc,
          is_prorata, prorata_jours, prorata_total,
          status, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'emis',$18)
        RETURNING id`,
        [
          bail.id, 'TEMP', typeDoc,
          periodStart, periodEnd, dueDate,
          loyerHT, chargesHT, tvaLoyer, tvaCharges,
          parseFloat(bail.tva_rate) || 0, bail.tva_on_charges || false,
          tvaLoyer + tvaCharges, totalTTC,
          isProrata, jours, totalJours,
          req.user!.id
        ]
      );

      const newId = q.rows[0].id;
      const numero = buildNumero(typeDoc, newId, m, y);
      await pool.query(`UPDATE quittances SET code = $1 WHERE id = $2`, [numero, newId]);

      created.push({ id: newId, bail_id: bail.id, numero, type_document: typeDoc, total_ttc: totalTTC });
    }

    res.status(201).json({
      created_count: created.length,
      skipped_count: skipped.length,
      created,
      skipped,
    });
  } catch (error) {
    console.error('generateQuittances error:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const markPaid = async (req: AuthRequest, res: Response) => {
  try {
    const { date_paiement } = req.body;
    const result = await pool.query(
      `UPDATE quittances
       SET status = 'paye', sent_date = COALESCE($1::date, CURRENT_DATE), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [date_paiement || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quittance introuvable' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('markPaid error:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const cancelQuittance = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE quittances SET status = 'annule', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quittance introuvable' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('cancelQuittance error:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

// ─── Génération PDF ───────────────────────────────────────────────────────────

export const getPDF = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`${BASE_QUERY} WHERE q.id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quittance introuvable' });

    const q = result.rows[0];
    const periodDate = new Date(q.period_start);
    const mois = periodDate.getMonth() + 1;
    const annee = periodDate.getFullYear();

    const locataireName = q.locataire_type === 'entreprise'
      ? q.company_name
      : `${q.first_name} ${q.last_name}`;

    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${q.code}.pdf"`);
    doc.pipe(res);

    // ── Palette ──
    const GOLD    = '#AF9500';
    const BLACK   = '#1a1a1a';
    const GRAY    = '#6b7280';
    const LIGHT   = '#f8fafc';
    const BORDER  = '#e2e8f0';

    // ── En-tête bailleur (on utilise le nom de l'immeuble comme identifiant) ──
    doc.rect(50, 50, 495, 70).fill(BLACK);
    doc.fill('white').fontSize(16).font('Helvetica-Bold')
       .text(q.immeuble_name || 'Bailleur', 65, 65);
    doc.fontSize(9).fill('rgba(255,255,255,0.7)')
       .text([q.immeuble_address, q.immeuble_postal_code, q.immeuble_city].filter(Boolean).join(' '), 65, 85);

    // Numéro & date + marque AKILI PROPERTY dans l'en-tête
    doc.fill('white').fontSize(10).font('Helvetica-Bold')
       .text(q.code, 400, 65, { width: 130, align: 'right' });
    doc.fontSize(8).font('Helvetica').fill('rgba(255,255,255,0.7)')
       .text(`Émis le ${new Date(q.emission_date).toLocaleDateString('fr-FR')}`, 400, 82, { width: 130, align: 'right' });
    doc.fontSize(7).font('Helvetica-Bold').fill(GOLD)
       .text('AKILI PROPERTY', 400, 98, { width: 130, align: 'right' });

    // ── Titre document ──
    const titreMap: Record<string, string> = {
      quittance:   'QUITTANCE DE LOYER',
      appel_loyer: 'APPEL DE LOYER',
      facture:     'FACTURE DE LOYER',
    };
    const titre = titreMap[q.type_document] || 'DOCUMENT DE LOYER';
    doc.moveDown(0.5);
    doc.rect(50, 135, 495, 30).fill(GOLD);
    doc.fill('white').fontSize(13).font('Helvetica-Bold')
       .text(`${titre} — ${MOIS_FR[mois]} ${annee}`, 50, 143, { align: 'center', width: 495 });

    // ── Infos locataire ──
    doc.rect(50, 180, 230, 80).fill(LIGHT).stroke(BORDER);
    doc.fill(GRAY).fontSize(8).font('Helvetica-Bold').text('LOCATAIRE', 60, 190);
    doc.fill(BLACK).fontSize(10).font('Helvetica-Bold').text(locataireName, 60, 205);
    if (q.locataire_siret) {
      doc.fill(GRAY).fontSize(8).font('Helvetica').text(`SIRET : ${q.locataire_siret}`, 60, 220);
    }
    const locAddr = [q.locataire_address, q.locataire_postal_code, q.locataire_city].filter(Boolean).join(' ');
    if (locAddr) doc.fill(GRAY).fontSize(8).text(locAddr, 60, 232);

    // ── Infos bien ──
    doc.rect(315, 180, 230, 80).fill(LIGHT).stroke(BORDER);
    doc.fill(GRAY).fontSize(8).font('Helvetica-Bold').text('BIEN LOUÉ', 325, 190);
    doc.fill(BLACK).fontSize(10).font('Helvetica-Bold')
       .text(`${q.immeuble_name}`, 325, 205);
    doc.fill(GRAY).fontSize(8).font('Helvetica')
       .text(`Lot ${q.lot_code}${q.surface ? ` — ${q.surface} m²` : ''}`, 325, 220);
    const bienAddr = [q.immeuble_address, q.immeuble_postal_code, q.immeuble_city].filter(Boolean).join(' ');
    if (bienAddr) doc.text(bienAddr, 325, 232);

    // ── Période & échéance ──
    doc.rect(50, 275, 495, 28).fill('#fafafa').stroke(BORDER);
    doc.fill(BLACK).fontSize(9).font('Helvetica')
       .text(`Période : du ${new Date(q.period_start).toLocaleDateString('fr-FR')} au ${new Date(q.period_end).toLocaleDateString('fr-FR')}`, 60, 284);
    doc.text(`Échéance : ${new Date(q.due_date).toLocaleDateString('fr-FR')}`, 350, 284);

    if (q.is_prorata) {
      doc.fill(GOLD).fontSize(8)
         .text(`⚠ Prorata temporis : ${q.prorata_jours}/${q.prorata_total} jours`, 60, 307);
    }

    // ── Tableau des montants ──
    const tableTop = q.is_prorata ? 325 : 315;
    const colW = [250, 80, 80, 85];
    const colX = [50, 300, 380, 460];

    // En-tête tableau
    doc.rect(50, tableTop, 495, 20).fill(BLACK);
    doc.fill('white').fontSize(9).font('Helvetica-Bold');
    ['Désignation', 'HT', 'TVA', 'TTC'].forEach((h, i) => {
      doc.text(h, colX[i], tableTop + 5, { width: colW[i], align: i === 0 ? 'left' : 'right' });
    });

    // Lignes
    const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
    const tvaRate = parseFloat(q.tva_rate) || 0;

    const rows: [string, number, number, number][] = [
      [`Loyer ${MOIS_FR[mois]} ${annee}`, parseFloat(q.loyer_ht), parseFloat(q.tva_loyer), parseFloat(q.loyer_ht) + parseFloat(q.tva_loyer)],
    ];
    if (parseFloat(q.charges_ht) > 0) {
      rows.push([`Charges ${MOIS_FR[mois]} ${annee}`, parseFloat(q.charges_ht), parseFloat(q.tva_charges), parseFloat(q.charges_ht) + parseFloat(q.tva_charges)]);
    }

    rows.forEach(([label, ht, tva, ttc], idx) => {
      const rowY = tableTop + 20 + idx * 22;
      if (idx % 2 === 0) doc.rect(50, rowY, 495, 22).fill(LIGHT);
      doc.fill(BLACK).fontSize(9).font('Helvetica');
      doc.text(label, colX[0], rowY + 6, { width: colW[0] });
      doc.text(fmt(ht),  colX[1], rowY + 6, { width: colW[1], align: 'right' });
      doc.text(fmt(tva), colX[2], rowY + 6, { width: colW[2], align: 'right' });
      doc.text(fmt(ttc), colX[3], rowY + 6, { width: colW[3], align: 'right' });
    });

    // Total
    const totalY = tableTop + 20 + rows.length * 22;
    doc.rect(50, totalY, 495, 26).fill(GOLD);
    doc.fill('white').fontSize(11).font('Helvetica-Bold')
       .text('TOTAL À PAYER', colX[0], totalY + 7)
       .text(fmt(parseFloat(q.total_ttc)), colX[3], totalY + 7, { width: colW[3], align: 'right' });

    // ── Mentions légales ──
    const mentionY = totalY + 50;
    doc.fill(GRAY).fontSize(7.5).font('Helvetica');

    if (q.type_document === 'facture') {
      if (tvaRate === 0) {
        doc.text('TVA non applicable — art. 261 D du CGI', 50, mentionY);
      } else {
        const tvaIntra = q.locataire_tva_number ? `N° TVA client : ${q.locataire_tva_number}` : '';
        doc.text(`TVA ${tvaRate}% incluse. ${tvaIntra}`, 50, mentionY);
        doc.text('Tout retard de paiement entraîne des pénalités égales à 3 fois le taux d\'intérêt légal (art. L.441-6 C.com).', 50, mentionY + 12);
        doc.text('Indemnité forfaitaire de recouvrement en cas de retard : 40 €.', 50, mentionY + 22);
      }
    } else if (q.type_document === 'quittance') {
      doc.text('Quittance de loyer délivrée conformément à l\'article 21 de la loi n° 89-462 du 6 juillet 1989.', 50, mentionY);
      doc.text('Le bailleur atteste avoir reçu le règlement intégral des sommes indiquées ci-dessus.', 50, mentionY + 12);
    } else {
      doc.text('Appel de loyer. TVA non applicable — exonération art. 261 D du CGI.', 50, mentionY);
    }

    // ── Pied de page ──
    doc.rect(50, 760, 495, 1).fill(BORDER);
    doc.fill(GOLD).fontSize(7).font('Helvetica-Bold')
       .text('AKILI PROPERTY', 50, 768, { width: 495, align: 'center' });
    doc.fill(GRAY).fontSize(6.5).font('Helvetica')
       .text(`${q.immeuble_name} — ${q.code} — Généré le ${new Date().toLocaleDateString('fr-FR')}`, 50, 778, { align: 'center', width: 495 });

    doc.end();
  } catch (error) {
    console.error('getPDF error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur génération PDF' });
  }
};
