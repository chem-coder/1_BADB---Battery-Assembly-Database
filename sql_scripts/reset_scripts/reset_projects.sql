-- CLEAR ALL PROJECT RECORDS and restart the project_id counter.
-- IMPORTANT: this removes only projects, but keeps users and all other
-- reference/component tables.
--
-- SAFETY RULE:
-- This script aborts if tapes or batteries still reference projects.
-- Run sql_scripts/reset_scripts/reset_batteries.sql and sql_scripts/reset_scripts/reset_tapes.sql first
-- if workflow data still exists.
--
-- HOW TO RUN:
-- From project root folder (i.e. RENERA/BADB_main/), run psql connected to badb_app_v1. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_scripts/reset_projects.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM batteries) THEN
    RAISE EXCEPTION
      'reset_projects.sql aborted: batteries still exist. Run sql_scripts/reset_scripts/reset_batteries.sql first.';
  END IF;

  IF EXISTS (SELECT 1 FROM tapes) THEN
    RAISE EXCEPTION
      'reset_projects.sql aborted: tapes still exist. Run sql_scripts/reset_scripts/reset_tapes.sql first.';
  END IF;
END;
$$;

DELETE FROM projects;

ALTER SEQUENCE projects_project_id_seq RESTART WITH 1;

COMMIT;
