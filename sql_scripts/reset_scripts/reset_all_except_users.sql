-- CLEAR ONLY THE TABLES MARKED "clear" IN THE RESET PLAN,
-- while keeping the tables marked "KEEP".
-- This uses one TRUNCATE statement to avoid foreign-key ordering problems.
--
-- KEPT TABLES:
--   - coating_methods
--   - dry_mixing_methods
--   - drying_atmospheres
--   - electrode_status
--   - foils
--   - operation_types
--   - users
--   - wet_mixing_methods
--
-- HOW TO RUN:
-- From project root folder, run psql. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_all_except_users.sql

BEGIN;

TRUNCATE TABLE
  active_materials,
  batteries,
  battery_coin_config,
  battery_cyl_config,
  battery_electrochem,
  battery_electrode_sources,
  battery_electrodes,
  battery_electrolyte,
  battery_pouch_config,
  battery_qc,
  battery_sep_config,
  electrode_cut_batches,
  electrode_drying,
  electrodes,
  electrolytes,
  foil_mass_measurements,
  material_instance_components,
  material_instances,
  materials,
  module_batteries,
  module_qc,
  modules,
  projects,
  separator_structure,
  separators,
  tape_process_steps,
  tape_recipe_line_actuals,
  tape_recipe_lines,
  tape_recipes,
  tape_step_calendering,
  tape_step_coating,
  tape_step_drying,
  tape_step_mixing,
  tapes
RESTART IDENTITY;

COMMIT;
