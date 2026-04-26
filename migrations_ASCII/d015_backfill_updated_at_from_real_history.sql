BEGIN;

-- Temporarily disable user triggers so the d014 parent-row updated_at triggers
-- do not overwrite this one-time historical backfill with now().
ALTER TABLE public.tapes DISABLE TRIGGER USER;
ALTER TABLE public.batteries DISABLE TRIGGER USER;

-- For existing tapes, prefer the timestamp of the latest recorded process step.
-- Fall back to the tape's created_at, and only then to now() if neither exists.
WITH latest_tape_steps AS (
  SELECT
    tps.tape_id,
    MAX(tps.started_at) AS last_step_started_at
  FROM public.tape_process_steps tps
  GROUP BY tps.tape_id
)
UPDATE public.tapes t
SET updated_at = COALESCE(lts.last_step_started_at, t.created_at, NOW())
FROM latest_tape_steps lts
WHERE t.tape_id = lts.tape_id;

UPDATE public.tapes t
SET updated_at = COALESCE(t.created_at, NOW())
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tape_process_steps tps
  WHERE tps.tape_id = t.tape_id
);

-- For existing batteries, use created_at as the best available historical value.
-- Fall back to now() only if created_at is null.
UPDATE public.batteries b
SET updated_at = COALESCE(b.created_at, NOW());

ALTER TABLE public.tapes ENABLE TRIGGER USER;
ALTER TABLE public.batteries ENABLE TRIGGER USER;

COMMIT;
