-- CLEAR ALL RECIPE RECORDS and restart recipe-related ID counters.
-- IMPORTANT: this removes tape_recipes and tape_recipe_lines, and clears
-- tape_recipe_line_actuals plus tapes only as needed to satisfy foreign-key
-- constraints. It keeps materials, users, and all other
-- reference/component tables.
--
-- SAFETY RULE:
-- This script aborts if tapes or actual measurements still depend on recipes.
-- Run sql_scripts/reset_tapes.sql first if tape workflow data still exists.
--
-- HOW TO RUN:
-- From project root folder, run psql. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_recipes.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tapes) THEN
    RAISE EXCEPTION
      'reset_recipes.sql aborted: tapes still exist. Run sql_scripts/reset_tapes.sql first.';
  END IF;

  IF EXISTS (SELECT 1 FROM tape_recipe_line_actuals) THEN
    RAISE EXCEPTION
      'reset_recipes.sql aborted: tape_recipe_line_actuals still exist. Run sql_scripts/reset_tapes.sql first.';
  END IF;
END;
$$;

TRUNCATE TABLE
  tapes,
  tape_recipe_line_actuals,
  tape_recipe_lines,
  tape_recipes
RESTART IDENTITY;

COMMIT;
