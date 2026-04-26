BEGIN;

ALTER TABLE tape_step_coating
ADD COLUMN IF NOT EXISTS coating_sidedness TEXT;

ALTER TABLE tape_step_coating
DROP CONSTRAINT IF EXISTS tape_step_coating_coating_sidedness_chk;

ALTER TABLE tape_step_coating
ADD CONSTRAINT tape_step_coating_coating_sidedness_chk
CHECK (
  coating_sidedness IS NULL
  OR coating_sidedness IN ('one_sided', 'two_sided')
);

COMMIT;
