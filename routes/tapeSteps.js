const { Router } = require('express');
const pool = require('../db/pool');
const router = Router();


// --------- GENERAL/GENERIC STEP READING (for any operation type) --------

/*
operation_types

operation_type_id |        code         |        display        | ui_order
-------------------+---------------------+-----------------------+----------
                1 | drying_am           | Drying AM             |        0
                2 | weighing            | Weighing              |        1
                3 | mixing              | Mixing                |        2
                4 | coating             | Coating               |        3
                5 | drying_tape         | Drying (tape)         |        4
                6 | calendering         | Calendering           |        5
                7 | drying_pressed_tape | Drying (pressed tape) |        6
*/

// WRITE (dispatcher): POST /api/tapes/:id/steps/by-code/:code
router.post('/:id/steps/by-code/:code', async (req, res) => {
  const tapeId = Number(req.params.id);
  const code = String(req.params.code || '').trim();

  if (!Number.isInteger(tapeId) || !code) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // DRYING codes -> forward to existing drying save logic by duplicating the same SQL here
  if (code === 'drying_am' || code === 'drying_tape' || code === 'drying_pressed_tape') {
    const {
      performed_by,
      started_at,
      comments,
      temperature_c,
      atmosphere,
      target_duration_min,
      other_parameters
    } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id by code
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );
      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }
      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) upsert base step (unique: tape_id + operation_type_id)
      const step = await client.query(
        `
        INSERT INTO tape_process_steps (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;

      // 3) upsert drying subtype
      await client.query(
        `
        INSERT INTO tape_step_drying
          (step_id, temperature_c, atmosphere, target_duration_min, other_parameters)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (step_id)
        DO UPDATE SET
          temperature_c = EXCLUDED.temperature_c,
          atmosphere = EXCLUDED.atmosphere,
          target_duration_min = EXCLUDED.target_duration_min,
          other_parameters = EXCLUDED.other_parameters
        `,
        [
          stepId,
          Number.isFinite(Number(temperature_c)) ? Number(temperature_c) : null,
          atmosphere || null,
          Number.isFinite(Number(target_duration_min)) ? Number(target_duration_min) : null,
          other_parameters || null
        ]
      );

      await client.query('COMMIT');
      return res.status(201).json({ step_id: stepId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save drying step' });
    } finally {
      client.release();
    }
  }

  // WEIGHING (header only, no subtype table)
  if (code === 'weighing') {
    const {
      performed_by,
      started_at,
      comments
    } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );

      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }

      const operationTypeId = ot.rows[0].operation_type_id;

      const step = await client.query(
        `
        INSERT INTO tape_process_steps
          (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      await client.query('COMMIT');
      return res.status(201).json({ step_id: step.rows[0].step_id });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save weighing step' });
    } finally {
      client.release();
    }
  }

  // MIXING (header + tape_step_mixing)
  if (code === 'mixing') {
    const {
      performed_by,
      started_at,
      comments,
      slurry_volume_ml,
      dry_mixing_id,
      dry_start_time,
      dry_duration_min,
      dry_rpm,
      wet_mixing_id,
      wet_start_time,
      wet_duration_min,
      wet_rpm,
      viscosity_cP
    } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id by code
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );
      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }
      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) upsert base step
      const step = await client.query(
        `
        INSERT INTO tape_process_steps (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;

      // 3) upsert mixing subtype
      await client.query(
        `
        INSERT INTO tape_step_mixing
          (step_id, slurry_volume_ml,
          dry_mixing_id, dry_start_time, dry_duration_min, dry_rpm,
          wet_mixing_id, wet_start_time, wet_duration_min, wet_rpm,
          viscosity_cP)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (step_id)
        DO UPDATE SET
          slurry_volume_ml  = EXCLUDED.slurry_volume_ml,
          dry_mixing_id     = EXCLUDED.dry_mixing_id,
          dry_start_time    = EXCLUDED.dry_start_time,
          dry_duration_min  = EXCLUDED.dry_duration_min,
          dry_rpm           = EXCLUDED.dry_rpm,
          wet_mixing_id     = EXCLUDED.wet_mixing_id,
          wet_start_time    = EXCLUDED.wet_start_time,
          wet_duration_min  = EXCLUDED.wet_duration_min,
          wet_rpm           = EXCLUDED.wet_rpm,
          viscosity_cP      = EXCLUDED.viscosity_cP
        `,
        [
          stepId,
          Number.isFinite(Number(slurry_volume_ml)) ? Number(slurry_volume_ml) : null,

          Number(dry_mixing_id) || null,
          dry_start_time || null,
          Number.isFinite(Number(dry_duration_min)) ? Number(dry_duration_min) : null,
          dry_rpm || null,

          Number(wet_mixing_id) || null,
          wet_start_time || null,
          Number.isFinite(Number(wet_duration_min)) ? Number(wet_duration_min) : null,
          wet_rpm || null,

          Number.isFinite(Number(viscosity_cP)) ? Number(viscosity_cP) : null
        ]
      );

      await client.query('COMMIT');
      return res.status(201).json({ step_id: stepId });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save mixing step' });
    } finally {
      client.release();
    }
  }

  // COATING (header + tape_step_coating)
  if (code === 'coating') {
    const {
      performed_by,
      started_at,
      comments,
      foil_id,
      coating_id
    } = req.body || {};

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );

      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }

      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) upsert base step
      const step = await client.query(
        `
        INSERT INTO tape_process_steps
          (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;

      // 3) upsert coating subtype
      await client.query(
        `
        INSERT INTO tape_step_coating
          (step_id, foil_id, coating_id)
        VALUES ($1,$2,$3)
        ON CONFLICT (step_id)
        DO UPDATE SET
          foil_id = EXCLUDED.foil_id,
          coating_id = EXCLUDED.coating_id
        `,
        [
          stepId,
          Number(foil_id) || null,
          Number(coating_id) || null
        ]
      );

      await client.query('COMMIT');
      return res.status(201).json({ step_id: stepId });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save coating step' });
    } finally {
      client.release();
    }
  }

  // CALENDERING (header + tape_step_calendering)
  if (code === 'calendering') {
    const {
      performed_by,
      started_at,
      comments,
      temp_c,
      pressure_value,
      pressure_units,
      draw_speed_m_min,
      other_params,
      init_thickness_microns,
      final_thickness_microns,
      no_passes,
      appearance
    } = req.body || {};

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );

      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }

      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) upsert base step
      const step = await client.query(
        `
        INSERT INTO tape_process_steps
          (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;

      // 3) upsert calendering subtype
      await client.query(
        `
        INSERT INTO tape_step_calendering (
          step_id,
          temp_c,
          pressure_value,
          pressure_units,
          draw_speed_m_min,
          other_params,
          init_thickness_microns,
          final_thickness_microns,
          no_passes,
          appearance
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (step_id)
        DO UPDATE SET
          temp_c = EXCLUDED.temp_c,
          pressure_value = EXCLUDED.pressure_value,
          pressure_units = EXCLUDED.pressure_units,
          draw_speed_m_min = EXCLUDED.draw_speed_m_min,
          other_params = EXCLUDED.other_params,
          init_thickness_microns = EXCLUDED.init_thickness_microns,
          final_thickness_microns = EXCLUDED.final_thickness_microns,
          no_passes = EXCLUDED.no_passes,
          appearance = EXCLUDED.appearance
        `,
        [
          stepId,
          Number.isFinite(Number(temp_c)) ? Number(temp_c) : null,
          Number.isFinite(Number(pressure_value)) ? Number(pressure_value) : null,
          pressure_units || null,
          Number.isFinite(Number(draw_speed_m_min)) ? Number(draw_speed_m_min) : null,
          other_params || null,
          Number.isFinite(Number(init_thickness_microns)) ? Number(init_thickness_microns) : null,
          Number.isFinite(Number(final_thickness_microns)) ? Number(final_thickness_microns) : null,
          Number.isFinite(Number(no_passes)) ? Number(no_passes) : null,
          appearance || null
        ]
      );

      await client.query('COMMIT');
      return res.status(201).json({ step_id: stepId });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save calendering step' });
    } finally {
      client.release();
    }
  }

  return res.status(501).json({ error: `No saver implemented for code: ${code}` });
});

// READ
router.get('/:id/steps/by-code/:code', async (req, res) => {
  const tapeId = Number(req.params.id);
  const code = String(req.params.code || '').trim();

  if (!Number.isInteger(tapeId) || !code) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  try {
    // Determine subtype join
    let subtypeJoin = '';
    let subtypeSelect = '';

    if (
      code === 'drying_am' ||
      code === 'drying_tape' ||
      code === 'drying_pressed_tape'
    ) {
      subtypeJoin = `
        LEFT JOIN tape_step_drying d
          ON d.step_id = s.step_id
      `;
      subtypeSelect = `
        d.temperature_c,
        d.atmosphere,
        d.target_duration_min,
        d.other_parameters
      `;
    }

    if (code === 'mixing') {
      subtypeJoin = `
        LEFT JOIN tape_step_mixing m
          ON m.step_id = s.step_id
      `;
      subtypeSelect = `
        m.slurry_volume_ml,
        m.dry_mixing_id,
        m.dry_start_time,
        m.dry_duration_min,
        m.dry_rpm,
        m.wet_mixing_id,
        m.wet_start_time,
        m.wet_duration_min,
        m.wet_rpm,
        m.viscosity_cP
      `;
    }

    if (code === 'coating') {
      subtypeJoin = `
        LEFT JOIN tape_step_coating c
          ON c.step_id = s.step_id
      `;
      subtypeSelect = `
        c.foil_id,
        c.coating_id
      `;
    }

    if (code === 'calendering') {
      subtypeJoin = `
        LEFT JOIN tape_step_calendering cal
          ON cal.step_id = s.step_id
      `;
      subtypeSelect = `
        cal.temp_c,
        cal.pressure_value,
        cal.pressure_units,
        cal.draw_speed_m_min,
        cal.other_params,
        cal.init_thickness_microns,
        cal.final_thickness_microns,
        cal.no_passes,
        cal.appearance
      `;
    }

    const result = await pool.query(
      `
      SELECT
        s.step_id,
        s.tape_id,
        s.operation_type_id,
        s.performed_by,
        s.started_at,
        s.comments
        ${subtypeSelect ? ',' + subtypeSelect : ''}
      FROM tape_process_steps s
      JOIN operation_types ot
        ON ot.operation_type_id = s.operation_type_id
      ${subtypeJoin}
      WHERE s.tape_id = $1
        AND ot.code = $2
      `,
      [tapeId, code]
    );

    res.json(result.rows[0] || null);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load step' });
  }
});

// UPDATE

// DELETE


module.exports = router;
