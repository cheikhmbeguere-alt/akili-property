import pool from '../config/database';

async function migrate() {
  try {
    console.log('🔄 Migration: ajout type_bail sur table baux...');

    await pool.query(`
      DO $$
      BEGIN
        -- Créer le type enum si pas encore existant
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_bail_enum') THEN
          CREATE TYPE type_bail_enum AS ENUM ('habitation', 'commercial', 'professionnel', 'mixte');
        END IF;

        -- Ajouter la colonne si elle n'existe pas
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'baux' AND column_name = 'type_bail'
        ) THEN
          ALTER TABLE baux ADD COLUMN type_bail type_bail_enum NOT NULL DEFAULT 'commercial';
        END IF;
      END
      $$;
    `);

    console.log('✅ Colonne type_bail ajoutée (défaut: commercial)');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur migration:', error);
    process.exit(1);
  }
}

migrate();
