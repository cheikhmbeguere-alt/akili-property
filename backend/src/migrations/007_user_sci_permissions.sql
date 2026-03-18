-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007 — Permissions SCI par utilisateur
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_sci_permissions (
  id       SERIAL PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sci_id   INTEGER NOT NULL REFERENCES sci(id) ON DELETE CASCADE,
  UNIQUE(user_id, sci_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sci_user_id ON user_sci_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sci_sci_id  ON user_sci_permissions(sci_id);
