BEGIN;

UPDATE tape_step_coating AS c
SET coating_sidedness = CASE
  WHEN cm.name = 'dr_blade' THEN 'one_sided'
  WHEN cm.name = 'coater_machine' THEN 'two_sided'
  ELSE c.coating_sidedness
END
FROM coating_methods AS cm
WHERE cm.coating_id = c.coating_id
  AND c.coating_sidedness IS NULL
  AND cm.name IN ('dr_blade', 'coater_machine');

COMMIT;
