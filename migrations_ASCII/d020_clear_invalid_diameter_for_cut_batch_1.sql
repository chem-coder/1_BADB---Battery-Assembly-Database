UPDATE electrode_cut_batches
SET diameter_mm = NULL
WHERE cut_batch_id = 1
  AND shape = 'rectangle';
