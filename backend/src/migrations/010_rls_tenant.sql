-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010 : Mise à jour des politiques RLS avec tenant_id
-- ─────────────────────────────────────────────────────────────────────────────
-- Remplace les politiques de 008_rls.sql pour ajouter l'isolation tenant.
--
-- Nouvelles règles :
--   • app.user_id   = '' → bypass (migrations, psql direct)
--   • app.user_role = 'superadmin' → accès total cross-tenant (AKILI only)
--   • app.user_role = 'admin' + tenant check → toutes les SCI du tenant
--   • Autres rôles + tenant check → SCI dans user_sci_permissions uniquement
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Fonction helper mise à jour ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rls_user_has_sci(sci_id_param INTEGER)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    -- Pas de contexte (migrations) → bypass
    current_setting('app.user_id', true) = ''
    -- Superadmin AKILI → tout voir, tous tenants
    OR current_setting('app.user_role', true) = 'superadmin'
    -- Admin tenant → toutes ses SCI (mais seulement du même tenant)
    OR (
      current_setting('app.user_role', true) = 'admin'
      AND EXISTS (
        SELECT 1 FROM sci
        WHERE sci.id = sci_id_param
          AND sci.tenant_id::text = current_setting('app.tenant_id', true)
      )
    )
    -- Viewer/Editor → uniquement les SCI dans user_sci_permissions (même tenant implicite)
    OR (
      current_setting('app.user_role', true) IN ('viewer', 'editor')
      AND EXISTS (
        SELECT 1 FROM user_sci_permissions usp
        JOIN sci s ON s.id = usp.sci_id
        WHERE usp.user_id = current_setting('app.user_id', true)::integer
          AND usp.sci_id = sci_id_param
          AND s.tenant_id::text = current_setting('app.tenant_id', true)
      )
    );
$$;

-- ─── sci ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_sci ON sci;
CREATE POLICY rls_sci ON sci
  USING (rls_user_has_sci(id));

-- ─── immeubles ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_immeubles ON immeubles;
CREATE POLICY rls_immeubles ON immeubles
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'superadmin'
    OR (
      -- L'immeuble doit appartenir à un SCI du même tenant
      EXISTS (
        SELECT 1 FROM sci_immeuble si
        JOIN sci s ON s.id = si.sci_id
        WHERE si.immeuble_id = immeubles.id
          AND s.tenant_id::text = current_setting('app.tenant_id', true)
      )
      AND (
        current_setting('app.user_role', true) = 'admin'
        OR id IN (
          SELECT immeuble_id FROM sci_immeuble
          WHERE sci_id IN (
            SELECT sci_id FROM user_sci_permissions
            WHERE user_id = current_setting('app.user_id', true)::integer
          )
        )
      )
    )
  );

-- ─── lots ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_lots ON lots;
CREATE POLICY rls_lots ON lots
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'superadmin'
    OR (
      EXISTS (
        SELECT 1 FROM sci_immeuble si
        JOIN sci s ON s.id = si.sci_id
        WHERE si.immeuble_id = lots.immeuble_id
          AND s.tenant_id::text = current_setting('app.tenant_id', true)
      )
      AND (
        current_setting('app.user_role', true) = 'admin'
        OR lots.immeuble_id IN (
          SELECT immeuble_id FROM sci_immeuble
          WHERE sci_id IN (
            SELECT sci_id FROM user_sci_permissions
            WHERE user_id = current_setting('app.user_id', true)::integer
          )
        )
      )
    )
  );

-- ─── baux ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_baux ON baux;
CREATE POLICY rls_baux ON baux
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'superadmin'
    OR (
      EXISTS (
        SELECT 1 FROM lots l
        JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
        JOIN sci s ON s.id = si.sci_id
        WHERE l.id = baux.lot_id
          AND s.tenant_id::text = current_setting('app.tenant_id', true)
      )
      AND (
        current_setting('app.user_role', true) = 'admin'
        OR baux.lot_id IN (
          SELECT l.id FROM lots l
          JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
          WHERE si.sci_id IN (
            SELECT sci_id FROM user_sci_permissions
            WHERE user_id = current_setting('app.user_id', true)::integer
          )
        )
      )
    )
  );

-- ─── locataires ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_locataires ON locataires;
CREATE POLICY rls_locataires ON locataires
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'superadmin'
    OR (
      EXISTS (
        SELECT 1 FROM baux b
        JOIN lots l ON b.lot_id = l.id
        JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
        JOIN sci s ON s.id = si.sci_id
        WHERE b.locataire_id = locataires.id
          AND s.tenant_id::text = current_setting('app.tenant_id', true)
      )
      AND (
        current_setting('app.user_role', true) = 'admin'
        OR locataires.id IN (
          SELECT DISTINCT b.locataire_id FROM baux b
          JOIN lots l ON b.lot_id = l.id
          JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
          WHERE si.sci_id IN (
            SELECT sci_id FROM user_sci_permissions
            WHERE user_id = current_setting('app.user_id', true)::integer
          )
        )
      )
    )
  );

-- ─── quittances ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_quittances ON quittances;
CREATE POLICY rls_quittances ON quittances
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'superadmin'
    OR (
      EXISTS (
        SELECT 1 FROM baux b
        JOIN lots l ON b.lot_id = l.id
        JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
        JOIN sci s ON s.id = si.sci_id
        WHERE b.id = quittances.bail_id
          AND s.tenant_id::text = current_setting('app.tenant_id', true)
      )
      AND (
        current_setting('app.user_role', true) = 'admin'
        OR quittances.bail_id IN (
          SELECT b.id FROM baux b
          JOIN lots l ON b.lot_id = l.id
          JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
          WHERE si.sci_id IN (
            SELECT sci_id FROM user_sci_permissions
            WHERE user_id = current_setting('app.user_id', true)::integer
          )
        )
      )
    )
  );

-- ─── encaissements ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_encaissements ON encaissements;
CREATE POLICY rls_encaissements ON encaissements
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'superadmin'
    OR (
      EXISTS (
        SELECT 1 FROM baux b
        JOIN lots l ON b.lot_id = l.id
        JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
        JOIN sci s ON s.id = si.sci_id
        WHERE b.id = encaissements.bail_id
          AND s.tenant_id::text = current_setting('app.tenant_id', true)
      )
      AND (
        current_setting('app.user_role', true) = 'admin'
        OR encaissements.bail_id IN (
          SELECT b.id FROM baux b
          JOIN lots l ON b.lot_id = l.id
          JOIN sci_immeuble si ON si.immeuble_id = l.immeuble_id
          WHERE si.sci_id IN (
            SELECT sci_id FROM user_sci_permissions
            WHERE user_id = current_setting('app.user_id', true)::integer
          )
        )
      )
    )
  );

-- ─── RLS sur tenants : chaque tenant ne voit que lui-même ────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenants ON tenants;
CREATE POLICY rls_tenants ON tenants
  USING (
    current_setting('app.user_id', true) = ''
    OR current_setting('app.user_role', true) = 'superadmin'
    OR id::text = current_setting('app.tenant_id', true)
  );

GRANT EXECUTE ON FUNCTION rls_user_has_sci(INTEGER) TO propmanager;
