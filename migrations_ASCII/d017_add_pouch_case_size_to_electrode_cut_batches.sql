BEGIN;

ALTER TABLE public.electrode_cut_batches
  ADD COLUMN IF NOT EXISTS pouch_case_size_code text,
  ADD COLUMN IF NOT EXISTS pouch_case_size_other text;

ALTER TABLE public.electrode_cut_batches
  DROP CONSTRAINT IF EXISTS electrode_cut_batches_pouch_case_size_code_allowed;

ALTER TABLE public.electrode_cut_batches
  ADD CONSTRAINT electrode_cut_batches_pouch_case_size_code_allowed
  CHECK (
    pouch_case_size_code IS NULL
    OR pouch_case_size_code IN ('103x83', '86x56', 'other')
  );

ALTER TABLE public.electrode_cut_batches
  DROP CONSTRAINT IF EXISTS electrode_cut_batches_other_size_requires_text;

ALTER TABLE public.electrode_cut_batches
  ADD CONSTRAINT electrode_cut_batches_other_size_requires_text
  CHECK (
    pouch_case_size_code IS DISTINCT FROM 'other'
    OR NULLIF(BTRIM(pouch_case_size_other), '') IS NOT NULL
  );

COMMIT;
