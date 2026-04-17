-- 016: Department-level project access grants
-- Complements user_project_access with department-wide grants.
-- Any user in the granted department inherits the access_level.
-- If a user ALSO has a personal user_project_access row, effective access is
-- the maximum (but the UI shows both rows separately).

CREATE TABLE IF NOT EXISTS project_department_access (
  project_id    INTEGER NOT NULL REFERENCES projects(project_id)       ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(department_id) ON DELETE CASCADE,
  access_level  VARCHAR(20) NOT NULL DEFAULT 'view'
                CHECK (access_level IN ('view', 'edit', 'admin')),
  granted_by    INTEGER REFERENCES users(user_id),
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NULL,     -- Level 3: time-limited grants
  PRIMARY KEY (project_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_pda_department ON project_department_access(department_id);
CREATE INDEX IF NOT EXISTS idx_pda_expires ON project_department_access(expires_at)
  WHERE expires_at IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON project_department_access TO "Dalia";
