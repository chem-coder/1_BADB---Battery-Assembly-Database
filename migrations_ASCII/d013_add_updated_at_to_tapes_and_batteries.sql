-- d013: add updated_at tracking columns to tapes and batteries
-- This migration only introduces the columns and backfills existing rows.
-- Trigger-based automatic updates belong in the follow-up migration.

ALTER TABLE tapes
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE tapes
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE tapes
ALTER COLUMN updated_at SET NOT NULL;


ALTER TABLE batteries
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE batteries
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE batteries
ALTER COLUMN updated_at SET NOT NULL;
