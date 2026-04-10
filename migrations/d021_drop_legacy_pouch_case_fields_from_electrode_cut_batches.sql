ALTER TABLE electrode_cut_batches
  DROP COLUMN IF EXISTS pouch_case_size_code,
  DROP COLUMN IF EXISTS pouch_case_size_other;
