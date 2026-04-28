class BatteryElectrodeStackConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BatteryElectrodeStackConflictError';
    this.statusCode = 409;
  }
}

async function saveBatteryElectrodeStack(pool, batteryId, stack) {
  const nextElectrodeIds = stack
    .map((row) => Number(row.electrode_id))
    .filter((electrodeId) => Number.isInteger(electrodeId));

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `
      UPDATE electrodes
      SET
        status_code = 1,
        used_in_battery_id = NULL
      WHERE used_in_battery_id = $1
        AND NOT (electrode_id = ANY($2::int[]))
      `,
      [batteryId, nextElectrodeIds]
    );

    await client.query(
      `DELETE FROM battery_electrodes WHERE battery_id = $1`,
      [batteryId]
    );

    for (const row of stack) {
      await client.query(
        `
        INSERT INTO battery_electrodes (
          battery_id,
          electrode_id,
          role,
          position_index
        )
        VALUES ($1,$2,$3,$4)
        `,
        [
          batteryId,
          row.electrode_id,
          row.role,
          row.position_index
        ]
      );

      const updateResult = await client.query(
        `
        UPDATE electrodes
        SET
          status_code = 2,
          used_in_battery_id = $1
        WHERE electrode_id = $2
          AND (
            status_code = 1 OR
            used_in_battery_id = $1
          )
        RETURNING electrode_id
        `,
        [
          batteryId,
          row.electrode_id
        ]
      );

      if (updateResult.rows.length === 0) {
        throw new BatteryElectrodeStackConflictError(
          `Электрод ${row.electrode_id} уже используется или недоступен`
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function fetchBatteryElectrodeStack(queryable, batteryId) {
  const result = await queryable.query(
    `
    SELECT
      electrode_id,
      role,
      position_index
    FROM battery_electrodes
    WHERE battery_id = $1
    ORDER BY position_index
    `,
    [batteryId]
  );

  return result.rows;
}

module.exports = {
  BatteryElectrodeStackConflictError,
  fetchBatteryElectrodeStack,
  saveBatteryElectrodeStack
};
