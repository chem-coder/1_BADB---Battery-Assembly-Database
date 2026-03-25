-- CLEAR ALL SEPARATOR STRUCTURE RECORDS and restart the sep_str_id counter.
-- IMPORTANT: this removes only separator_structure rows and keeps separators
-- plus all other reference/component tables untouched.
--
-- SAFETY RULE:
-- This script aborts if separators still reference a structure.
-- Clear separators first if any still depend on separator_structure.
--
-- HOW TO RUN:
-- From project root folder, run psql. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_structures.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM separators
    WHERE structure_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'reset_structures.sql aborted: separators still reference separator_structure. Clear separators first.';
  END IF;
END;
$$;

DELETE FROM separator_structure;

ALTER SEQUENCE separator_structure_sep_str_id_seq RESTART WITH 1;

COMMIT;
