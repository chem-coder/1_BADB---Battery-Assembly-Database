-- 013: Traceability — updated_by/updated_at columns + field_changelog table
-- Forward-only. Never UPDATE or DELETE this migration.

-- ── Phase B1: Add updated_by + updated_at to entity tables ──

ALTER TABLE tapes ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id);
ALTER TABLE tapes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE tape_process_steps ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id);
ALTER TABLE tape_process_steps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE electrode_cut_batches ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id);
ALTER TABLE electrode_cut_batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE batteries ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id);
ALTER TABLE batteries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- projects already has updated_at — only add updated_by
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id);

ALTER TABLE materials ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE tape_recipes ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id);
ALTER TABLE tape_recipes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- separators already has updated_at — only add updated_by
ALTER TABLE separators ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id);

ALTER TABLE electrolytes ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id);
ALTER TABLE electrolytes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ── Phase B2: field_changelog table ──

CREATE TABLE IF NOT EXISTS field_changelog (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by INTEGER REFERENCES users(user_id),
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_changelog_entity ON field_changelog(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_changelog_user ON field_changelog(changed_by);
CREATE INDEX IF NOT EXISTS idx_changelog_date ON field_changelog(changed_at);

GRANT ALL ON TABLE field_changelog TO "Dalia";
GRANT USAGE, SELECT ON SEQUENCE field_changelog_id_seq TO "Dalia";
