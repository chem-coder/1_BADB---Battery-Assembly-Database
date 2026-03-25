-- CLEAR ALL ELECTRODE RECORDS and restart electrode-related ID counters.
-- IMPORTANT: this removes electrode-derived data (cut batches, electrodes,
-- foil masses, drying), and clears battery-side reference tables only as needed
-- to satisfy foreign-key constraints. It keeps tapes and all upstream/reference
-- tables such as recipes, materials, projects, users, separators, electrolytes, etc.
--
-- SAFETY RULE:
-- This script aborts if any battery still references electrodes or cut-batch
-- provenance. Run sql_scripts/reset_batteries.sql first if batteries exist.
--
-- HOW TO RUN:
-- From project root folder, run psql. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_electrodes.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM battery_electrodes) THEN
    RAISE EXCEPTION
      'reset_electrodes.sql aborted: batteries still reference electrodes. Run sql_scripts/reset_batteries.sql first.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM battery_electrode_sources
    WHERE cut_batch_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'reset_electrodes.sql aborted: battery provenance still references cut batches. Run sql_scripts/reset_batteries.sql first.';
  END IF;
END;
$$;

TRUNCATE TABLE
  battery_electrode_sources,
  battery_electrodes,
  foil_mass_measurements,
  electrode_drying,
  electrodes,
  electrode_cut_batches
RESTART IDENTITY;

COMMIT;
