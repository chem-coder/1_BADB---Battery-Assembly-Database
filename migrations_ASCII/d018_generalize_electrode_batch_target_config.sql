ALTER TABLE electrode_cut_batches
  ADD COLUMN IF NOT EXISTS target_form_factor text,
  ADD COLUMN IF NOT EXISTS target_config_code text,
  ADD COLUMN IF NOT EXISTS target_config_other text;

UPDATE electrode_cut_batches
SET
  target_form_factor = CASE
    WHEN pouch_case_size_code IS NOT NULL THEN 'pouch'
    ELSE target_form_factor
  END,
  target_config_code = CASE
    WHEN pouch_case_size_code IS NOT NULL THEN pouch_case_size_code
    ELSE target_config_code
  END,
  target_config_other = CASE
    WHEN pouch_case_size_code IS NOT NULL THEN pouch_case_size_other
    ELSE target_config_other
  END
WHERE pouch_case_size_code IS NOT NULL;

ALTER TABLE electrode_cut_batches
  DROP CONSTRAINT IF EXISTS electrode_cut_batches_target_form_factor_check;

ALTER TABLE electrode_cut_batches
  ADD CONSTRAINT electrode_cut_batches_target_form_factor_check
  CHECK (
    target_form_factor IS NULL OR
    target_form_factor IN ('coin', 'pouch', 'cylindrical')
  );

ALTER TABLE electrode_cut_batches
  DROP CONSTRAINT IF EXISTS electrode_cut_batches_target_config_code_check;

ALTER TABLE electrode_cut_batches
  ADD CONSTRAINT electrode_cut_batches_target_config_code_check
  CHECK (
    target_config_code IS NULL OR
    target_config_code IN (
      '2016',
      '2025',
      '2032',
      '103x83',
      '86x56',
      '18650',
      '21700',
      'other'
    )
  );

ALTER TABLE electrode_cut_batches
  DROP CONSTRAINT IF EXISTS electrode_cut_batches_target_config_other_check;

ALTER TABLE electrode_cut_batches
  ADD CONSTRAINT electrode_cut_batches_target_config_other_check
  CHECK (
    target_config_code IS DISTINCT FROM 'other' OR
    NULLIF(BTRIM(target_config_other), '') IS NOT NULL
  );

ALTER TABLE electrode_cut_batches
  DROP CONSTRAINT IF EXISTS electrode_cut_batches_target_shape_match_check;

ALTER TABLE electrode_cut_batches
  ADD CONSTRAINT electrode_cut_batches_target_shape_match_check
  CHECK (
    target_form_factor IS NULL OR
    (target_form_factor = 'coin' AND shape = 'circle') OR
    (target_form_factor IN ('pouch', 'cylindrical') AND shape = 'rectangle')
  );
