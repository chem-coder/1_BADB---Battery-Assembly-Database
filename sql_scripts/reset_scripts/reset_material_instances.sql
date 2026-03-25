-- CLEAR ALL MATERIAL INSTANCE RECORDS and restart instance-related ID counters.
-- IMPORTANT: this removes material_instances plus their dependent layers
-- (material_instance_components and active_materials), and clears
-- tape_recipe_line_actuals only as needed to satisfy foreign-key constraints.
-- It keeps materials and all other reference/component tables.
--
-- SAFETY RULE:
-- This script aborts if tape actual measurements still reference material
-- instances. Run sql_scripts/reset_tapes.sql first if tape data still exists.
--
-- HOW TO RUN:
-- From project root folder, run psql. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_material_instances.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tape_recipe_line_actuals
    WHERE material_instance_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'reset_material_instances.sql aborted: tape_recipe_line_actuals still reference material instances. Run sql_scripts/reset_tapes.sql first.';
  END IF;
END;
$$;

TRUNCATE TABLE
  tape_recipe_line_actuals,
  material_instance_components,
  active_materials,
  material_instances
RESTART IDENTITY;

COMMIT;
