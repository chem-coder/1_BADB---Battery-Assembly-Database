-- CLEAR ALL USER RECORDS and restart the user_id counter.
-- IMPORTANT: this removes only rows from users, but keeps all dependent
-- workflow/reference tables untouched by refusing to run if they still exist.
--
-- SAFETY RULE:
-- This script aborts if projects, tapes, batteries, electrode batches,
-- electrolytes, separators, recipes, or tape steps still reference users.
--
-- HOW TO RUN:
-- From project root folder, run psql. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_users.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM batteries) THEN
    RAISE EXCEPTION
      'reset_users.sql aborted: batteries still exist. Run sql_scripts/reset_batteries.sql first.';
  END IF;

  IF EXISTS (SELECT 1 FROM tape_process_steps) THEN
    RAISE EXCEPTION
      'reset_users.sql aborted: tape_process_steps still exist. Run sql_scripts/reset_tapes.sql first.';
  END IF;

  IF EXISTS (SELECT 1 FROM electrode_cut_batches) THEN
    RAISE EXCEPTION
      'reset_users.sql aborted: electrode_cut_batches still exist. Run sql_scripts/reset_electrodes.sql first.';
  END IF;

  IF EXISTS (SELECT 1 FROM tapes) THEN
    RAISE EXCEPTION
      'reset_users.sql aborted: tapes still exist. Run sql_scripts/reset_tapes.sql first.';
  END IF;

  IF EXISTS (SELECT 1 FROM tape_recipes) THEN
    RAISE EXCEPTION
      'reset_users.sql aborted: tape_recipes still exist. Run sql_scripts/reset_recipes.sql first.';
  END IF;

  IF EXISTS (SELECT 1 FROM electrolytes) THEN
    RAISE EXCEPTION
      'reset_users.sql aborted: electrolytes still exist. Run sql_scripts/reset_electrolytes.sql first.';
  END IF;

  IF EXISTS (SELECT 1 FROM separators) THEN
    RAISE EXCEPTION
      'reset_users.sql aborted: separators still exist. Clear separators first.';
  END IF;

  IF EXISTS (SELECT 1 FROM projects) THEN
    RAISE EXCEPTION
      'reset_users.sql aborted: projects still exist. Run sql_scripts/reset_projects.sql first.';
  END IF;
END;
$$;

DELETE FROM users;

ALTER SEQUENCE users_user_id_seq RESTART WITH 1;

COMMIT;
