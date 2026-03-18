-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008 : Row-Level Security (RLS)
-- ─────────────────────────────────────────────────────────────────────────────
-- Principe :
--   • app.user_id   = ID de l'utilisateur courant (posé par db-context.middleware)
--   • app.user_role = rôle ('admin' | 'editor' | 'viewer')
--   • Si non posé (migrations, accès direct) → '' → bypass automatique
--   • Admin               → accès total
--   • Viewer/Editor       → uniquement les SCI dans user_sci_permissions
--
-- FORCE ROW LEVEL SECURITY : s'applique même au propriétaire de la table
-- (propmanager). Les accès directs via psql sans app.user_id posé restent
-- libres (bypass ''), ce qui est intentionnel pour les migrations.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Fonction helper ─────────────────────────────────────────────────────────
-- Évite de répéter la logique admin/bypass dans chaque politique
CREATE OR REPLACE FUNCTION rls_user_has_sci(sci_id_param INTEGER)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    -- Pas de contexte posé (migrations, psql direct) → accès libre
    current_setting('app.user_id', true) = ''
    -- Admin → tout voir
    OR current_setting('app.user_role', true) = 'admin'
    -- Autres rôles → vérifier user_sci_permissions
    OR EXISTS (
      SELECT 1 FROM user_sci_permissions
      WHERE user_id = current_setting('app.user_id', true)::integer
        AND sci_id  = sci_id_param
    );
$$;

-- ─── sci ─────────────────────────────────────────────────────────────────────
ALTER TABLE sci ENABLE ROW LEVEL SECURITY;
ALTER TABLE sci FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_sci ON sci;
CREATE POLICY rls_sci ON sci
  USING (rls_user_has_sci(id));

-- ─── immeubles ───────────────────────────────────────────────────────────────
ALTER TABLE immeubles ENABLE ROW LEVEL SECURITY;
ALTER TABLE immeubles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_immeubles ON immeubles;
CREATE POLICY rls_immeubles ON immeubles
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'admin'
    OR id IN (
      SELECT immeuble_id FROM sci_immeuble
      WHERE sci_id IN (
        SELECT sci_id FROM user_sci_permissions
        WHERE user_id = current_setting('app.user_id', true)::integer
      )
    )
  );

-- ─── lots ────────────────────────────────────────────────────────────────────
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_lots ON lots;
CREATE POLICY rls_lots ON lots
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'admin'
    OR immeuble_id IN (
      SELECT immeuble_id FROM sci_immeuble
      WHERE sci_id IN (
        SELECT sci_id FROM user_sci_permissions
        WHERE user_id = current_setting('app.user_id', true)::integer
      )
    )
  );

-- ─── baux ────────────────────────────────────────────────────────────────────
ALTER TABLE baux ENABLE ROW LEVEL SECURITY;
ALTER TABLE baux FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_baux ON baux;
CREATE POLICY rls_baux ON baux
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'admin'
    OR lot_id IN (
      SELECT l.id FROM lots l
      JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
      WHERE si.sci_id IN (
        SELECT sci_id FROM user_sci_permissions
        WHERE user_id = current_setting('app.user_id', true)::integer
      )
    )
  );

-- ─── locataires ──────────────────────────────────────────────────────────────
ALTER TABLE locataires ENABLE ROW LEVEL SECURITY;
ALTER TABLE locataires FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_locataires ON locataires;
CREATE POLICY rls_locataires ON locataires
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'admin'
    OR id IN (
      SELECT DISTINCT b.locataire_id FROM baux b
      JOIN lots l ON b.lot_id = l.id
      JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
      WHERE si.sci_id IN (
        SELECT sci_id FROM user_sci_permissions
        WHERE user_id = current_setting('app.user_id', true)::integer
      )
    )
  );

-- ─── quittances ──────────────────────────────────────────────────────────────
ALTER TABLE quittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE quittances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_quittances ON quittances;
CREATE POLICY rls_quittances ON quittances
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'admin'
    OR bail_id IN (
      SELECT b.id FROM baux b
      JOIN lots l ON b.lot_id = l.id
      JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
      WHERE si.sci_id IN (
        SELECT sci_id FROM user_sci_permissions
        WHERE user_id = current_setting('app.user_id', true)::integer
      )
    )
  );

-- ─── encaissements ───────────────────────────────────────────────────────────
ALTER TABLE encaissements ENABLE ROW LEVEL SECURITY;
ALTER TABLE encaissements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_encaissements ON encaissements;
CREATE POLICY rls_encaissements ON encaissements
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'admin'
    OR bail_id IN (
      SELECT b.id FROM baux b
      JOIN lots l ON b.lot_id = l.id
      JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
      WHERE si.sci_id IN (
        SELECT sci_id FROM user_sci_permissions
        WHERE user_id = current_setting('app.user_id', true)::integer
      )
    )
  );

-- ─── Permissions sur la fonction helper ──────────────────────────────────────
GRANT EXECUTE ON FUNCTION rls_user_has_sci(INTEGER) TO propmanager;
