-- 008: Allow tapes to be created without project/recipe (empty new tape)
-- project_id and tape_recipe_id become optional, defaulting to NULL.

ALTER TABLE tapes ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE tapes ALTER COLUMN tape_recipe_id DROP NOT NULL;
