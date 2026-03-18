import { Response } from 'express';
import ExcelJS from 'exceljs';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

const MOIS_FR = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export const exportEtatLocatif = async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query;
    const refDate = date ? String(date) : new Date().toISOString().split('T')[0];

    // ── Requête état locatif à la date de référence ──────────────────────────
    const result = await pool.query(`
      SELECT
        i.code          AS immeuble_code,
        i.name          AS immeuble_name,
        i.address       AS immeuble_address,
        i.city          AS immeuble_city,
        i.postal_code   AS immeuble_postal_code,
        lot.code        AS lot_code,
        lot.name        AS lot_name,
        lot.surface,
        lot.floor,
        lot.type        AS lot_type,
        b.code          AS bail_code,
        b.type_bail,
        b.start_date,
        b.end_date,
        b.status        AS bail_status,
        b.loyer_ht,
        b.charges_ht,
        b.tva_applicable,
        b.tva_rate,
        b.tva_on_charges,
        b.depot_garantie,
        b.depot_garantie_received_date,
        CASE
          WHEN b.tva_applicable
            THEN ROUND(b.loyer_ht * (1 + b.tva_rate / 100) + b.charges_ht, 2)
          ELSE b.loyer_ht + b.charges_ht
        END             AS total_ttc,
        CASE
          WHEN loc.type = 'entreprise' THEN loc.company_name
          ELSE CONCAT(loc.first_name, ' ', loc.last_name)
        END             AS locataire_nom,
        loc.type        AS locataire_type,
        loc.email       AS locataire_email,
        loc.phone       AS locataire_phone,
        loc.siret       AS locataire_siret
      FROM lots lot
      JOIN immeubles i ON lot.immeuble_id = i.id
      LEFT JOIN baux b
        ON  b.lot_id    = lot.id
        AND b.start_date <= $1::date
        AND (b.end_date IS NULL OR b.end_date >= $1::date)
        AND b.status    = 'actif'
      LEFT JOIN locataires loc ON b.locataire_id = loc.id
      ORDER BY i.name, lot.code
    `, [refDate]);

    const rows = result.rows;

    // ── Créer le workbook ────────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AKILI PROPERTY';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('État Locatif', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
    });

    // ── Couleurs ─────────────────────────────────────────────────────────────
    const C_BLACK  = '0F172A';
    const C_GOLD   = 'AF9500';
    const C_HEADER = 'F8FAFC';
    const C_VACANT = 'FEF9C3';   // jaune pâle
    const C_ACTIF  = 'F0FDF4';   // vert pâle
    const C_BORDER = 'E2E8F0';

    // ── Titre ────────────────────────────────────────────────────────────────
    const d = new Date(refDate);
    const titre = `ÉTAT LOCATIF AU ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()}`;

    ws.mergeCells('A1:U1');
    const titleCell = ws.getCell('A1');
    titleCell.value = titre;
    titleCell.font = { name: 'Calibri', bold: true, size: 14, color: { argb: 'FF' + C_BLACK } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C_BLACK } };
    titleCell.font = { name: 'Calibri', bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    ws.mergeCells('A2:U2');
    const subCell = ws.getCell('A2');
    subCell.value = `Généré le ${new Date().toLocaleDateString('fr-FR')} — AKILI PROPERTY`;
    subCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF6B7280' }, italic: true };
    subCell.alignment = { horizontal: 'center' };
    ws.getRow(2).height = 18;

    ws.addRow([]); // ligne vide

    // ── En-têtes colonnes ────────────────────────────────────────────────────
    const headers = [
      { key: 'immeuble',        label: 'Immeuble',        width: 20 },
      { key: 'adresse',         label: 'Adresse',         width: 22 },
      { key: 'lot_code',        label: 'Lot',             width: 10 },
      { key: 'lot_nom',         label: 'Désignation',     width: 18 },
      { key: 'surface',         label: 'Surface (m²)',    width: 12 },
      { key: 'etage',           label: 'Étage',           width: 8  },
      { key: 'type_lot',        label: 'Type',            width: 14 },
      { key: 'statut',          label: 'Statut',          width: 10 },
      { key: 'locataire',       label: 'Locataire',       width: 22 },
      { key: 'siret',           label: 'SIRET',           width: 16 },
      { key: 'email',           label: 'Email',           width: 22 },
      { key: 'type_bail',       label: 'Type bail',       width: 14 },
      { key: 'bail_code',       label: 'N° Bail',         width: 14 },
      { key: 'debut_bail',      label: 'Début bail',      width: 12 },
      { key: 'fin_bail',        label: 'Fin bail',        width: 12 },
      { key: 'loyer_ht',        label: 'Loyer HT (€)',    width: 12 },
      { key: 'charges_ht',      label: 'Charges HT (€)',  width: 13 },
      { key: 'tva',             label: 'TVA',             width: 8  },
      { key: 'total_ttc',       label: 'Total TTC (€)',   width: 13 },
      { key: 'depot_garantie',  label: 'Dépôt garantie (€)', width: 15 },
      { key: 'dg_date',         label: 'Date réception DG',  width: 15 },
    ];

    // Appliquer largeurs
    headers.forEach((h, i) => {
      ws.getColumn(i + 1).width = h.width;
    });

    const headerRow = ws.addRow(headers.map(h => h.label));
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF' + C_BLACK } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C_HEADER } };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF' + C_GOLD } },
        top:    { style: 'thin',   color: { argb: 'FF' + C_BORDER } },
        left:   { style: 'thin',   color: { argb: 'FF' + C_BORDER } },
        right:  { style: 'thin',   color: { argb: 'FF' + C_BORDER } },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    // ── Données ──────────────────────────────────────────────────────────────
    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
    const fmtNum  = (n: any) => n ? parseFloat(n) : 0;

    let totalLots = 0, lotsVacants = 0, totalLoyer = 0;
    let lastImmeuble = '';

    for (const r of rows) {
      totalLots++;
      const isVacant = !r.bail_code;
      if (isVacant) lotsVacants++;
      else totalLoyer += fmtNum(r.total_ttc);

      // Séparateur entre immeubles
      if (r.immeuble_name !== lastImmeuble && lastImmeuble !== '') {
        const sepRow = ws.addRow([]);
        sepRow.height = 6;
      }
      lastImmeuble = r.immeuble_name;

      const typeBailLabels: Record<string, string> = {
        commercial: 'Commercial', habitation: 'Habitation',
        professionnel: 'Professionnel', mixte: 'Mixte',
      };

      const dataRow = ws.addRow([
        r.immeuble_name,
        [r.immeuble_address, r.immeuble_postal_code, r.immeuble_city].filter(Boolean).join(' '),
        r.lot_code,
        r.lot_name || '',
        fmtNum(r.surface),
        r.floor ?? '',
        r.lot_type || '',
        isVacant ? 'VACANT' : 'OCCUPÉ',
        r.locataire_nom || '',
        r.locataire_siret || '',
        r.locataire_email || '',
        r.type_bail ? typeBailLabels[r.type_bail] || r.type_bail : '',
        r.bail_code || '',
        fmtDate(r.start_date),
        fmtDate(r.end_date),
        fmtNum(r.loyer_ht),
        fmtNum(r.charges_ht),
        r.tva_applicable ? `${fmtNum(r.tva_rate)}%` : 'Non',
        fmtNum(r.total_ttc),
        fmtNum(r.depot_garantie),
        fmtDate(r.depot_garantie_received_date),
      ]);

      dataRow.height = 18;
      const bgColor = isVacant ? C_VACANT : C_ACTIF;

      dataRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 9 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
        cell.border = {
          top:   { style: 'thin', color: { argb: 'FF' + C_BORDER } },
          left:  { style: 'thin', color: { argb: 'FF' + C_BORDER } },
          right: { style: 'thin', color: { argb: 'FF' + C_BORDER } },
          bottom:{ style: 'thin', color: { argb: 'FF' + C_BORDER } },
        };
        cell.alignment = { vertical: 'middle', wrapText: false };

        // Aligner les montants à droite
        if ([5, 16, 17, 19, 20].includes(colNum)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          if ([16, 17, 19, 20].includes(colNum) && typeof cell.value === 'number' && cell.value > 0) {
            cell.numFmt = '#,##0.00 €';
          }
        }
        if (colNum === 8) {
          cell.font = {
            name: 'Calibri', size: 9, bold: true,
            color: { argb: isVacant ? 'FF92400E' : 'FF14532D' }
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
    }

    // ── Ligne totaux ─────────────────────────────────────────────────────────
    ws.addRow([]);
    const totRow = ws.addRow([
      `TOTAL : ${totalLots} lots — ${totalLots - lotsVacants} occupés — ${lotsVacants} vacants`,
      '', '', '', '', '', '', '',
      '', '', '', '', '', '', '',
      '', '',
      'LOYER TTC TOTAL :',
      totalLoyer,
      '', '',
    ]);
    totRow.height = 22;
    totRow.eachCell(cell => {
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C_BLACK } };
      cell.alignment = { vertical: 'middle' };
    });
    const lastCell = totRow.getCell(19);
    lastCell.numFmt = '#,##0.00 €';
    lastCell.alignment = { horizontal: 'right', vertical: 'middle' };

    ws.mergeCells(`A${totRow.number}:Q${totRow.number}`);

    // Filtre sur 21 colonnes
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 21 } };

    // ── Figer la ligne d'en-tête ─────────────────────────────────────────────
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

    // ── Filtre automatique (défini plus bas après merge totaux) ──────────────

    // ── Envoyer ──────────────────────────────────────────────────────────────
    const filename = `etat-locatif-${refDate}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('exportEtatLocatif error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur génération Excel' });
  }
};

// ─── Export FEC (Fichier d'Ecritures Comptables) ──────────────────────────────
export const exportFEC = async (req: AuthRequest, res: Response) => {
  try {
    const { annee, sci_id } = req.query;
    const y = annee ? parseInt(String(annee)) : new Date().getFullYear();

    let whereClause = `WHERE EXTRACT(YEAR FROM e.payment_date) = $1`;
    const params: any[] = [y];

    if (sci_id) {
      whereClause += ` AND si.sci_id = $2`;
      params.push(parseInt(String(sci_id)));
    }

    const result = await pool.query(`
      SELECT
        e.id, e.payment_date, e.amount, e.reference,
        e.payment_method,
        b.code AS bail_code,
        CASE WHEN loc.type = 'entreprise' THEN loc.company_name
             ELSE CONCAT(loc.first_name, ' ', loc.last_name)
        END AS locataire_nom,
        loc.siret AS locataire_siret,
        lot.code AS lot_code,
        i.code AS immeuble_code,
        s.name AS sci_name, s.siret AS sci_siret
      FROM encaissements e
      JOIN baux b ON e.bail_id = b.id
      JOIN locataires loc ON b.locataire_id = loc.id
      JOIN lots lot ON b.lot_id = lot.id
      JOIN immeubles i ON lot.immeuble_id = i.id
      JOIN sci_immeuble si ON si.immeuble_id = i.id
      JOIN sci s ON s.id = si.sci_id
      ${whereClause}
      ORDER BY e.payment_date ASC, e.id ASC
    `, params);

    const rows = result.rows;

    // Format FEC (tab-separated, ISO format)
    const FEC_HEADER = [
      'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
      'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
      'PieceRef', 'PieceDate', 'EcritureLib',
      'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate',
      'Montantdevise', 'Idevise'
    ].join('\t');

    const fmtFecDate = (d: any) => {
      if (!d) return '';
      const dt = d instanceof Date ? d : new Date(d);
      return `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}`;
    };

    const fmtMontant = (n: number) => Math.abs(n).toFixed(2).replace('.', ',');

    let ecritureNum = 1;
    const lines: string[] = [FEC_HEADER];

    for (const r of rows) {
      const dateStr = fmtFecDate(r.payment_date);
      const num = `BQ${String(ecritureNum).padStart(6, '0')}`;
      const libelle = `${r.bail_code} - ${r.locataire_nom}`.substring(0, 99);
      const montant = parseFloat(r.amount);

      // Écriture 1 : débit banque (512xxx)
      lines.push([
        'BQ', 'Banque', num, dateStr,
        '512000', 'Banque', '', '',
        r.reference || num, dateStr, libelle,
        fmtMontant(montant), '0,00', '', '', dateStr,
        fmtMontant(montant), 'EUR'
      ].join('\t'));

      // Écriture 2 : crédit loyer (706xxx)
      lines.push([
        'BQ', 'Banque', num, dateStr,
        '706100', 'Loyers et charges', r.locataire_siret || '', r.locataire_nom || '',
        r.reference || num, dateStr, libelle,
        '0,00', fmtMontant(montant), '', '', dateStr,
        fmtMontant(montant), 'EUR'
      ].join('\t'));

      ecritureNum++;
    }

    const csvContent = lines.join('\r\n');
    const filename = `FEC-${y}${sci_id ? `-sci${sci_id}` : ''}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csvContent); // BOM UTF-8

  } catch (error) {
    console.error('exportFEC error:', error);
    res.status(500).json({ error: 'Erreur génération FEC' });
  }
};
