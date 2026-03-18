-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 009 : Multi-tenant — Table tenants + tenant_id sur users et sci
-- ─────────────────────────────────────────────────────────────────────────────
-- Principe :
--   • Un "tenant" = un cabinet de gestion immobilière (client AKILI)
--   • Chaque utilisateur appartient à un tenant
--   • Chaque SCI appartient à un tenant
--   • Les données en aval (immeubles, lots, baux…) sont isolées via la chaîne
--     sci → sci_immeuble → immeubles → lots → baux → …
--   • Nouveau rôle "superadmin" : accès cross-tenant (AKILI uniquement)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Table tenants ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ─── Tenant par défaut (données existantes) ───────────────────────────────────
INSERT INTO tenants (name, slug)
VALUES ('Cabinet Principal', 'cabinet-principal')
ON CONFLICT (slug) DO NOTHING;

-- ─── tenant_id sur users ─────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;

-- Rattacher tous les users existants au tenant par défaut
UPDATE users
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'cabinet-principal')
WHERE tenant_id IS NULL;

-- Rendre tenant_id obligatoire (sauf superadmin qui peut être NULL → accès global)
-- On laisse nullable pour ne pas bloquer un futur compte superadmin sans tenant
-- Le code applicatif s'assure qu'un user normal a toujours un tenant_id

-- ─── tenant_id sur sci ────────────────────────────────────────────────────────
ALTER TABLE sci ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;

UPDATE sci
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'cabinet-principal')
WHERE tenant_id IS NULL;

-- ─── Rôle superadmin dans le check existant ──────────────────────────────────
-- Le VALID_ROLES du code applicatif sera mis à jour pour inclure 'superadmin'
-- Ici on s'assure que la contrainte CHECK (si elle existe) l'accepte
-- PostgreSQL ne bloque pas les valeurs non listées dans le code, juste dans les enums

-- ─── Index ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sci_tenant_id   ON sci(tenant_id);

-- ─── Permissions ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO propmanager;
GRANT USAGE, SELECT ON SEQUENCE tenants_id_seq TO propmanager;
