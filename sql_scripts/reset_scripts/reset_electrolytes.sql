-- CLEAR ALL ELECTROLYTE RECORDS and restart the electrolyte_id counter.
-- IMPORTANT: this removes only rows from electrolytes and keeps users and
-- all other reference/component tables.
--
-- SAFETY RULE:
-- This script aborts if battery records still reference electrolytes.
-- Run sql_scripts/reset_batteries.sql first if batteries exist.
--
-- HOW TO RUN:
-- From project root folder, run psql. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_electrolytes.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM battery_electrolyte) THEN
    RAISE EXCEPTION
      'reset_electrolytes.sql aborted: battery_electrolyte still has rows. Run sql_scripts/reset_batteries.sql first.';
  END IF;
END;
$$;

DELETE FROM electrolytes;

ALTER SEQUENCE electrolytes_electrolyte_id_seq RESTART WITH 1;

COMMIT;
