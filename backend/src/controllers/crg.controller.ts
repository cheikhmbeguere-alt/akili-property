import { Response } from 'express';
import ExcelJS from 'exceljs';
import pool from '../config/database';
import { AuthRequest, resolveRequestSciIds } from '../middleware/auth.middleware';

const MOIS_FR = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

type CRGMode = 'mois' | 'borne' | 'annee' | 'date';

// ─── Calcul des bornes de période ────────────────────────────────────────────

function getPeriodBounds(mode: CRGMode, annee: number, mois?: number, date_debut?: string, date_fin?: string) {
  switch (mode) {
    case 'mois': {
      const m = mois!;
      const start = `${annee}-${String(m).padStart(2, '0')}-01`;
      const end   = new Date(annee, m, 0).toISOString().split('T')[0];
      return { start, end, nbMois: 1, label: `${MOIS_FR[m]} ${annee}` };
    }
    case 'borne': {
      const d1 = new Date(date_debut!);
      const d2 = new Date(date_fin!);
      const formated_date_debut = d1.toLocaleDateString('fr-FR');
      const formated_date_fin   = d2.toLocaleDateString('fr-FR');
      const nbMois = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30)));
      return { start: date_debut!, end: date_fin!, nbMois, label: `Du ${formated_date_debut} au ${formated_date_fin}` };
    }
    case 'annee':
      return { start: `${annee}-01-01`, end: `${annee}-12-31`, nbMois: 12, label: `Année ${annee}` };
    default:
      return { start: '', end: '', nbMois: 0, label: '' };
  }
}

// ─── Requête commune ─────────────────────────────────────────────────────────

async function fetchCRGData(
  mode: CRGMode,
  annee: number,
  mois: number,
  date_ref: string,
  immeuble_id?: number,
  authorizedSciIds?: number[] | null,
  date_debut?: string,
  date_fin?: string,
) {
  let bauxRows: any[];

  // Filtre SCI partagé : restreint aux immeubles des SCI autorisées
  const buildSciFilter = (startIdx: number, params: any[]): string => {
    if (!authorizedSciIds || authorizedSciIds.length === 0) return '';
    const ph = authorizedSciIds.map((_, i) => `$${startIdx + i}`).join(',');
    params.push(...authorizedSciIds);
    return `AND im.id IN (SELECT immeuble_id FROM sci_immeuble WHERE sci_id IN (${ph}))`;
  };

  // ── Mode "À date" : cumul depuis le début du bail ─────────────────────────
  if (mode === 'date') {
    const p: any[] = [date_ref];
    const immFilter = immeuble_id ? `AND im.id = $${p.push(immeuble_id)}` : '';
    const sciFilter = buildSciFilter(p.length + 1, p);

    const r = await pool.query(`
      WITH mois_calc AS (
        SELECT id,
          GREATEST(1,
            (EXTRACT(YEAR  FROM $1::date) - EXTRACT(YEAR  FROM start_date)) * 12
            + (EXTRACT(MONTH FROM $1::date) - EXTRACT(MONTH FROM start_date))
            + 1
          ) AS nb_mois
        FROM baux
        WHERE status = 'actif' AND start_date <= $1::date
      )
      SELECT
        im.id               AS immeuble_id,
        im.name             AS immeuble_name,
        lo.id               AS lot_id,
        lo.code             AS lot_code,
        lo.name             AS lot_name,
        lo.type             AS lot_type,
        lo.surface,
        b.id                AS bail_id,
        b.code              AS bail_code,
        b.start_date,
        b.loyer_ht,
        b.charges_ht,
        (b.loyer_ht + b.charges_ht)                           AS loyer_mensuel,
        mc.nb_mois,
        (b.loyer_ht + b.charges_ht) * mc.nb_mois             AS loyer_attendu,
        COALESCE(enc.total_paye, 0)                           AS encaisse_periode,
        COALESCE(enc.nb_enc, 0)                               AS nb_encaissements,
        (b.loyer_ht + b.charges_ht) * mc.nb_mois
          - COALESCE(enc.total_paye, 0)                       AS solde_periode,
        CASE WHEN loc.type = 'entreprise' THEN loc.company_name
             ELSE CONCAT(loc.first_name, ' ', loc.last_name) END AS locataire_nom,
        loc.type            AS locataire_type,
        loc.email           AS locataire_email
      FROM baux b
      JOIN mois_calc mc   ON mc.id = b.id
      JOIN lots lo        ON b.lot_id = lo.id
      JOIN immeubles im   ON lo.immeuble_id = im.id
      JOIN locataires loc ON b.locataire_id = loc.id
      LEFT JOIN (
        SELECT bail_id, SUM(amount) AS total_paye, COUNT(*) AS nb_enc
        FROM encaissements
        WHERE payment_date <= $1::date
        GROUP BY bail_id
      ) enc ON enc.bail_id = b.id
      WHERE b.status = 'actif' AND b.start_date <= $1::date ${immFilter} ${sciFilter}
      ORDER BY im.name, lo.code
    `, p);
    bauxRows = r.rows;

  // ── Modes période (mois / borne / annee) ──────────────────────────────────
  } else {
    const { start, end, nbMois } = getPeriodBounds(mode, annee, mois, date_debut, date_fin);
    const p: any[] = [start, end];
    const immFilter = immeuble_id ? `AND im.id = $${p.push(immeuble_id)}` : '';
    const sciFilter = buildSciFilter(p.length + 1, p);

    const r = await pool.query(`
      SELECT
        im.id               AS immeuble_id,
        im.name             AS immeuble_name,
        lo.id               AS lot_id,
        lo.code             AS lot_code,
        lo.name             AS lot_name,
        lo.type             AS lot_type,
        lo.surface,
        b.id                AS bail_id,
        b.code              AS bail_code,
        b.start_date,
        b.loyer_ht,
        b.charges_ht,
        (b.loyer_ht + b.charges_ht)                   AS loyer_mensuel,
        NULL::int                                       AS nb_mois,
        (b.loyer_ht + b.charges_ht) * ${nbMois}       AS loyer_attendu,
        COALESCE(enc.total_enc, 0)                     AS encaisse_periode,
        COALESCE(enc.nb_enc, 0)                        AS nb_encaissements,
        (b.loyer_ht + b.charges_ht) * ${nbMois}
          - COALESCE(enc.total_enc, 0)                 AS solde_periode,
        CASE WHEN loc.type = 'entreprise' THEN loc.company_name
             ELSE CONCAT(loc.first_name, ' ', loc.last_name) END AS locataire_nom,
        loc.type            AS locataire_type,
        loc.email           AS locataire_email
      FROM baux b
      JOIN lots lo        ON b.lot_id = lo.id
      JOIN immeubles im   ON lo.immeuble_id = im.id
      JOIN locataires loc ON b.locataire_id = loc.id
      LEFT JOIN (
        SELECT bail_id, SUM(amount) AS total_enc, COUNT(*) AS nb_enc
        FROM encaissements
        WHERE payment_date BETWEEN $1::date AND $2::date
        GROUP BY bail_id
      ) enc ON enc.bail_id = b.id
      WHERE b.status = 'actif' ${immFilter} ${sciFilter}
      ORDER BY im.name, lo.code
    `, p);
    bauxRows = r.rows;
  }

  // ── Lots vacants ──────────────────────────────────────────────────────────
  const vp: any[] = [];
  const vf = immeuble_id ? `AND im.id = $${vp.push(immeuble_id)}` : '';
  const vSciFilter = buildSciFilter(vp.length + 1, vp);
  const vacantsResult = await pool.query(`
    SELECT lo.code AS lot_code, lo.name AS lot_name, lo.type AS lot_type,
           lo.surface, im.id AS immeuble_id, im.name AS immeuble_name
    FROM lots lo
    JOIN immeubles im ON lo.immeuble_id = im.id
    WHERE NOT EXISTS (SELECT 1 FROM baux b WHERE b.lot_id = lo.id AND b.status = 'actif') ${vf} ${vSciFilter}
    ORDER BY im.name, lo.code
  `, vp);

  const baux = bauxRows.map(r => ({
    ...r,
    loyer_mensuel:    parseFloat(r.loyer_mensuel),
    loyer_attendu:    parseFloat(r.loyer_attendu),
    loyer_ht:         parseFloat(r.loyer_ht),
    charges_ht:       parseFloat(r.charges_ht),
    encaisse_periode: parseFloat(r.encaisse_periode),
    solde_periode:    parseFloat(r.solde_periode),
    nb_encaissements: parseInt(r.nb_encaissements || 0),
    nb_mois:          r.nb_mois ? parseInt(r.nb_mois) : null,
  }));

  const total_attendu     = baux.reduce((s, r) => s + r.loyer_attendu, 0);
  const total_encaisse    = baux.reduce((s, r) => s + r.encaisse_periode, 0);
  const total_impayes     = baux.reduce((s, r) => s + Math.max(0, r.solde_periode), 0);
  const taux_recouvrement = total_attendu > 0 ? (total_encaisse / total_attendu) * 100 : 100;

  return {
    baux,
    lots_vacants: vacantsResult.rows,
    kpis: {
      total_attendu,
      total_encaisse,
      total_impayes,
      taux_recouvrement,
      nb_baux_actifs:  baux.length,
      nb_lots_vacants: vacantsResult.rows.length,
    },
  };
}

// ─── GET JSON ─────────────────────────────────────────────────────────────────

export const getCompteRenduGestion = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);
    if (sciIds !== null && sciIds.length === 0) {
      return res.json({ periode: { mode: 'mois', label: '' }, baux: [], lots_vacants: [], kpis: { total_attendu: 0, total_encaisse: 0, total_impayes: 0, taux_recouvrement: 100, nb_baux_actifs: 0, nb_lots_vacants: 0 } });
    }

    const mode       = (req.query.mode       as CRGMode) || 'mois';
    const annee      = req.query.annee       ? parseInt(String(req.query.annee))       : new Date().getFullYear();
    const mois       = req.query.mois        ? parseInt(String(req.query.mois))        : new Date().getMonth() + 1;
    const date_ref   = req.query.date_ref    ? String(req.query.date_ref)              : new Date().toISOString().split('T')[0];
    const date_debut = req.query.date_debut  ? String(req.query.date_debut)            : undefined;
    const date_fin   = req.query.date_fin    ? String(req.query.date_fin)              : undefined;
    const immeubleId = req.query.immeuble_id ? parseInt(String(req.query.immeuble_id)) : undefined;

    const data = await fetchCRGData(mode, annee, mois, date_ref, immeubleId, sciIds, date_debut, date_fin);

    const periodeLabel = mode === 'date'
      ? `À date du ${new Date(date_ref).toLocaleDateString('fr-FR')}`
      : mode === 'borne'
      ? getPeriodBounds(mode, annee, mois, date_debut, date_fin).label
      : getPeriodBounds(mode, annee, mois).label;

    res.json({ periode: { mode, label: periodeLabel }, ...data });
  } catch (error) {
    console.error('getCompteRenduGestion error:', error);
    res.status(500).json({ error: 'Erreur génération CRG' });
  }
};

// ─── Export Excel ─────────────────────────────────────────────────────────────

export const exportCRGExcel = async (req: AuthRequest, res: Response) => {
  try {
    const sciIds = await resolveRequestSciIds(req);
    if (sciIds !== null && sciIds.length === 0) {
      return res.status(403).json({ error: 'Aucune SCI autorisée' });
    }

    const mode       = (req.query.mode       as CRGMode) || 'mois';
    const annee      = req.query.annee       ? parseInt(String(req.query.annee))       : new Date().getFullYear();
    const mois       = req.query.mois        ? parseInt(String(req.query.mois))        : new Date().getMonth() + 1;
    const date_ref   = req.query.date_ref    ? String(req.query.date_ref)              : new Date().toISOString().split('T')[0];
    const date_debut = req.query.date_debut  ? String(req.query.date_debut)            : undefined;
    const date_fin   = req.query.date_fin    ? String(req.query.date_fin)              : undefined;
    const immeubleId = req.query.immeuble_id ? parseInt(String(req.query.immeuble_id)) : undefined;

    const { baux, lots_vacants, kpis } = await fetchCRGData(mode, annee, mois, date_ref, immeubleId, sciIds, date_debut, date_fin);

    const periodeLabel = mode === 'date'
      ? `À date du ${new Date(date_ref).toLocaleDateString('fr-FR')}`
      : mode === 'borne'
      ? getPeriodBounds(mode, annee, mois, date_debut, date_fin).label
      : getPeriodBounds(mode, annee, mois).label;

    const isDateMode = mode === 'date';

    // ── Colonnes (14 si mode date, sinon 13) ─────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AKILI PROPERTY';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Compte Rendu de Gestion', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    const nbCols = isDateMode ? 14 : 13;
    const lastCol = String.fromCharCode(64 + nbCols); // M ou N

    const colWidths = isDateMode
      ? [20, 10, 18, 12, 8, 22, 12,  8, 11, 12, 12, 13, 12, 12]
      : [20, 10, 18, 12, 8, 22, 12, 11, 12, 12, 12, 12, 12];
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const C_BLACK  = '0F172A';
    const C_GOLD   = 'AF9500';
    const C_HEADER = 'F8FAFC';
    const C_BORDER = 'E2E8F0';
    const fmtNum = (n: any) => n ? parseFloat(n) : 0;

    // Titre
    ws.mergeCells(`A1:${lastCol}1`);
    const titleCell = ws.getCell('A1');
    titleCell.value = `COMPTE RENDU DE GESTION — ${periodeLabel.toUpperCase()}`;
    titleCell.font  = { name: 'Calibri', bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C_BLACK } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    ws.mergeCells(`A2:${lastCol}2`);
    const subCell = ws.getCell('A2');
    subCell.value = `Généré le ${new Date().toLocaleDateString('fr-FR')} — AKILI PROPERTY`;
    subCell.font  = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6B7280' } };
    subCell.alignment = { horizontal: 'center' };
    ws.getRow(2).height = 18;

    // KPIs
    const kpiRow = ws.addRow([
      `Attendu : ${kpis.total_attendu.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`,
      '', '', '',
      `Encaissé : ${kpis.total_encaisse.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`,
      '', '', '',
      `Taux : ${kpis.taux_recouvrement.toFixed(1)} %`,
      '', '', '',
      `Impayés : ${kpis.total_impayes.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`,
    ]);
    kpiRow.height = 22;
    ws.mergeCells(`A${kpiRow.number}:D${kpiRow.number}`);
    ws.mergeCells(`E${kpiRow.number}:H${kpiRow.number}`);
    ws.mergeCells(`I${kpiRow.number}:L${kpiRow.number}`);
    kpiRow.getCell(1).font  = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF1E3A5F' } };
    kpiRow.getCell(5).font  = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF16A34A' } };
    kpiRow.getCell(9).font  = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF2563EB' } };
    kpiRow.getCell(13).font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFDC2626' } };
    kpiRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
      c.alignment = { vertical: 'middle' };
    });
    [1, 5, 9, 13].forEach(c => kpiRow.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' });

    ws.addRow([]);

    // En-têtes
    const headers = isDateMode
      ? ['Immeuble', 'Lot', 'Désignation', 'Type', 'Surf.', 'Locataire', 'N° Bail',
         'Mois', 'Loyer HT', 'Charges HT', 'Total dû', 'Encaissé', 'Solde', 'Statut']
      : ['Immeuble', 'Lot', 'Désignation', 'Type', 'Surf.', 'Locataire', 'N° Bail',
         'Loyer HT', 'Charges HT', 'Attendu', 'Encaissé', 'Solde', 'Statut'];

    const headerRow = ws.addRow(headers);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      cell.font   = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF' + C_BLACK } };
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C_HEADER } };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF' + C_GOLD } },
        top:    { style: 'thin',   color: { argb: 'FF' + C_BORDER } },
        left:   { style: 'thin',   color: { argb: 'FF' + C_BORDER } },
        right:  { style: 'thin',   color: { argb: 'FF' + C_BORDER } },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    // Données
    let lastImmeuble = '';
    for (const r of baux) {
      if (r.immeuble_name !== lastImmeuble) {
        if (lastImmeuble !== '') ws.addRow([]);
        const immRow = ws.addRow([`🏢  ${r.immeuble_name}`]);
        ws.mergeCells(`A${immRow.number}:${lastCol}${immRow.number}`);
        immRow.height = 18;
        immRow.getCell(1).font  = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF1E3A5F' } };
        immRow.getCell(1).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
        immRow.getCell(1).border = {
          top:    { style: 'medium', color: { argb: 'FF93C5FD' } },
          bottom: { style: 'thin',   color: { argb: 'FF93C5FD' } },
          left:   { style: 'thin',   color: { argb: 'FF93C5FD' } },
          right:  { style: 'thin',   color: { argb: 'FF93C5FD' } },
        };
        lastImmeuble = r.immeuble_name;
      }

      const isImpaye = r.solde_periode > 0.01;
      const bg       = isImpaye ? 'FFFFF5F5' : 'FFF0FDF4';

      const rowData = isDateMode
        ? ['', r.lot_code, r.lot_name || '', r.lot_type || '', fmtNum(r.surface),
           r.locataire_nom, r.bail_code, r.nb_mois || '',
           fmtNum(r.loyer_ht), fmtNum(r.charges_ht), fmtNum(r.loyer_attendu),
           fmtNum(r.encaisse_periode), fmtNum(r.solde_periode),
           isImpaye ? 'IMPAYÉ' : 'À jour']
        : ['', r.lot_code, r.lot_name || '', r.lot_type || '', fmtNum(r.surface),
           r.locataire_nom, r.bail_code,
           fmtNum(r.loyer_ht), fmtNum(r.charges_ht), fmtNum(r.loyer_attendu),
           fmtNum(r.encaisse_periode), fmtNum(r.solde_periode),
           isImpaye ? 'IMPAYÉ' : 'À jour'];

      const dataRow = ws.addRow(rowData);
      dataRow.height = 18;
      const moneyColsDate  = [9, 10, 11, 12, 13];
      const moneyColsPeriod = [8, 9, 10, 11, 12];
      const moneyCols = isDateMode ? moneyColsDate : moneyColsPeriod;

      dataRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 9 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FF' + C_BORDER } },
          left:   { style: 'thin', color: { argb: 'FF' + C_BORDER } },
          right:  { style: 'thin', color: { argb: 'FF' + C_BORDER } },
          bottom: { style: 'thin', color: { argb: 'FF' + C_BORDER } },
        };
        cell.alignment = { vertical: 'middle' };
        if ([5].includes(colNum) || moneyCols.includes(colNum)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          if (moneyCols.includes(colNum) && typeof cell.value === 'number') cell.numFmt = '#,##0.00 €';
        }
        if (colNum === nbCols) {
          cell.font      = { name: 'Calibri', size: 9, bold: true, color: { argb: isImpaye ? 'FFDC2626' : 'FF16A34A' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
    }

    // Total
    ws.addRow([]);
    const totData = isDateMode
      ? [`TOTAL — ${baux.length} baux`, '', '', '', '', '', '', '', '', kpis.total_attendu, kpis.total_encaisse, kpis.total_impayes, `${kpis.taux_recouvrement.toFixed(1)} %`, '']
      : [`TOTAL — ${baux.length} baux`, '', '', '', '', '', '', '', kpis.total_attendu, kpis.total_encaisse, kpis.total_impayes, `${kpis.taux_recouvrement.toFixed(1)} %`, ''];
    const totRow = ws.addRow(totData);
    totRow.height = 22;
    const mergeEnd = isDateMode ? 'I' : 'H';
    ws.mergeCells(`A${totRow.number}:${mergeEnd}${totRow.number}`);
    totRow.eachCell(cell => {
      cell.font  = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C_BLACK } };
      cell.alignment = { vertical: 'middle' };
    });
    const totMoneys = isDateMode ? [10, 11, 12] : [9, 10, 11];
    totMoneys.forEach(col => {
      const c = totRow.getCell(col);
      c.numFmt    = '#,##0.00 €';
      c.alignment = { horizontal: 'right', vertical: 'middle' };
    });
    totRow.getCell(isDateMode ? 13 : 12).alignment = { horizontal: 'center', vertical: 'middle' };

    // Lots vacants
    if (lots_vacants.length > 0) {
      ws.addRow([]); ws.addRow([]);
      const vtRow = ws.addRow([`LOTS VACANTS — ${lots_vacants.length}`]);
      ws.mergeCells(`A${vtRow.number}:${lastCol}${vtRow.number}`);
      vtRow.height = 20;
      vtRow.getCell(1).font      = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      vtRow.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92400E' } };
      vtRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

      const vhRow = ws.addRow(['Immeuble', 'Lot', 'Désignation', 'Type', 'Surface (m²)']);
      vhRow.height = 18;
      vhRow.eachCell((cell, c) => {
        if (c <= 5) {
          cell.font   = { name: 'Calibri', bold: true, size: 9, color: { argb: 'FF' + C_BLACK } };
          cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
          cell.border = {
            bottom: { style: 'medium', color: { argb: 'FFCA8A04' } },
            top:    { style: 'thin',   color: { argb: 'FF' + C_BORDER } },
            left:   { style: 'thin',   color: { argb: 'FF' + C_BORDER } },
            right:  { style: 'thin',   color: { argb: 'FF' + C_BORDER } },
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
      for (const v of lots_vacants) {
        const vr = ws.addRow([v.immeuble_name, v.lot_code, v.lot_name || '—', v.lot_type || '—', v.surface ? parseFloat(v.surface) : 0]);
        vr.height = 16;
        vr.eachCell((cell, c) => {
          if (c <= 5) {
            cell.font   = { name: 'Calibri', size: 9 };
            cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEFCE8' } };
            cell.border = {
              top:    { style: 'thin', color: { argb: 'FF' + C_BORDER } },
              left:   { style: 'thin', color: { argb: 'FF' + C_BORDER } },
              right:  { style: 'thin', color: { argb: 'FF' + C_BORDER } },
              bottom: { style: 'thin', color: { argb: 'FF' + C_BORDER } },
            };
            cell.alignment = { vertical: 'middle' };
            if (c === 5) cell.alignment = { horizontal: 'right', vertical: 'middle' };
          }
        });
      }
    }

    ws.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: nbCols } };
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRow.number }];

    const slug = mode === 'date'  ? `a-date-${date_ref}`
               : mode === 'borne' ? `borne-${date_debut}-${date_fin}`
               : mode === 'annee' ? `annee-${annee}`
               : `${MOIS_FR[mois].toLowerCase()}-${annee}`;
    const filename = `crg-${slug}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('exportCRGExcel error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur export Excel CRG' });
  }
};
