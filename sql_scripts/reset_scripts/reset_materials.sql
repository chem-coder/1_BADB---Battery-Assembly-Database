-- CLEAR ALL MATERIAL RECORDS and restart the material_id counter.
-- IMPORTANT: this removes only rows from materials, but keeps all dependent
-- layers untouched by refusing to run if they still exist.
--
-- SAFETY RULE:
-- This script aborts if material instances, recipe lines, active-material rows,
-- or actual measurements still depend on materials/material instances.
--
-- HOW TO RUN:
-- From project root folder (i.e. RENERA/BADB_main/), run psql connected to badb_app_v1. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_scripts/reset_materials.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM material_instances) THEN
    RAISE EXCEPTION
      'reset_materials.sql aborted: material_instances still exist. Clear instances first.';
  END IF;

  IF EXISTS (SELECT 1 FROM material_instance_components) THEN
    RAISE EXCEPTION
      'reset_materials.sql aborted: material_instance_components still exist. Clear instances/components first.';
  END IF;

  IF EXISTS (SELECT 1 FROM active_materials) THEN
    RAISE EXCEPTION
      'reset_materials.sql aborted: active_materials still exist. Clear active-material rows first.';
  END IF;

  IF EXISTS (SELECT 1 FROM tape_recipe_lines) THEN
    RAISE EXCEPTION
      'reset_materials.sql aborted: tape_recipe_lines still exist. Clear recipe lines first.';
  END IF;

  IF EXISTS (SELECT 1 FROM tape_recipe_line_actuals WHERE material_instance_id IS NOT NULL) THEN
    RAISE EXCEPTION
      'reset_materials.sql aborted: tape_recipe_line_actuals still reference material instances. Clear tape data first.';
  END IF;
END;
$$;

DELETE FROM materials;

ALTER SEQUENCE materials_material_id_seq RESTART WITH 1;

COMMIT;
