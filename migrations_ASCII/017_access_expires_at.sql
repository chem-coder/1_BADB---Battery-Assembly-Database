-- 017: Time-limited grants for user-level project access
-- Adds expires_at to user_project_access. NULL = permanent (default behavior).
-- GET /api/projects filter must check (expires_at IS NULL OR expires_at > now()).

ALTER TABLE user_project_access
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_upa_expires ON user_project_access(expires_at)
  WHERE expires_at IS NOT NULL;
