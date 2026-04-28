function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function saveBatteryQc(pool, payload) {
  const batteryId = Number(payload.battery_id);

  const result = await pool.query(
    `
    INSERT INTO battery_qc (
      battery_id,
      ocv_v,
      esr_mohm,
      qc_notes
    )
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (battery_id)
    DO UPDATE SET
      ocv_v = EXCLUDED.ocv_v,
      esr_mohm = EXCLUDED.esr_mohm,
      qc_notes = EXCLUDED.qc_notes
    RETURNING *
    `,
    [
      batteryId,
      payload.ocv_v ?? null,
      payload.esr_mohm ?? null,
      payload.qc_notes || null
    ]
  );

  return result.rows[0];
}

async function getBatteryQc(pool, batteryId) {
  const result = await pool.query(
    `
    SELECT
      battery_id,
      ocv_v,
      esr_mohm,
      qc_notes
    FROM battery_qc
    WHERE battery_id = $1
    `,
    [batteryId]
  );

  return result.rows[0] || null;
}

async function updateBatteryQc(pool, batteryId, payload) {
  const result = await pool.query(
    `
    UPDATE battery_qc
    SET
      ocv_v = $1,
      esr_mohm = $2,
      qc_notes = $3
    WHERE battery_id = $4
    RETURNING
      battery_id,
      ocv_v,
      esr_mohm,
      qc_notes
    `,
    [
      payload.ocv_v ?? null,
      payload.esr_mohm ?? null,
      payload.qc_notes || null,
      batteryId
    ]
  );

  if (result.rows.length === 0) {
    throw statusError('Данные выходного контроля не найдены', 404);
  }

  return result.rows[0];
}

module.exports = {
  getBatteryQc,
  saveBatteryQc,
  updateBatteryQc
};
