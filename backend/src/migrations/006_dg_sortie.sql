-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006 — Dépôt de garantie mouvements + Sorties locataires
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Mouvements de dépôt de garantie ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS depot_garantie_mouvements (
  id             SERIAL PRIMARY KEY,
  bail_id        INTEGER NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
  type           VARCHAR(30) NOT NULL CHECK (type IN ('reception','restitution','retenue_partielle','retenue_totale')),
  montant        DECIMAL(10,2) NOT NULL CHECK (montant >= 0),
  date_mouvement DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Sorties de locataires ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sorties_locataires (
  id                    SERIAL PRIMARY KEY,
  bail_id               INTEGER NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
  date_sortie           DATE NOT NULL,
  etat_des_lieux        VARCHAR(20) NOT NULL DEFAULT 'bon_etat'
                          CHECK (etat_des_lieux IN ('bon_etat','degradations','non_realise')),
  solde_quittances      DECIMAL(10,2) NOT NULL DEFAULT 0,  -- quittances dues - encaissements (positif = locataire doit)
  depot_garantie_recu   DECIMAL(10,2) NOT NULL DEFAULT 0,
  retenues              DECIMAL(10,2) NOT NULL DEFAULT 0,  -- travaux, réparations
  montant_restitue      DECIMAL(10,2) NOT NULL DEFAULT 0,  -- calculé : DG - retenues - solde_impayé
  notes                 TEXT,
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Index ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dg_mouvements_bail_id   ON depot_garantie_mouvements(bail_id);
CREATE INDEX IF NOT EXISTS idx_dg_mouvements_type      ON depot_garantie_mouvements(type);
CREATE INDEX IF NOT EXISTS idx_sorties_bail_id         ON sorties_locataires(bail_id);
CREATE INDEX IF NOT EXISTS idx_sorties_date            ON sorties_locataires(date_sortie DESC);
