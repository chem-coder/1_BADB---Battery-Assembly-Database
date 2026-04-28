const { trackChanges } = require('../middleware/trackChanges');
const { collectDependencyConflicts } = require('../utils/dependencyConflicts');
const { fetchWorkflowStatusMap } = require('./tapeWorkflowService');

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseOptionalId(value) {
  return value ? Number(value) : null;
}

function defaultWorkflowStatus() {
  return {
    workflow_status_code: 'recipe_materials',
    workflow_status_label: 'Выбор экземпляров',
    workflow_complete: false
  };
}

async function createTape(pool, payload, createdBy) {
  const projectId = parseOptionalId(payload.project_id);
  const recipeId = parseOptionalId(payload.tape_recipe_id);

  const result = await pool.query(
    `
    INSERT INTO tapes (
      name,
      project_id,
      tape_recipe_id,
      created_by,
      created_at,
      updated_at,
      notes,
      calc_mode,
      target_mass_g
    )
    VALUES ($1,$2,$3,$4,now(),now(),$5,$6,$7)
    RETURNING *
    `,
    [
      payload.name,
      projectId,
      recipeId,
      createdBy,
      payload.notes ?? null,
      payload.calc_mode ?? null,
      payload.target_mass_g ?? null
    ]
  );

  return result.rows[0];
}

async function listTapes(pool, role) {
  const baseQuery = `
    SELECT
      t.tape_id,
      t.name,
      t.project_id,
      t.tape_recipe_id,
      t.created_by,
      t.created_at,
      t.updated_at,
      t.status,
      t.availability_status,
      t.notes,
      t.calc_mode,
      t.target_mass_g,
      r.role,
      r.name AS recipe_name,
      p.name AS project_name,
      u_created.name AS created_by_name,
      t.updated_by,
      t.updated_at,
      u_updated.name AS updated_by_name,
      (
        SELECT string_agg(DISTINCT u.name, ', ' ORDER BY u.name)
        FROM tape_process_steps ts
        JOIN users u ON u.user_id = ts.performed_by
        WHERE ts.tape_id = t.tape_id
      ) AS operators,
      (
        SELECT COUNT(DISTINCT ot2.code)
        FROM tape_process_steps ts2
        JOIN operation_types ot2 ON ot2.operation_type_id = ts2.operation_type_id
        WHERE ts2.tape_id = t.tape_id
      ) AS completed_steps,
      (
        SELECT c.coating_sidedness
        FROM tape_process_steps ts3
        JOIN operation_types ot3 ON ot3.operation_type_id = ts3.operation_type_id
        JOIN tape_step_coating c ON c.step_id = ts3.step_id
        WHERE ts3.tape_id = t.tape_id
          AND ot3.code = 'coating'
        LIMIT 1
      ) AS coating_sidedness
    FROM tapes t
    LEFT JOIN tape_recipes r ON r.tape_recipe_id = t.tape_recipe_id
    LEFT JOIN projects p ON p.project_id = t.project_id
    LEFT JOIN users u_created ON u_created.user_id = t.created_by
    LEFT JOIN users u_updated ON u_updated.user_id = t.updated_by
  `;

  const result = role
    ? await pool.query(baseQuery + ' WHERE r.role = $1 ORDER BY t.created_at DESC', [role])
    : await pool.query(baseQuery + ' ORDER BY t.created_at DESC');

  const rows = result.rows || [];
  const statusMap = await fetchWorkflowStatusMap(pool, rows.map((row) => row.tape_id));

  return rows.map((row) => ({
    ...row,
    ...(statusMap.get(Number(row.tape_id)) || defaultWorkflowStatus())
  }));
}

async function updateTape(pool, id, payload, userId) {
  const projectId = parseOptionalId(payload.project_id);
  const recipeId = parseOptionalId(payload.tape_recipe_id);

  const current = await pool.query(
    'SELECT name, project_id, tape_recipe_id, created_by, notes, calc_mode, target_mass_g FROM tapes WHERE tape_id = $1',
    [id]
  );

  if (current.rowCount === 0) {
    throw statusError('Лента не найдена', 404);
  }

  const result = await pool.query(
    `
    UPDATE tapes
    SET
      name = $1,
      project_id = $2,
      tape_recipe_id = $3,
      created_by = $4,
      notes = $5,
      calc_mode = $6,
      target_mass_g = $7,
      updated_by = $8,
      updated_at = now()
    WHERE tape_id = $9
    RETURNING *
    `,
    [
      payload.name,
      projectId,
      recipeId,
      current.rows[0].created_by,
      payload.notes ?? null,
      payload.calc_mode ?? null,
      payload.target_mass_g ?? null,
      userId,
      id
    ]
  );

  if (result.rowCount === 0) {
    throw statusError('Лента не найдена', 404);
  }

  await trackChanges(
    pool,
    'tape',
    'tapes',
    'tape_id',
    id,
    current.rows[0],
    {
      name: payload.name,
      project_id: projectId,
      tape_recipe_id: recipeId,
      created_by: current.rows[0].created_by,
      notes: payload.notes ?? null,
      calc_mode: payload.calc_mode ?? null,
      target_mass_g: payload.target_mass_g ?? null
    },
    userId
  );

  return result.rows[0];
}

async function collectTapeDeleteDependencies(pool, tapeId) {
  return collectDependencyConflicts(pool, [
    {
      key: 'battery_electrode_sources',
      label: 'аккумуляторы, где эта лента выбрана как источник электродов',
      query: `
        SELECT DISTINCT b.battery_id AS id, b.battery_notes AS name
        FROM battery_electrode_sources bes
        JOIN batteries b ON b.battery_id = bes.battery_id
        LEFT JOIN electrode_cut_batches ecb ON ecb.cut_batch_id = bes.cut_batch_id
        WHERE bes.tape_id = $1 OR ecb.tape_id = $1
        ORDER BY b.battery_id
        LIMIT 25
      `,
      params: [tapeId]
    },
    {
      key: 'battery_electrodes',
      label: 'аккумуляторы с электродами из этой ленты',
      query: `
        SELECT DISTINCT b.battery_id AS id, b.battery_notes AS name
        FROM battery_electrodes be
        JOIN batteries b ON b.battery_id = be.battery_id
        JOIN electrodes e ON e.electrode_id = be.electrode_id
        JOIN electrode_cut_batches ecb ON ecb.cut_batch_id = e.cut_batch_id
        WHERE ecb.tape_id = $1
        ORDER BY b.battery_id
        LIMIT 25
      `,
      params: [tapeId]
    }
  ]);
}

async function deleteTape(pool, tapeId) {
  const result = await pool.query(
    `DELETE FROM tapes WHERE tape_id = $1`,
    [tapeId]
  );

  if (result.rowCount === 0) {
    throw statusError('Лента не найдена', 404);
  }

  return { success: true };
}

module.exports = {
  collectTapeDeleteDependencies,
  createTape,
  deleteTape,
  listTapes,
  updateTape
};
