const { trackChanges } = require('../middleware/trackChanges');

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function createBattery(pool, payload, createdByUserId) {
  const projectId = Number(payload.project_id);

  const result = await pool.query(
    `
    INSERT INTO batteries (
      project_id,
      form_factor,
      created_by,
      created_at,
      updated_at,
      battery_notes
    )
    VALUES ($1, $2, $3, now(), now(), $4)
    RETURNING *
    `,
    [
      projectId,
      payload.form_factor,
      createdByUserId,
      payload.battery_notes || null
    ]
  );

  return result.rows[0];
}

async function listBatteries(pool) {
  const result = await pool.query(
    `
    SELECT
      b.battery_id,
      b.project_id,
      p.name AS project_name,
      b.form_factor,
      b.status,
      cc.coin_size_code,
      cathode_materials.active_material_names AS cathode_active_materials,
      cathode_batch.shape AS cathode_batch_shape,
      cathode_batch.diameter_mm AS cathode_batch_diameter_mm,
      cathode_batch.length_mm AS cathode_batch_length_mm,
      cathode_batch.width_mm AS cathode_batch_width_mm,
      anode_materials.active_material_names AS anode_active_materials,
      anode_batch.shape AS anode_batch_shape,
      anode_batch.diameter_mm AS anode_batch_diameter_mm,
      anode_batch.length_mm AS anode_batch_length_mm,
      anode_batch.width_mm AS anode_batch_width_mm,
      b.created_by,
      u_created.name AS created_by_name,
      b.battery_notes AS notes,
      b.created_at,
      b.updated_by,
      b.updated_at,
      u_updated.name AS updated_by_name
    FROM batteries b
    LEFT JOIN projects p
      ON p.project_id = b.project_id
    LEFT JOIN users u_created
      ON u_created.user_id = b.created_by
    LEFT JOIN users u_updated
      ON u_updated.user_id = b.updated_by
    LEFT JOIN battery_coin_config cc
      ON cc.battery_id = b.battery_id
    LEFT JOIN battery_electrode_sources cathode_src
      ON cathode_src.battery_id = b.battery_id
     AND cathode_src.role = 'cathode'
    LEFT JOIN tapes cathode_tape
      ON cathode_tape.tape_id = cathode_src.tape_id
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT m.name, ', ' ORDER BY m.name) AS active_material_names
      FROM tape_recipe_lines trl
      JOIN materials m
        ON m.material_id = trl.material_id
      WHERE trl.tape_recipe_id = cathode_tape.tape_recipe_id
        AND trl.recipe_role = 'cathode_active'
    ) cathode_materials
      ON TRUE
    LEFT JOIN electrode_cut_batches cathode_batch
      ON cathode_batch.cut_batch_id = cathode_src.cut_batch_id
    LEFT JOIN battery_electrode_sources anode_src
      ON anode_src.battery_id = b.battery_id
     AND anode_src.role = 'anode'
    LEFT JOIN tapes anode_tape
      ON anode_tape.tape_id = anode_src.tape_id
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT m.name, ', ' ORDER BY m.name) AS active_material_names
      FROM tape_recipe_lines trl
      JOIN materials m
        ON m.material_id = trl.material_id
      WHERE trl.tape_recipe_id = anode_tape.tape_recipe_id
        AND trl.recipe_role = 'anode_active'
    ) anode_materials
      ON TRUE
    LEFT JOIN electrode_cut_batches anode_batch
      ON anode_batch.cut_batch_id = anode_src.cut_batch_id
    ORDER BY b.battery_id DESC
    `
  );

  return result.rows;
}

async function getBattery(pool, batteryId) {
  const result = await pool.query(
    `
    SELECT
      b.battery_id,
      b.project_id,
      p.name AS project_name,
      b.form_factor,
      b.status,
      cc.coin_size_code,
      cathode_materials.active_material_names AS cathode_active_materials,
      cathode_batch.shape AS cathode_batch_shape,
      cathode_batch.diameter_mm AS cathode_batch_diameter_mm,
      cathode_batch.length_mm AS cathode_batch_length_mm,
      cathode_batch.width_mm AS cathode_batch_width_mm,
      anode_materials.active_material_names AS anode_active_materials,
      anode_batch.shape AS anode_batch_shape,
      anode_batch.diameter_mm AS anode_batch_diameter_mm,
      anode_batch.length_mm AS anode_batch_length_mm,
      anode_batch.width_mm AS anode_batch_width_mm,
      b.created_by,
      u.name AS created_by_name,
      b.battery_notes AS notes,
      b.created_at,
      b.updated_at
    FROM batteries b
    LEFT JOIN projects p
      ON p.project_id = b.project_id
    LEFT JOIN users u
      ON u.user_id = b.created_by
    LEFT JOIN battery_coin_config cc
      ON cc.battery_id = b.battery_id
    LEFT JOIN battery_electrode_sources cathode_src
      ON cathode_src.battery_id = b.battery_id
     AND cathode_src.role = 'cathode'
    LEFT JOIN tapes cathode_tape
      ON cathode_tape.tape_id = cathode_src.tape_id
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT m.name, ', ' ORDER BY m.name) AS active_material_names
      FROM tape_recipe_lines trl
      JOIN materials m
        ON m.material_id = trl.material_id
      WHERE trl.tape_recipe_id = cathode_tape.tape_recipe_id
        AND trl.recipe_role = 'cathode_active'
    ) cathode_materials
      ON TRUE
    LEFT JOIN electrode_cut_batches cathode_batch
      ON cathode_batch.cut_batch_id = cathode_src.cut_batch_id
    LEFT JOIN battery_electrode_sources anode_src
      ON anode_src.battery_id = b.battery_id
     AND anode_src.role = 'anode'
    LEFT JOIN tapes anode_tape
      ON anode_tape.tape_id = anode_src.tape_id
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT m.name, ', ' ORDER BY m.name) AS active_material_names
      FROM tape_recipe_lines trl
      JOIN materials m
        ON m.material_id = trl.material_id
      WHERE trl.tape_recipe_id = anode_tape.tape_recipe_id
        AND trl.recipe_role = 'anode_active'
    ) anode_materials
      ON TRUE
    LEFT JOIN electrode_cut_batches anode_batch
      ON anode_batch.cut_batch_id = anode_src.cut_batch_id
    WHERE b.battery_id = $1
    `,
    [batteryId]
  );

  if (result.rows.length === 0) {
    throw statusError('Батарея не найдена', 404);
  }

  return result.rows[0];
}

async function assertAssembledStatusAllowed(pool, batteryId, status) {
  if (status !== 'assembled') return;

  const check = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE role = 'anode') AS anodes,
      COUNT(*) FILTER (WHERE role = 'cathode') AS cathodes
    FROM battery_electrodes
    WHERE battery_id = $1
  `, [batteryId]);

  const { anodes, cathodes } = check.rows[0];

  const modeRes = await pool.query(`
    SELECT coin_cell_mode
    FROM battery_coin_config
    WHERE battery_id = $1
  `, [batteryId]);

  const mode = modeRes.rows[0]?.coin_cell_mode;

  if (mode === 'full_cell' && (anodes !== 1 || cathodes !== 1)) {
    throw statusError('Full cell must have exactly 1 anode and 1 cathode', 400);
  }

  if (mode === 'half_cell' && (anodes + cathodes) !== 1) {
    throw statusError('Half cell must have exactly 1 electrode', 400);
  }
}

async function updateBattery(pool, batteryId, payload, userId) {
  await assertAssembledStatusAllowed(pool, batteryId, payload.status);

  const currentRes = await pool.query(
    `
    SELECT
      project_id,
      form_factor,
      created_by,
      battery_notes,
      status
    FROM batteries
    WHERE battery_id = $1
    `,
    [batteryId]
  );

  if (currentRes.rows.length === 0) {
    throw statusError('Батарея не найдена', 404);
  }

  const current = currentRes.rows[0];

  const newVals = {
    project_id: payload.project_id !== undefined ? Number(payload.project_id) : current.project_id,
    form_factor: payload.form_factor !== undefined ? payload.form_factor : current.form_factor,
    created_by: current.created_by,
    battery_notes: payload.battery_notes !== undefined ? payload.battery_notes : current.battery_notes,
    status: payload.status !== undefined ? payload.status : current.status,
  };

  const result = await pool.query(
    `
    UPDATE batteries
    SET
      project_id = $1,
      form_factor = $2,
      created_by = $3,
      battery_notes = $4,
      status = $5,
      updated_by = $6,
      updated_at = now()
    WHERE battery_id = $7
    RETURNING
      battery_id,
      project_id,
      form_factor,
      created_by,
      battery_notes AS notes,
      status,
      created_at,
      updated_by,
      updated_at
    `,
    [newVals.project_id, newVals.form_factor, newVals.created_by, newVals.battery_notes, newVals.status, userId, batteryId]
  );

  if (result.rows.length === 0) {
    throw statusError('Батарея не найдена', 404);
  }

  await trackChanges(pool, 'battery', 'batteries', 'battery_id', batteryId, current, newVals, userId);

  return result.rows[0];
}

module.exports = {
  createBattery,
  getBattery,
  listBatteries,
  updateBattery
};
