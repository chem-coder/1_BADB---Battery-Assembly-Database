-- Simplify coin-cell assembly model:
-- 1. Keep only SE / ES / ESE layouts
-- 2. Remove deprecated drop-based and notes-based fields from battery_coin_config
-- 3. Use battery_electrolyte.electrolyte_total_ul as the single electrolyte volume field

UPDATE battery_coin_config
SET coin_layout = NULL
WHERE coin_layout IS NOT NULL
  AND coin_layout NOT IN ('SE', 'ES', 'ESE');

ALTER TABLE battery_coin_config
  DROP COLUMN IF EXISTS electrolyte_drop_count,
  DROP COLUMN IF EXISTS electrolyte_drop_volume,
  DROP COLUMN IF EXISTS coin_layout_notes;

ALTER TABLE battery_coin_config
  DROP CONSTRAINT IF EXISTS battery_coin_config_coin_layout_check;

ALTER TABLE battery_coin_config
  ADD CONSTRAINT battery_coin_config_coin_layout_check
  CHECK (coin_layout IS NULL OR coin_layout IN ('SE', 'ES', 'ESE'));
