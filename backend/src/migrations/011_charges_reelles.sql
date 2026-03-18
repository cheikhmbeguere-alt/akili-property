-- ─── Migration 011 : Régularisation de charges ───────────────────────────────

-- Table des charges réelles (factures de dépenses)
CREATE TABLE IF NOT EXISTS charges_reelles (
  id              SERIAL PRIMARY KEY,
  sci_id          INTEGER REFERENCES sci(id) ON DELETE CASCADE,
  immeuble_id     INTEGER REFERENCES immeubles(id) ON DELETE SET NULL,
  lot_id          INTEGER REFERENCES lots(id) ON DELETE SET NULL,
  bail_id         INTEGER REFERENCES baux(id) ON DELETE SET NULL,
  periode_annee   INTEGER NOT NULL CHECK (periode_annee BETWEEN 2000 AND 2099),
  periode_mois    INTEGER CHECK (periode_mois BETWEEN 1 AND 12),
  type_charge     VARCHAR(50) NOT NULL DEFAULT 'autre',
  libelle         TEXT NOT NULL,
  montant_ht      DECIMAL(10,2) NOT NULL CHECK (montant_ht >= 0),
  tva_taux        DECIMAL(5,2) NOT NULL DEFAULT 0,
  montant_ttc     DECIMAL(10,2) NOT NULL CHECK (montant_ttc >= 0),
  date_facture    DATE,
  reference       VARCHAR(200),
  source          VARCHAR(20) NOT NULL DEFAULT 'manuel',
  pennylane_id    VARCHAR(200) UNIQUE,
  notes           TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charges_reelles_sci      ON charges_reelles(sci_id);
CREATE INDEX IF NOT EXISTS idx_charges_reelles_immeuble ON charges_reelles(immeuble_id);
CREATE INDEX IF NOT EXISTS idx_charges_reelles_annee    ON charges_reelles(periode_annee);
CREATE INDEX IF NOT EXISTS idx_charges_reelles_bail     ON charges_reelles(bail_id);

-- Table de régularisation par bail et par année
CREATE TABLE IF NOT EXISTS regularisations_charges (
  id                      SERIAL PRIMARY KEY,
  bail_id                 INTEGER NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
  periode_annee           INTEGER NOT NULL CHECK (periode_annee BETWEEN 2000 AND 2099),
  charges_provisionnees   DECIMAL(10,2) NOT NULL DEFAULT 0,
  nb_mois_provisions      INTEGER NOT NULL DEFAULT 12,
  charges_reelles_total   DECIMAL(10,2) NOT NULL DEFAULT 0,
  solde                   DECIMAL(10,2) NOT NULL DEFAULT 0,
  status                  VARCHAR(20) NOT NULL DEFAULT 'calcule',
  notes                   TEXT,
  created_by              INTEGER REFERENCES users(id),
  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(bail_id, periode_annee)
);

CREATE INDEX IF NOT EXISTS idx_regul_bail  ON regularisations_charges(bail_id);
CREATE INDEX IF NOT EXISTS idx_regul_annee ON regularisations_charges(periode_annee);

-- GRANT pour production
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'propmanager') THEN
    GRANT ALL ON charges_reelles, regularisations_charges TO propmanager;
    GRANT USAGE, SELECT ON SEQUENCE charges_reelles_id_seq, regularisations_charges_id_seq TO propmanager;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prop_admin') THEN
    GRANT ALL ON charges_reelles, regularisations_charges TO prop_admin;
    GRANT USAGE, SELECT ON SEQUENCE charges_reelles_id_seq, regularisations_charges_id_seq TO prop_admin;
  END IF;
END $$;
