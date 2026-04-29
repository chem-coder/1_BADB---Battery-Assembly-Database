BEGIN;

CREATE TABLE IF NOT EXISTS electrode_cut_batch_projects (
  cut_batch_id INTEGER NOT NULL REFERENCES electrode_cut_batches(cut_batch_id),
  project_id INTEGER NOT NULL REFERENCES projects(project_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by INTEGER REFERENCES users(user_id),
  PRIMARY KEY (cut_batch_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_electrode_cut_batch_projects_project_id
  ON electrode_cut_batch_projects(project_id);

INSERT INTO electrode_cut_batch_projects (cut_batch_id, project_id, created_at, created_by)
SELECT
  ecb.cut_batch_id,
  tp.project_id,
  COALESCE(ecb.created_at, now()),
  ecb.created_by
FROM electrode_cut_batches ecb
JOIN tape_projects tp
  ON tp.tape_id = ecb.tape_id
ON CONFLICT (cut_batch_id, project_id) DO NOTHING;

INSERT INTO electrode_cut_batch_projects (cut_batch_id, project_id, created_at, created_by)
SELECT
  ecb.cut_batch_id,
  t.project_id,
  COALESCE(ecb.created_at, now()),
  ecb.created_by
FROM electrode_cut_batches ecb
JOIN tapes t
  ON t.tape_id = ecb.tape_id
WHERE t.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM electrode_cut_batch_projects ecbp
    WHERE ecbp.cut_batch_id = ecb.cut_batch_id
  )
ON CONFLICT (cut_batch_id, project_id) DO NOTHING;

COMMIT;
