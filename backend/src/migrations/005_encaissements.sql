-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005 — Encaissements & Relances
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Table encaissements ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS encaissements (
  id                        SERIAL PRIMARY KEY,
  bail_id                   INTEGER REFERENCES baux(id) ON DELETE SET NULL,
  locataire_id              INTEGER REFERENCES locataires(id) ON DELETE SET NULL,
  payment_date              DATE        NOT NULL,
  amount                    DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_method            VARCHAR(50),          -- virement | cheque | prelevement | especes | carte
  reference                 VARCHAR(200),         -- libellé / référence
  periode_mois              INTEGER CHECK (periode_mois BETWEEN 1 AND 12),
  periode_annee             INTEGER CHECK (periode_annee BETWEEN 2000 AND 2099),
  notes                     TEXT,
  source                    VARCHAR(20)  NOT NULL DEFAULT 'manuel', -- manuel | import_csv
  pennylane_transaction_id  VARCHAR(200) UNIQUE,  -- pour dédoublonnage import CSV
  created_at                TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ── Table bail_relances ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bail_relances (
  id           SERIAL PRIMARY KEY,
  bail_id      INTEGER NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL CHECK (type IN ('relance1','relance2','mise_en_demeure')),
  date_envoi   TIMESTAMP   NOT NULL DEFAULT NOW(),
  montant_du   DECIMAL(10,2),
  notes        TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- ── Index ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_encaissements_bail_id      ON encaissements(bail_id);
CREATE INDEX IF NOT EXISTS idx_encaissements_payment_date ON encaissements(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_encaissements_locataire_id ON encaissements(locataire_id);
CREATE INDEX IF NOT EXISTS idx_bail_relances_bail_id      ON bail_relances(bail_id);
CREATE INDEX IF NOT EXISTS idx_bail_relances_date_envoi   ON bail_relances(date_envoi DESC);
