BEGIN;

CREATE TABLE IF NOT EXISTS tape_projects (
  tape_id INTEGER NOT NULL REFERENCES tapes(tape_id),
  project_id INTEGER NOT NULL REFERENCES projects(project_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by INTEGER REFERENCES users(user_id),
  PRIMARY KEY (tape_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_tape_projects_project_id
  ON tape_projects(project_id);

INSERT INTO tape_projects (tape_id, project_id, created_at, created_by)
SELECT
  tape_id,
  project_id,
  COALESCE(created_at, now()),
  created_by
FROM tapes
WHERE project_id IS NOT NULL
ON CONFLICT (tape_id, project_id) DO NOTHING;

COMMIT;
