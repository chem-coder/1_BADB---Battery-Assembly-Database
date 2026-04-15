-- Backfill existing cut batches that can be inferred safely from saved battery usage.
-- We leave ambiguous historical rows untouched rather than guessing.

-- Existing coin batches used in 2032 cells
UPDATE electrode_cut_batches
SET
  target_form_factor = 'coin',
  target_config_code = '2032',
  target_config_other = NULL
WHERE cut_batch_id IN (3, 4);

-- Existing pouch batches currently used by pouch batteries 3 and 6.
-- These are backfilled to the standard pouch size already used elsewhere in the DB.
UPDATE electrode_cut_batches
SET
  target_form_factor = 'pouch',
  target_config_code = '103x83',
  target_config_other = NULL
WHERE cut_batch_id IN (1, 2);

-- Keep pouch battery config in sync for the existing batteries that already use those batches.
UPDATE battery_pouch_config
SET
  pouch_case_size_code = '103x83',
  pouch_case_size_other = NULL
WHERE battery_id IN (3, 6);

-- Battery 6 may not yet have a pouch config row; create it if needed.
INSERT INTO battery_pouch_config (
  battery_id,
  pouch_case_size_code,
  pouch_case_size_other,
  pouch_notes
)
SELECT
  6,
  '103x83',
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM battery_pouch_config
  WHERE battery_id = 6
);
