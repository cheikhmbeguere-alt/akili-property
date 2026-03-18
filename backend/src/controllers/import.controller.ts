import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import pool from '../config/database';
import ExcelJS from 'exceljs';
import multer from 'multer';

// ─── Multer (mémoire) ─────────────────────────────────────────────────────────
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in v) return String((v as any).text).trim();
  if (v instanceof Date) return v.toLocaleDateString('fr-FR');
  return String(v).trim();
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // DD/MM/YYYY or YYYY-MM-DD
  const parts = raw.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  if (parts[0].length === 4) return raw; // already YYYY-MM-DD
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function parseDecimal(raw: string): number | null {
  const n = parseFloat(raw.replace(',', '.').replace(/\s/g, ''));
  return isNaN(n) ? null : n;
}

// ─── GET /baux/import/template ────────────────────────────────────────────────
export const downloadTemplate = async (_req: AuthRequest, res: Response) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Import Baux');

  // En-têtes
  const headers = [
    { header: 'SCI',                       key: 'sci',            width: 20 },
    { header: 'Immeuble',                  key: 'immeuble',       width: 25 },
    { header: 'Lot (code)',                key: 'lot',            width: 15 },
    { header: 'Nom',                       key: 'nom',            width: 20 },
    { header: 'Prénom',                    key: 'prenom',         width: 20 },
    { header: 'Email',                     key: 'email',          width: 28 },
    { header: 'Téléphone',                 key: 'telephone',      width: 18 },
    { header: 'Loyer annuel HC (€)',       key: 'loyer_annuel',   width: 22 },
    { header: 'Charges annuelles HC (€)',  key: 'charges_annuel', width: 24 },
    { header: 'Dépôt de garantie (€)',     key: 'dg',             width: 22 },
    { header: 'Date début (JJ/MM/AAAA)',   key: 'date_debut',     width: 24 },
    { header: 'Date fin (JJ/MM/AAAA)',     key: 'date_fin',       width: 24 },
    { header: 'Type bail',                 key: 'type_bail',      width: 18 },
    { header: 'Indexation (O/N)',          key: 'indexation',     width: 18 },
    { header: 'Indice (IRL/ILC/ILAT/ICC)', key: 'indice',         width: 24 },
    { header: 'Date indexation (JJ/MM)',   key: 'date_indexation', width: 22 },
  ];

  ws.columns = headers;

  // Style en-têtes
  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF978A47' } };
    cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  headerRow.height = 35;

  // Ligne exemple
  ws.addRow({
    sci: 'SCI Exemple',
    immeuble: 'Immeuble Centre',
    lot: 'LOT-A1',
    nom: 'Dupont',
    prenom: 'Jean',
    email: 'jean.dupont@example.com',
    telephone: '0601020304',
    loyer_annuel: 18000,
    charges_annuel: 2400,
    dg: 3000,
    date_debut: '01/01/2024',
    date_fin: '',
    type_bail: 'commercial',
    indexation: 'O',
    indice: 'ILC',
    date_indexation: '01/01',
  });

  // Style ligne exemple
  const exRow = ws.getRow(2);
  exRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9F0' } };
    cell.font = { italic: true, color: { argb: 'FF888888' } };
  });

  // Note de bas de page
  ws.addRow([]);
  const noteRow = ws.addRow(['ℹ️ Valeurs acceptées — Type bail: habitation | commercial | professionnel | mixte    Indexation: O ou N    Indice: IRL | ILC | ILAT | ICC']);
  noteRow.getCell(1).font = { italic: true, color: { argb: 'FF666666' }, size: 10 };
  ws.mergeCells(`A${noteRow.number}:P${noteRow.number}`);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="template_import_baux.xlsx"');
  await wb.xlsx.write(res);
  res.end();
};

// ─── POST /baux/import/preview ────────────────────────────────────────────────
export const previewImport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier Excel requis' });

    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(req.file.buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'Feuille Excel introuvable' });

    // Récupérer données de référence
    const [sciRes, immRes, lotsRes, locRes, indicesRes] = await Promise.all([
      pool.query('SELECT id, name FROM sci'),
      pool.query('SELECT im.id, im.name, si.sci_id FROM immeubles im LEFT JOIN sci_immeuble si ON si.immeuble_id = im.id'),
      pool.query('SELECT l.id, l.code, l.name, l.immeuble_id FROM lots l'),
      pool.query('SELECT id, email, first_name, last_name, company_name, type FROM locataires'),
      pool.query('SELECT id, code FROM indices'),
    ]);

    const sciMap    = new Map(sciRes.rows.map((r: any) => [r.name.toLowerCase(), r.id]));
    const indiceMap = new Map(indicesRes.rows.map((r: any) => [r.code.toUpperCase(), r.id]));

    const rows: any[] = [];
    let rowNum = 0;

    ws.eachRow((row, idx) => {
      if (idx <= 1) return; // skip header
      rowNum++;

      const vals = (row as any).values as any[]; // 1-indexed
      const get = (i: number) => cellStr({ value: vals[i] } as any);

      const sci_nom       = get(1);
      const immeuble_nom  = get(2);
      const lot_code      = get(3);
      const nom           = get(4);
      const prenom        = get(5);
      const email         = get(6);
      const telephone     = get(7);
      const loyer_annuel  = parseDecimal(get(8));
      const charges_annuel= parseDecimal(get(9));
      const dg            = parseDecimal(get(10));
      const date_debut    = parseDate(get(11));
      const date_fin      = parseDate(get(12));
      const type_bail     = get(13).toLowerCase() || 'commercial';
      const indexation    = get(14).toUpperCase() === 'O';
      const indice_code   = get(15).toUpperCase();
      const date_idx      = get(16); // DD/MM

      // Ignorer lignes vides
      if (!sci_nom && !immeuble_nom && !lot_code && !nom) return;

      const errors: string[] = [];
      const warnings: string[] = [];

      // Résolution SCI
      const sci_id = sciMap.get(sci_nom.toLowerCase()) ?? null;
      if (!sci_id) errors.push(`SCI "${sci_nom}" introuvable`);

      // Résolution Immeuble
      const imm = immRes.rows.find((r: any) =>
        r.name.toLowerCase() === immeuble_nom.toLowerCase() &&
        (!sci_id || r.sci_id === sci_id)
      );
      if (!imm) errors.push(`Immeuble "${immeuble_nom}" introuvable`);

      // Résolution Lot
      const lot = imm ? lotsRes.rows.find((r: any) =>
        r.immeuble_id === imm.id &&
        r.code.toLowerCase() === lot_code.toLowerCase()
      ) : null;
      if (!lot) errors.push(`Lot "${lot_code}" introuvable dans ${immeuble_nom}`);

      // Résolution Locataire (doublon par email ou nom+prénom)
      let locataire: any = null;
      let locataire_conflict = false;
      if (email) {
        locataire = locRes.rows.find((r: any) => r.email?.toLowerCase() === email.toLowerCase());
      }
      if (!locataire && nom) {
        locataire = locRes.rows.find((r: any) =>
          r.last_name?.toLowerCase() === nom.toLowerCase() &&
          r.first_name?.toLowerCase() === prenom.toLowerCase()
        );
      }
      if (locataire) {
        locataire_conflict = true;
        warnings.push(`Locataire existant : ${locataire.first_name || ''} ${locataire.last_name || locataire.company_name || ''}`);
      }

      // Doublon bail (même locataire + même lot)
      let bail_conflict = false;
      // (sera vérifié à confirm ; ici on signale si locataire ET lot existent)
      if (locataire && lot) bail_conflict = true;

      // Indice
      const indice_id = indice_code ? (indiceMap.get(indice_code) ?? null) : null;
      if (indexation && indice_code && !indice_id) {
        warnings.push(`Indice "${indice_code}" introuvable`);
      }

      // Parse date indexation (JJ/MM)
      let indexation_date_day: number | null = null;
      let indexation_date_month: number | null = null;
      if (date_idx) {
        const parts = date_idx.split('/');
        if (parts.length === 2) {
          indexation_date_day   = parseInt(parts[0]) || null;
          indexation_date_month = parseInt(parts[1]) || null;
        }
      }

      if (!loyer_annuel) errors.push('Loyer annuel requis');
      if (!date_debut)   errors.push('Date début requise');

      rows.push({
        _row: rowNum,
        status: errors.length > 0 ? 'error' : (locataire_conflict || bail_conflict ? 'conflict' : 'new'),
        errors,
        warnings,
        // Données résolues
        sci_id,       sci_nom,
        immeuble_id:  imm?.id ?? null,  immeuble_nom,
        lot_id:       lot?.id ?? null,  lot_code,
        // Locataire
        locataire_id: locataire?.id ?? null,
        locataire_conflict,
        bail_conflict,
        nom, prenom, email, telephone,
        // Bail
        loyer_ht:    loyer_annuel ? loyer_annuel / 12 : null,
        charges_ht:  charges_annuel ? charges_annuel / 12 : null,
        depot_garantie: dg,
        start_date:  date_debut,
        end_date:    date_fin,
        type_bail,
        indexation_applicable: indexation,
        indice_id,
        indexation_date_day,
        indexation_date_month,
        // Action par défaut (conflict)
        action: (locataire_conflict || bail_conflict) ? 'ignore' : 'create',
      });
    });

    const summary = {
      total:     rows.length,
      new:       rows.filter(r => r.status === 'new').length,
      conflicts: rows.filter(r => r.status === 'conflict').length,
      errors:    rows.filter(r => r.status === 'error').length,
    };

    res.json({ rows, summary });
  } catch (err) {
    console.error('previewImport error:', err);
    res.status(500).json({ error: 'Erreur lors de la lecture du fichier' });
  }
};

// ─── POST /baux/import/confirm ────────────────────────────────────────────────
// Body: { rows: [...avec action: 'create'|'overwrite'|'ignore'] }
export const confirmImport = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rows: any[] = req.body.rows || [];
    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const row of rows) {
      if (row.action === 'ignore' || row.status === 'error') {
        results.skipped++;
        continue;
      }

      try {
        // 1. Locataire
        let locataire_id = row.locataire_id;

        if (!locataire_id || row.action === 'overwrite') {
          if (!locataire_id) {
            // Générer code locataire
            const codeRes = await client.query(`SELECT 'LOC' || LPAD((COUNT(*)+1)::text, 3,'0') AS code FROM locataires`);
            const code = codeRes.rows[0].code;
            const loc = await client.query(
              `INSERT INTO locataires (code, type, first_name, last_name, email, phone)
               VALUES ($1, 'particulier', $2, $3, $4, $5) RETURNING id`,
              [code, row.prenom || null, row.nom || null, row.email || null, row.telephone || null]
            );
            locataire_id = loc.rows[0].id;
          } else {
            // Mettre à jour
            await client.query(
              `UPDATE locataires SET first_name=$1, last_name=$2, email=$3, phone=$4, updated_at=NOW() WHERE id=$5`,
              [row.prenom || null, row.nom || null, row.email || null, row.telephone || null, locataire_id]
            );
          }
        }

        // 2. Vérifier si bail existant sur ce lot
        if (row.bail_conflict) {
          const existing = await client.query(
            `SELECT id FROM baux WHERE lot_id=$1 AND locataire_id=$2 AND status='actif'`,
            [row.lot_id, locataire_id]
          );
          if (existing.rows.length > 0 && row.action === 'ignore') {
            results.skipped++;
            continue;
          }
          if (existing.rows.length > 0 && row.action === 'overwrite') {
            await client.query(
              `UPDATE baux SET status='terminé', end_date=CURRENT_DATE WHERE id=$1`,
              [existing.rows[0].id]
            );
          }
        }

        // 3. Générer code bail
        const bailCodeRes = await client.query(
          `SELECT 'BAIL-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD((COUNT(*)+1)::text,3,'0') AS code FROM baux`
        );
        const bail_code = bailCodeRes.rows[0].code;

        // 4. Créer bail
        await client.query(
          `INSERT INTO baux (
            code, lot_id, locataire_id, start_date, end_date,
            loyer_ht, charges_ht, depot_garantie,
            type_bail, indexation_applicable, indice_id,
            indexation_date_day, indexation_date_month, status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'actif')`,
          [
            bail_code, row.lot_id, locataire_id,
            row.start_date, row.end_date || null,
            row.loyer_ht, row.charges_ht || 0,
            row.depot_garantie || null,
            row.type_bail || 'commercial',
            row.indexation_applicable ?? false,
            row.indice_id || null,
            row.indexation_date_day || null,
            row.indexation_date_month || null,
          ]
        );

        results.created++;
      } catch (rowErr: any) {
        results.errors.push(`Ligne ${row._row}: ${rowErr.message}`);
      }
    }

    await client.query('COMMIT');
    res.json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('confirmImport error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'import' });
  } finally {
    client.release();
  }
};
