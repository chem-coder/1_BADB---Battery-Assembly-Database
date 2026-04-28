function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function saveSeparatorConfig(pool, payload) {
  const batteryId = Number(payload.battery_id);
  const separatorId = payload.separator_id ? Number(payload.separator_id) : null;

  const result = await pool.query(
    `
    INSERT INTO battery_sep_config (
      battery_id,
      separator_id,
      separator_notes
    )
    VALUES ($1,$2,$3)
    ON CONFLICT (battery_id)
    DO UPDATE SET
      separator_id = EXCLUDED.separator_id,
      separator_notes = EXCLUDED.separator_notes
    RETURNING *
    `,
    [
      batteryId,
      separatorId,
      payload.separator_notes || null
    ]
  );

  return result.rows[0];
}

async function getSeparatorConfig(pool, batteryId) {
  const result = await pool.query(
    `
    SELECT
      battery_id,
      separator_id,
      separator_notes
    FROM battery_sep_config
    WHERE battery_id = $1
    `,
    [batteryId]
  );

  return result.rows[0] || null;
}

async function updateSeparatorConfig(pool, batteryId, payload) {
  const result = await pool.query(
    `
    UPDATE battery_sep_config
    SET
      separator_id = $1,
      separator_notes = $2
    WHERE battery_id = $3
    RETURNING
      battery_id,
      separator_id,
      separator_notes
    `,
    [
      payload.separator_id ? Number(payload.separator_id) : null,
      payload.separator_notes || null,
      batteryId
    ]
  );

  if (result.rows.length === 0) {
    throw statusError('Конфигурация сепаратора не найдена', 404);
  }

  return result.rows[0];
}

async function saveElectrolyteConfig(pool, payload) {
  const batteryId = Number(payload.battery_id);
  const electrolyteId = payload.electrolyte_id ? Number(payload.electrolyte_id) : null;

  const result = await pool.query(
    `
    INSERT INTO battery_electrolyte (
      battery_id,
      electrolyte_id,
      electrolyte_notes,
      electrolyte_total_ul
    )
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (battery_id)
    DO UPDATE SET
      electrolyte_id = EXCLUDED.electrolyte_id,
      electrolyte_notes = EXCLUDED.electrolyte_notes,
      electrolyte_total_ul = EXCLUDED.electrolyte_total_ul
    RETURNING *
    `,
    [
      batteryId,
      electrolyteId,
      payload.electrolyte_notes || null,
      payload.electrolyte_total_ul ?? null
    ]
  );

  return result.rows[0];
}

async function getElectrolyteConfig(pool, batteryId) {
  const result = await pool.query(
    `
    SELECT
      battery_id,
      electrolyte_id,
      electrolyte_notes,
      electrolyte_total_ul
    FROM battery_electrolyte
    WHERE battery_id = $1
    `,
    [batteryId]
  );

  return result.rows[0] || null;
}

async function updateElectrolyteConfig(pool, batteryId, payload) {
  const result = await pool.query(
    `
    UPDATE battery_electrolyte
    SET
      electrolyte_id = $1,
      electrolyte_notes = $2,
      electrolyte_total_ul = $3
    WHERE battery_id = $4
    RETURNING
      battery_id,
      electrolyte_id,
      electrolyte_notes,
      electrolyte_total_ul
    `,
    [
      payload.electrolyte_id ? Number(payload.electrolyte_id) : null,
      payload.electrolyte_notes || null,
      payload.electrolyte_total_ul ?? null,
      batteryId
    ]
  );

  if (result.rows.length === 0) {
    throw statusError('Конфигурация электролита не найдена', 404);
  }

  return result.rows[0];
}

module.exports = {
  getElectrolyteConfig,
  getSeparatorConfig,
  saveElectrolyteConfig,
  saveSeparatorConfig,
  updateElectrolyteConfig,
  updateSeparatorConfig
};
