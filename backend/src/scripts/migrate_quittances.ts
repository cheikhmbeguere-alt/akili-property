import pool from '../config/database';

async function migrate() {
  try {
    console.log('🔄 Migration: mise à jour table quittances...');

    await pool.query(`
      ALTER TABLE quittances
        ADD COLUMN IF NOT EXISTS type_document   VARCHAR(30) NOT NULL DEFAULT 'appel_loyer',
        ADD COLUMN IF NOT EXISTS tva_loyer       NUMERIC(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tva_charges     NUMERIC(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS is_prorata      BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS prorata_jours   SMALLINT,
        ADD COLUMN IF NOT EXISTS prorata_total   SMALLINT,
        ADD COLUMN IF NOT EXISTS created_by      INTEGER REFERENCES users(id);
    `);

    // Séquence globale pour numérotation des factures (jamais réinitialisée)
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS facture_seq START 1;`);

    console.log('✅ Table quittances mise à jour');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur migration:', error);
    process.exit(1);
  }
}

migrate();
