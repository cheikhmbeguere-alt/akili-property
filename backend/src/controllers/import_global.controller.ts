import { Response } from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

export const uploadGlobal = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const AKILI_GOLD  = 'FF978A47';
const AKILI_LIGHT = 'FFFFF9F0';
const WHITE       = 'FFFFFFFF';
const GRAY        = 'FF888888';

function styleHeader(row: ExcelJS.Row, color = AKILI_GOLD) {
  row.eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.font      = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });
  row.height = 32;
}

function styleExample(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AKILI_LIGHT } };
    cell.font = { italic: true, color: { argb: GRAY } };
  });
}

// ─── GET /api/import/global/template ─────────────────────────────────────────

export const downloadGlobalTemplate = async (_req: AuthRequest, res: Response) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AKILI Property';
  wb.created = new Date();

  // ── 1. SCI ──────────────────────────────────────────────────────────────────
  const wsSCI = wb.addWorksheet('1_SCI');
  wsSCI.columns = [
    { header: 'Nom SCI *',         key: 'name',         width: 28 },
    { header: 'SIRET',             key: 'siret',         width: 20 },
    { header: 'Adresse',           key: 'address',       width: 35 },
    { header: 'Code postal',       key: 'postal_code',   width: 14 },
    { header: 'Ville',             key: 'city',          width: 20 },
    { header: 'Capital (€)',       key: 'capital',       width: 14 },
    { header: 'Notes',             key: 'notes',         width: 30 },
  ];
  styleHeader(wsSCI.getRow(1));
  const exSCI = wsSCI.addRow({ name: 'SCI STANISLAS', siret: '12345678900010', address: '12 rue de la Paix', postal_code: '75001', city: 'Paris', capital: 10000, notes: '' });
  styleExample(exSCI);
  wsSCI.addRow([]);
  const noteSCI = wsSCI.addRow(['* Champ obligatoire']);
  noteSCI.getCell(1).font = { italic: true, color: { argb: GRAY }, size: 10 };

  // ── 2. Immeubles ─────────────────────────────────────────────────────────────
  const wsImm = wb.addWorksheet('2_Immeubles');
  wsImm.columns = [
    { header: 'Nom immeuble *',    key: 'name',         width: 28 },
    { header: 'SCI (nom exact) *', key: 'sci_name',     width: 28 },
    { header: 'Adresse *',         key: 'address',      width: 35 },
    { header: 'Code postal',       key: 'postal_code',  width: 14 },
    { header: 'Ville',             key: 'city',         width: 20 },
    { header: 'Nb lots',           key: 'nb_lots',      width: 10 },
    { header: 'Notes',             key: 'notes',        width: 30 },
  ];
  styleHeader(wsImm.getRow(1));
  const exImm = wsImm.addRow({ name: 'CLAIROIX', sci_name: 'SCI STANISLAS', address: '5 avenue des Champs', postal_code: '60800', city: 'Clairoix', nb_lots: 4, notes: '' });
  styleExample(exImm);
  wsImm.addRow([]);
  const noteImm = wsImm.addRow(['* La valeur "SCI (nom exact)" doit correspondre exactement au nom dans l\'onglet 1_SCI']);
  noteImm.getCell(1).font = { italic: true, color: { argb: GRAY }, size: 10 };
  wsImm.mergeCells(`A${noteImm.number}:G${noteImm.number}`);

  // ── 3. Lots ───────────────────────────────────────────────────────────────────
  const wsLots = wb.addWorksheet('3_Lots');
  wsLots.columns = [
    { header: 'Réf. lot (auto si vide)', key: 'code',          width: 22 },
    { header: 'Immeuble (nom exact) *',  key: 'immeuble_name', width: 28 },
    { header: 'Nom / Description',       key: 'name',          width: 28 },
    { header: 'Étage',                   key: 'floor',         width: 10 },
    { header: 'Surface (m²)',            key: 'surface',       width: 14 },
    { header: 'Type *',                  key: 'type',          width: 18 },
    { header: 'Notes',                   key: 'notes',         width: 30 },
  ];
  styleHeader(wsLots.getRow(1));
  const exLot = wsLots.addRow({ code: 'LOT-A1', immeuble_name: 'CLAIROIX', name: 'Entrepôt principal', floor: 0, surface: 1567, type: 'entrepot', notes: '' });
  styleExample(exLot);
  wsLots.addRow([]);
  const noteLot = wsLots.addRow(['* Réf. lot : laissez vide pour génération automatique (ex: CLAIROIX-001). Vous pouvez saisir votre propre référence.    Type : appartement | maison | bureau | commerce | entrepot | parking | autre']);
  noteLot.getCell(1).font = { italic: true, color: { argb: GRAY }, size: 10 };
  wsLots.mergeCells(`A${noteLot.number}:G${noteLot.number}`);

  // ── 4. Locataires ─────────────────────────────────────────────────────────────
  const wsLoc = wb.addWorksheet('4_Locataires');
  wsLoc.columns = [
    { header: 'Type *',                  key: 'type',         width: 14 },
    { header: 'Raison sociale',          key: 'company_name', width: 28 },
    { header: 'Prénom',                  key: 'first_name',   width: 20 },
    { header: 'Nom',                     key: 'last_name',    width: 20 },
    { header: 'Email',                   key: 'email',        width: 30 },
    { header: 'Téléphone',               key: 'phone',        width: 18 },
    { header: 'Adresse',                 key: 'address',      width: 35 },
    { header: 'Code postal',             key: 'postal_code',  width: 14 },
    { header: 'Ville',                   key: 'city',         width: 20 },
    { header: 'N° TVA',                  key: 'tva_number',   width: 20 },
    { header: 'Notes',                   key: 'notes',        width: 30 },
  ];
  styleHeader(wsLoc.getRow(1));
  const exLoc = wsLoc.addRow({ type: 'entreprise', company_name: 'GEODIS', first_name: '', last_name: '', email: 'contact@geodis.fr', phone: '0140000000', address: '2 avenue Michelin', postal_code: '63000', city: 'Clermont-Ferrand', tva_number: 'FR12345678901', notes: '' });
  styleExample(exLoc);
  wsLoc.addRow([]);
  const noteLoc = wsLoc.addRow(['* Type : particulier | entreprise | professionnel']);
  noteLoc.getCell(1).font = { italic: true, color: { argb: GRAY }, size: 10 };
  wsLoc.mergeCells(`A${noteLoc.number}:K${noteLoc.number}`);

  // ── 5. Baux ───────────────────────────────────────────────────────────────────
  const wsBaux = wb.addWorksheet('5_Baux');
  wsBaux.columns = [
    { header: 'Réf. lot *',                  key: 'lot_code',        width: 18 },
    { header: 'Locataire - Nom ou email *',  key: 'locataire_ref',   width: 32 },
    { header: 'Réf. bail (auto si vide)',    key: 'bail_ref',        width: 24 },
    { header: 'Date début (JJ/MM/AAAA) *',  key: 'start_date',      width: 24 },
    { header: 'Date fin (JJ/MM/AAAA)',       key: 'end_date',        width: 22 },
    { header: 'Loyer mensuel HT (€) *',     key: 'loyer_ht',        width: 22 },
    { header: 'Charges mensuelles HT (€)',  key: 'charges_ht',      width: 24 },
    { header: 'TVA applicable (O/N)',        key: 'tva',             width: 20 },
    { header: 'Taux TVA (%)',               key: 'tva_rate',        width: 14 },
    { header: 'Dépôt garantie (€)',         key: 'depot_garantie',  width: 20 },
    { header: 'Type bail *',                key: 'type_bail',       width: 18 },
    { header: 'Périodicité',                key: 'frequency',       width: 16 },
    { header: 'Indexation (O/N)',           key: 'indexation',      width: 16 },
    { header: 'Indice',                     key: 'indice',          width: 16 },
    { header: 'Date réf. indexation',       key: 'date_indexation', width: 22 },
  ];
  styleHeader(wsBaux.getRow(1));
  const exBail = wsBaux.addRow({
    lot_code: 'LOT-A1', locataire_ref: 'GEODIS', bail_ref: '',
    start_date: '01/01/2020', end_date: '31/12/2026',
    loyer_ht: 3000, charges_ht: 150, tva: 'O', tva_rate: 20, depot_garantie: 6000,
    type_bail: 'commercial', frequency: 'mensuel', indexation: 'O', indice: 'ILC', date_indexation: '01/01',
  });
  styleExample(exBail);
  wsBaux.addRow([]);
  const noteBaux1 = wsBaux.addRow([
    '* Locataire : saisissez la raison sociale, "Prénom NOM" ou l\'email — l\'outil fait le lien automatiquement.',
  ]);
  noteBaux1.getCell(1).font = { italic: true, color: { argb: GRAY }, size: 10 };
  wsBaux.mergeCells(`A${noteBaux1.number}:O${noteBaux1.number}`);
  const noteBaux2 = wsBaux.addRow([
    '* Réf. bail : laissez vide pour génération automatique (ex: BAIL-2025-LOT-A1). Vous pouvez saisir votre propre référence.    Périodicité : mensuel | trimestriel | annuel    Type bail : habitation | commercial | professionnel | mixte    Indice : IRL | ILC | ILAT | ICC',
  ]);
  noteBaux2.getCell(1).font = { italic: true, color: { argb: GRAY }, size: 10 };
  wsBaux.mergeCells(`A${noteBaux2.number}:O${noteBaux2.number}`);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="template_import_global.xlsx"');
  await wb.xlsx.write(res);
  res.end();
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function cellStr(cell: ExcelJS.Cell): string {
  return cell?.value != null ? String(cell.value).trim() : '';
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell?.value;
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

// ─── POST /api/import/global/preview ─────────────────────────────────────────

export const previewGlobalImport = async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer as any);

  const errors: string[] = [];
  const preview = {
    sci:        [] as any[],
    immeubles:  [] as any[],
    lots:       [] as any[],
    locataires: [] as any[],
    baux:       [] as any[],
  };

  // ── SCI ──────────────────────────────────────────────────────────────────────
  const wsSCI = wb.getWorksheet('1_SCI');
  if (!wsSCI) {
    errors.push('Onglet "1_SCI" introuvable');
  } else {
    wsSCI.eachRow((row, i) => {
      if (i === 1) return;
      const name = cellStr(row.getCell(1));
      if (!name || name.startsWith('*') || name.startsWith('ℹ')) return;
      if (!name) { errors.push(`SCI ligne ${i}: nom obligatoire`); return; }
      preview.sci.push({
        name,
        siret:       cellStr(row.getCell(2)) || null,
        address:     cellStr(row.getCell(3)) || null,
        postal_code: cellStr(row.getCell(4)) || null,
        city:        cellStr(row.getCell(5)) || null,
        capital:     cellNum(row.getCell(6)),
        notes:       cellStr(row.getCell(7)) || null,
      });
    });
  }

  // ── Immeubles ────────────────────────────────────────────────────────────────
  const wsImm = wb.getWorksheet('2_Immeubles');
  if (!wsImm) {
    errors.push('Onglet "2_Immeubles" introuvable');
  } else {
    wsImm.eachRow((row, i) => {
      if (i === 1) return;
      const name     = cellStr(row.getCell(1));
      const sci_name = cellStr(row.getCell(2));
      if (!name || name.startsWith('*') || name.startsWith('ℹ')) return;
      if (!sci_name) { errors.push(`Immeuble ligne ${i}: SCI obligatoire`); return; }
      preview.immeubles.push({
        name,
        sci_name,
        address:     cellStr(row.getCell(3)) || null,
        postal_code: cellStr(row.getCell(4)) || null,
        city:        cellStr(row.getCell(5)) || null,
        notes:       cellStr(row.getCell(7)) || null,
      });
    });
  }

  // ── Lots ─────────────────────────────────────────────────────────────────────
  const wsLots = wb.getWorksheet('3_Lots');
  if (!wsLots) {
    errors.push('Onglet "3_Lots" introuvable');
  } else {
    let lotIndex = 0;
    wsLots.eachRow((row, i) => {
      if (i === 1) return;
      const immeuble_name = cellStr(row.getCell(2));
      // Ignorer ligne vide ou note
      if (!immeuble_name || immeuble_name.startsWith('*') || immeuble_name.startsWith('ℹ')) {
        const col1 = cellStr(row.getCell(1));
        if (!col1 || col1.startsWith('*') || col1.startsWith('ℹ') || col1.startsWith('Réf')) return;
        if (!immeuble_name) return; // ligne vide
      }
      if (!immeuble_name || immeuble_name.startsWith('*') || immeuble_name.startsWith('ℹ')) return;
      lotIndex++;
      // Code : pris tel quel OU auto-généré plus tard (on garde vide pour l'indiquer)
      const code = cellStr(row.getCell(1)) || null;
      const type = cellStr(row.getCell(6)) || 'autre';
      const VALID_TYPES = ['appartement','maison','bureau','commerce','entrepot','parking','autre'];
      if (!VALID_TYPES.includes(type)) errors.push(`Lot ligne ${i}: type "${type}" invalide`);
      preview.lots.push({ code, immeuble_name, name: cellStr(row.getCell(3)) || null, floor: cellNum(row.getCell(4)), surface: cellNum(row.getCell(5)), type, notes: cellStr(row.getCell(7)) || null });
    });
  }

  // ── Locataires ───────────────────────────────────────────────────────────────
  const wsLoc = wb.getWorksheet('4_Locataires');
  if (!wsLoc) {
    errors.push('Onglet "4_Locataires" introuvable');
  } else {
    wsLoc.eachRow((row, i) => {
      if (i === 1) return;
      const type = cellStr(row.getCell(1));
      if (!type || type.startsWith('*') || type.startsWith('ℹ')) return;
      const VALID_TYPES = ['particulier','entreprise','professionnel'];
      if (!VALID_TYPES.includes(type)) { errors.push(`Locataire ligne ${i}: type "${type}" invalide`); return; }
      preview.locataires.push({
        type,
        company_name: cellStr(row.getCell(2)) || null,
        first_name:   cellStr(row.getCell(3)) || null,
        last_name:    cellStr(row.getCell(4)) || null,
        email:        cellStr(row.getCell(5)) || null,
        phone:        cellStr(row.getCell(6)) || null,
        address:      cellStr(row.getCell(7)) || null,
        postal_code:  cellStr(row.getCell(8)) || null,
        city:         cellStr(row.getCell(9)) || null,
        tva_number:   cellStr(row.getCell(10)) || null,
        notes:        cellStr(row.getCell(11)) || null,
      });
    });
  }

  // ── Baux ─────────────────────────────────────────────────────────────────────
  const wsBaux = wb.getWorksheet('5_Baux');
  if (!wsBaux) {
    errors.push('Onglet "5_Baux" introuvable');
  } else {
    wsBaux.eachRow((row, i) => {
      if (i === 1) return;
      const lot_code       = cellStr(row.getCell(1));
      const locataire_ref  = cellStr(row.getCell(2)); // nom, raison sociale ou email
      if (!lot_code || lot_code.startsWith('*') || lot_code.startsWith('ℹ') || lot_code.startsWith('Réf')) return;
      if (!locataire_ref) { errors.push(`Bail ligne ${i}: locataire obligatoire`); return; }
      const bail_ref   = cellStr(row.getCell(3)) || null;
      const start_date = parseDate(row.getCell(4).value);
      if (!start_date) { errors.push(`Bail ligne ${i}: date début invalide`); return; }
      const loyer = cellNum(row.getCell(6));
      if (!loyer) { errors.push(`Bail ligne ${i}: loyer obligatoire`); return; }
      preview.baux.push({
        lot_code,
        locataire_ref,
        bail_ref,
        start_date,
        end_date:        parseDate(row.getCell(5).value),
        loyer_ht:        loyer,
        charges_ht:      cellNum(row.getCell(7)) ?? 0,
        tva_applicable:  (cellStr(row.getCell(8)) || 'N').toUpperCase() === 'O',
        tva_rate:        cellNum(row.getCell(9)) ?? 0,
        depot_garantie:  cellNum(row.getCell(10)),
        type_bail:       cellStr(row.getCell(11)) || 'commercial',
        frequency:       cellStr(row.getCell(12)) || 'mensuel',
        indexation:      (cellStr(row.getCell(13)) || 'N').toUpperCase() === 'O',
        indice:          cellStr(row.getCell(14)) || null,
        date_indexation: cellStr(row.getCell(15)) || null,
      });
    });
  }

  res.json({ preview, errors, counts: { sci: preview.sci.length, immeubles: preview.immeubles.length, lots: preview.lots.length, locataires: preview.locataires.length, baux: preview.baux.length } });
};

// ─── POST /api/import/global/confirm ─────────────────────────────────────────

// Génère un code unique court à partir d'un nom
function makeCode(name: string, suffix = ''): string {
  const base = name.replace(/[^A-Z0-9]/gi, '').substring(0, 8).toUpperCase();
  return suffix ? `${base}-${suffix}` : base;
}

// Parse "DD/MM" → { month, day }
function parseIndexDate(val: string | null): { month: number | null; day: number | null } {
  if (!val) return { month: null, day: null };
  const m = String(val).match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return { day: parseInt(m[1]), month: parseInt(m[2]) };
  return { month: null, day: null };
}

export const confirmGlobalImport = async (req: AuthRequest, res: Response) => {
  const { preview } = req.body as { preview: { sci: any[]; immeubles: any[]; lots: any[]; locataires: any[]; baux: any[] } };
  if (!preview) return res.status(400).json({ error: 'Données de preview manquantes' });

  const tenantId = req.user?.tenantId ?? 1;
  const client   = await pool.connect();
  const results  = { sci: 0, immeubles: 0, lots: 0, locataires: 0, baux: 0, skipped: [] as string[] };

  try {
    await client.query('BEGIN');

    // ── SCI ────────────────────────────────────────────────────────────────────
    // Schéma réel: id, code (UNIQUE NOT NULL), name, siret, address, tva_number, tenant_id
    const sciMap = new Map<string, number>(); // name → id
    for (const s of preview.sci) {
      const existing = await client.query(
        'SELECT id FROM sci WHERE LOWER(name) = LOWER($1) AND tenant_id = $2', [s.name, tenantId]
      );
      if (existing.rows.length > 0) {
        sciMap.set(s.name, existing.rows[0].id);
        results.skipped.push(`SCI "${s.name}" déjà existante`);
        continue;
      }
      // Générer un code unique pour la SCI
      const baseCode = makeCode(s.name);
      let sciCode = baseCode;
      let n = 1;
      while ((await client.query('SELECT id FROM sci WHERE code = $1', [sciCode])).rows.length > 0) {
        sciCode = `${baseCode}-${n++}`;
      }
      const adresse = [s.address, s.postal_code, s.city].filter(Boolean).join(', ') || null;
      const r = await client.query(
        `INSERT INTO sci (code, name, siret, address, tva_number, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [sciCode, s.name, s.siret || null, adresse, s.tva_number || null, tenantId]
      );
      sciMap.set(s.name, r.rows[0].id);
      results.sci++;
    }
    // Charger SCI existantes pour les immeubles qui référencent une SCI déjà en base
    const allSCI = await client.query('SELECT id, name FROM sci WHERE tenant_id = $1', [tenantId]);
    for (const row of allSCI.rows) if (!sciMap.has(row.name)) sciMap.set(row.name, row.id);

    // ── Immeubles ──────────────────────────────────────────────────────────────
    // Schéma réel: id, code (UNIQUE NOT NULL), name, address (NOT NULL), city, postal_code, total_surface, construction_year
    // Pas de tenant_id ni sci_id — lien via sci_immeuble
    const immMap = new Map<string, number>(); // name → id
    for (const imm of preview.immeubles) {
      const sciId = sciMap.get(imm.sci_name);
      if (!sciId) { results.skipped.push(`Immeuble "${imm.name}": SCI "${imm.sci_name}" introuvable`); continue; }

      // Vérifier si immeuble déjà lié à cette SCI
      const existing = await client.query(
        `SELECT i.id FROM immeubles i
         JOIN sci_immeuble si ON si.immeuble_id = i.id
         WHERE LOWER(i.name) = LOWER($1) AND si.sci_id = $2`,
        [imm.name, sciId]
      );
      if (existing.rows.length > 0) {
        immMap.set(imm.name, existing.rows[0].id);
        results.skipped.push(`Immeuble "${imm.name}" déjà existant`);
        continue;
      }
      // Générer un code unique
      const baseCode = makeCode(imm.name);
      let immCode = baseCode;
      let n = 1;
      while ((await client.query('SELECT id FROM immeubles WHERE code = $1', [immCode])).rows.length > 0) {
        immCode = `${baseCode}-${n++}`;
      }
      const r = await client.query(
        `INSERT INTO immeubles (code, name, address, city, postal_code)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [immCode, imm.name, imm.address || imm.name, imm.city || null, imm.postal_code || null]
      );
      // Lier SCI ↔ Immeuble
      await client.query(
        `INSERT INTO sci_immeuble (sci_id, immeuble_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [sciId, r.rows[0].id]
      );
      immMap.set(imm.name, r.rows[0].id);
      results.immeubles++;
    }
    // Charger immeubles existants liés au tenant via sci
    const allImm = await client.query(
      `SELECT DISTINCT i.id, i.name FROM immeubles i
       JOIN sci_immeuble si ON si.immeuble_id = i.id
       JOIN sci s ON s.id = si.sci_id
       WHERE s.tenant_id = $1`, [tenantId]
    );
    for (const row of allImm.rows) if (!immMap.has(row.name)) immMap.set(row.name, row.id);

    // ── Lots ───────────────────────────────────────────────────────────────────
    // Schéma réel: id, immeuble_id, code, name, surface (NOT NULL), floor, type, description
    const lotMap = new Map<string, number>(); // code → id
    const immLotCounter = new Map<number, number>();
    for (const lot of preview.lots) {
      const immId = immMap.get(lot.immeuble_name);
      if (!immId) { results.skipped.push(`Lot "${lot.code || '(auto)'}": immeuble "${lot.immeuble_name}" introuvable`); continue; }

      // Auto-générer le code si absent
      let code = lot.code;
      if (!code) {
        const prefix = lot.immeuble_name.replace(/[^A-Z0-9]/gi, '').substring(0, 6).toUpperCase();
        const n = (immLotCounter.get(immId) ?? 0) + 1;
        immLotCounter.set(immId, n);
        code = `${prefix}-${String(n).padStart(3, '0')}`;
      }
      const existing = await client.query(
        'SELECT id FROM lots WHERE LOWER(code) = LOWER($1) AND immeuble_id = $2', [code, immId]
      );
      if (existing.rows.length > 0) {
        lotMap.set(code, existing.rows[0].id);
        results.skipped.push(`Lot "${code}" déjà existant`);
        continue;
      }
      const r = await client.query(
        `INSERT INTO lots (code, name, floor, surface, type, description, immeuble_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [code, lot.name || code, lot.floor ?? null, lot.surface ?? 0, lot.type || 'autre', lot.notes || null, immId]
      );
      lotMap.set(code, r.rows[0].id);
      results.lots++;
    }
    // Charger lots existants liés au tenant
    const allLots = await client.query(
      `SELECT l.id, l.code FROM lots l
       JOIN immeubles i ON i.id = l.immeuble_id
       JOIN sci_immeuble si ON si.immeuble_id = i.id
       JOIN sci s ON s.id = si.sci_id
       WHERE s.tenant_id = $1`, [tenantId]
    );
    for (const row of allLots.rows) if (!lotMap.has(row.code)) lotMap.set(row.code, row.id);

    // ── Locataires ─────────────────────────────────────────────────────────────
    // Schéma réel: id, code (UNIQUE NOT NULL), type, company_name, siret, first_name, last_name,
    //              email, phone, address, city, postal_code, tva_number, notes, is_active
    const locMapByEmail = new Map<string, number>();
    const locMapByName  = new Map<string, number>();

    for (const loc of preview.locataires) {
      // Vérifier doublon par email
      if (loc.email) {
        const existing = await client.query(
          'SELECT id FROM locataires WHERE LOWER(email) = LOWER($1)', [loc.email]
        );
        if (existing.rows.length > 0) {
          locMapByEmail.set(loc.email.toLowerCase(), existing.rows[0].id);
          const displayName = loc.company_name || `${loc.first_name} ${loc.last_name}`.trim();
          results.skipped.push(`Locataire "${displayName}" déjà existant`);
          continue;
        }
      }
      // Générer un code unique
      const namePart = loc.company_name || `${loc.last_name}${loc.first_name}`.replace(/\s/g, '');
      const baseCode = makeCode(namePart).substring(0, 8);
      let locCode = baseCode;
      let n = 1;
      while ((await client.query('SELECT id FROM locataires WHERE code = $1', [locCode])).rows.length > 0) {
        locCode = `${baseCode}-${n++}`;
      }
      const r = await client.query(
        `INSERT INTO locataires (code, type, company_name, first_name, last_name, email, phone, address, city, postal_code, tva_number, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [locCode, loc.type, loc.company_name || null, loc.first_name || null, loc.last_name || null,
         loc.email || null, loc.phone || null, loc.address || null, loc.city || null,
         loc.postal_code || null, loc.tva_number || null, loc.notes || null]
      );
      const newId = r.rows[0].id;
      if (loc.email) locMapByEmail.set(loc.email.toLowerCase(), newId);
      const fullName = [loc.first_name, loc.last_name].filter(Boolean).join(' ').toLowerCase();
      if (fullName) locMapByName.set(fullName, newId);
      if (loc.company_name) locMapByName.set(loc.company_name.toLowerCase(), newId);
      results.locataires++;
    }

    // Charger locataires existants par email ET par nom
    const allLoc = await client.query(
      'SELECT id, email, company_name, first_name, last_name FROM locataires'
    );
    for (const row of allLoc.rows) {
      if (row.email && !locMapByEmail.has(row.email.toLowerCase())) locMapByEmail.set(row.email.toLowerCase(), row.id);
      if (row.company_name && !locMapByName.has(row.company_name.toLowerCase())) locMapByName.set(row.company_name.toLowerCase(), row.id);
      const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').toLowerCase();
      if (fullName && !locMapByName.has(fullName)) locMapByName.set(fullName, row.id);
    }

    function resolveLocataire(ref: string): number | null {
      if (!ref) return null;
      if (ref.includes('@')) return locMapByEmail.get(ref.toLowerCase()) ?? null;
      return locMapByName.get(ref.toLowerCase()) ?? null;
    }

    // ── Baux ───────────────────────────────────────────────────────────────────
    // Schéma réel: code, lot_id, locataire_id, start_date, end_date, loyer_ht, charges_ht,
    //   tva_applicable, tva_rate, depot_garantie, type_bail (enum), quittancement_frequency,
    //   indexation_applicable, indice_id, indexation_date_month, indexation_date_day
    const VALID_TYPE_BAIL = ['habitation', 'commercial', 'professionnel', 'mixte'];
    for (const bail of preview.baux) {
      const lotId = lotMap.get(bail.lot_code);
      if (!lotId) { results.skipped.push(`Bail: lot "${bail.lot_code}" introuvable`); continue; }
      const locId = resolveLocataire(bail.locataire_ref);
      if (!locId) { results.skipped.push(`Bail: locataire "${bail.locataire_ref}" introuvable — vérifiez le nom ou l'email`); continue; }

      // Vérifier bail actif existant
      const existing = await client.query(
        "SELECT id FROM baux WHERE lot_id = $1 AND locataire_id = $2 AND status = 'actif'", [lotId, locId]
      );
      if (existing.rows.length > 0) {
        results.skipped.push(`Bail: lot "${bail.lot_code}" / "${bail.locataire_ref}" déjà actif`);
        continue;
      }

      // Chercher l'indice
      let indiceId: number | null = null;
      if (bail.indexation && bail.indice) {
        const indRes = await client.query('SELECT id FROM indices WHERE code = $1 LIMIT 1', [bail.indice]);
        if (indRes.rows.length > 0) indiceId = indRes.rows[0].id;
      }

      // Référence bail : custom ou auto-générée
      const year = new Date(bail.start_date).getFullYear();
      let code = bail.bail_ref || `BAIL-${year}-${bail.lot_code}`;
      // Unicité du code
      let nc = 1;
      while ((await client.query('SELECT id FROM baux WHERE code = $1', [code])).rows.length > 0) {
        code = `${bail.bail_ref || `BAIL-${year}-${bail.lot_code}`}-${nc++}`;
      }

      const freq = ['mensuel', 'trimestriel', 'annuel'].includes(bail.frequency) ? bail.frequency : 'mensuel';
      const typeBail = VALID_TYPE_BAIL.includes(bail.type_bail) ? bail.type_bail : 'commercial';
      const { month: idxMonth, day: idxDay } = parseIndexDate(bail.date_indexation);

      await client.query(
        `INSERT INTO baux (code, lot_id, locataire_id, start_date, end_date, loyer_ht, charges_ht,
          tva_applicable, tva_rate, depot_garantie, type_bail, quittancement_frequency,
          indexation_applicable, indice_id, indexation_date_month, indexation_date_day, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'actif')`,
        [code, lotId, locId, bail.start_date, bail.end_date || null,
         bail.loyer_ht, bail.charges_ht ?? 0, bail.tva_applicable ?? false,
         bail.tva_rate ?? 0, bail.depot_garantie || null, typeBail, freq,
         bail.indexation ?? false, indiceId, idxMonth, idxDay]
      );
      results.baux++;
    }

    await client.query('COMMIT');
    res.json({ success: true, results });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('confirmGlobalImport error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};
