BEGIN;

ALTER TABLE public.battery_pouch_config
  ADD COLUMN IF NOT EXISTS pouch_case_size_code text,
  ADD COLUMN IF NOT EXISTS pouch_case_size_other text;

ALTER TABLE public.battery_pouch_config
  DROP CONSTRAINT IF EXISTS battery_pouch_config_other_size_requires_text;

ALTER TABLE public.battery_pouch_config
  DROP CONSTRAINT IF EXISTS battery_pouch_config_case_size_code_allowed;

ALTER TABLE public.battery_pouch_config
  ADD CONSTRAINT battery_pouch_config_case_size_code_allowed
  CHECK (
    pouch_case_size_code IS NULL
    OR pouch_case_size_code IN ('103x83', '86x56', 'other')
  );

ALTER TABLE public.battery_pouch_config
  ADD CONSTRAINT battery_pouch_config_other_size_requires_text
  CHECK (
    pouch_case_size_code IS DISTINCT FROM 'other'
    OR NULLIF(BTRIM(pouch_case_size_other), '') IS NOT NULL
  );

COMMIT;
