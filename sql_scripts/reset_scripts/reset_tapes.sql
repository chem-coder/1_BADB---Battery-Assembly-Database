-- CLEAR ALL TAPE RECORDS and restart tape-related ID counters.
-- IMPORTANT: this removes tape-derived data (cut batches, electrodes, foil masses,
-- drying, process steps, actual measurements), and clears battery-side reference
-- tables only as needed to satisfy foreign-key constraints. It keeps
-- reference/component tables such as recipes, materials, projects, users,
-- separators, electrolytes, etc.
--
-- SAFETY RULE:
-- This script aborts if any battery still references tape-derived electrodes or
-- provenance. Run sql_scripts/reset_batteries.sql first if batteries exist.
--
-- HOW TO RUN:
-- From project root folder, run psql. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_tapes.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM battery_electrodes be
    JOIN electrodes e ON e.electrode_id = be.electrode_id
  ) THEN
    RAISE EXCEPTION
      'reset_tapes.sql aborted: some electrodes are still used in batteries. Run sql_scripts/reset_batteries.sql first.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM battery_electrode_sources
    WHERE tape_id IS NOT NULL OR cut_batch_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'reset_tapes.sql aborted: battery provenance still references tapes/cut batches. Run sql_scripts/reset_batteries.sql first.';
  END IF;
END;
$$;

TRUNCATE TABLE
  battery_electrode_sources,
  battery_electrodes,
  tape_recipe_line_actuals,
  tape_step_mixing,
  tape_step_drying,
  tape_step_coating,
  tape_step_calendering,
  tape_process_steps,
  foil_mass_measurements,
  electrode_drying,
  electrodes,
  electrode_cut_batches,
  tapes
RESTART IDENTITY;

COMMIT;
