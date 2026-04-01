-- CLEAR ALL SEPARATOR RECORDS and restart the sep_id counter.
-- IMPORTANT: this removes only rows from separators and keeps structures,
-- users, and all other reference/component tables.
--
-- SAFETY RULE:
-- This script aborts if battery records still reference separators.
-- Run sql_scripts/reset_scripts/reset_batteries.sql first if batteries exist.
--
-- HOW TO RUN:
-- From project root folder (i.e. RENERA/BADB_main/), run psql connected to badb_app_v1. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_scripts/reset_separators.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM battery_sep_config) THEN
    RAISE EXCEPTION
      'reset_separators.sql aborted: battery_sep_config still has rows. Run sql_scripts/reset_scripts/reset_batteries.sql first.';
  END IF;
END;
$$;

DELETE FROM separators;

ALTER SEQUENCE separators_sep_id_seq RESTART WITH 1;

COMMIT;
