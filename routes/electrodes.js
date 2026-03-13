const { Router } = require('express');
const pool = require('../db/pool');

// Routes mounted at /api/electrodes
const electrodesRouter = Router();

// Routes mounted at /api/electrode-cut-batches (nested electrodes + drying)
const batchElectrodesRouter = Router();

// Routes mounted at /api/electrode-drying
const electrodeDryingRouter = Router();


// -------- ELECTRODES --------

// CREATE electrode
electrodesRouter.post('/', async (req, res) => {
  const {
    cut_batch_id,
    electrode_mass_g,
    cup_number,
    comments
  } = req.body;

  const mass = Number(electrode_mass_g);

  if (
    !Number.isInteger(cut_batch_id) ||
    !Number.isFinite(mass) ||
    mass <= 0
  ) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO electrodes (
        cut_batch_id,
        electrode_mass_g,
        cup_number,
        comments
      )
      VALUES ($1,$2,$3,$4)
      RETURNING *
      `,
      [
        cut_batch_id,
        mass,
        cup_number || null,
        comments || null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });

  }
});

// GET electrodes by batch
batchElectrodesRouter.get('/:id/electrodes', async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM electrodes
      WHERE cut_batch_id = $1
      ORDER BY
        status_code ASC,
        electrode_mass_g ASC,
        electrode_id ASC
      `,
      [cutBatchId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE electrode status
electrodesRouter.put('/:id/status', async (req, res) => {
  const electrodeId = Number(req.params.id);
  const { status_code, used_in_battery_id, scrapped_reason } = req.body;

  if (!Number.isInteger(electrodeId) || !Number.isInteger(status_code)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  if (![1,2,3].includes(status_code)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }

  if (status_code === 3 && !scrapped_reason) {
    return res.status(400).json({ error: 'Нужно указать причину списания' });
  }

  if (status_code === 2 && !used_in_battery_id) {
    return res.status(400).json({ error: 'Нужно указать батарею' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE electrodes
      SET status_code = $1,
          used_in_battery_id = $2,
          scrapped_reason = $3
      WHERE electrode_id = $4
      RETURNING *
      `,
      [
        status_code,
        used_in_battery_id || null,
        scrapped_reason || null,
        electrodeId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Электрод не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE electrode fields (mass, cup, comments)
electrodesRouter.put('/:id', async (req, res) => {

  const electrodeId = Number(req.params.id);
  const {
    electrode_mass_g,
    cup_number,
    comments
  } = req.body;

  if (!Number.isInteger(electrodeId)) {
    return res.status(400).json({ error: 'Invalid electrode id' });
  }

  try {

    const result = await pool.query(
      `
      UPDATE electrodes
      SET
        electrode_mass_g = COALESCE($1, electrode_mass_g),
        cup_number = COALESCE($2, cup_number),
        comments = COALESCE($3, comments)
      WHERE electrode_id = $4
      RETURNING *
      `,
      [
        electrode_mass_g ?? null,
        cup_number ?? null,
        comments ?? null,
        electrodeId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Electrode not found' });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Server error' });

  }

});

// DELETE single electrode
electrodesRouter.delete('/:id', async (req, res) => {

  const electrodeId = Number(req.params.id);

  if (!Number.isInteger(electrodeId)) {
    return res.status(400).json({ error: 'Invalid electrode id' });
  }

  try {

    const check = await pool.query(
      `
      SELECT used_in_battery_id
      FROM electrodes
      WHERE electrode_id = $1
      `,
      [electrodeId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Electrode not found' });
    }

    if (check.rows[0].used_in_battery_id) {
      return res.status(400).json({
        error: 'Electrode already used in a battery and cannot be deleted'
      });
    }

    await pool.query(
      `
      DELETE FROM electrodes
      WHERE electrode_id = $1
      `,
      [electrodeId]
    );

    res.json({ success: true });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Server error' });

  }

});


// -------- ELECTRODE DRYING --------

// CREATE or UPDATE drying record (UPSERT)
batchElectrodesRouter.post('/:id/drying', async (req, res) => {

  const cutBatchId = Number(req.params.id);

  const {
    start_time,
    end_time,
    temperature_c,
    other_parameters,
    comments
  } = req.body;

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {

    const result = await pool.query(
      `
      INSERT INTO electrode_drying (
        cut_batch_id,
        start_time,
        end_time,
        temperature_c,
        other_parameters,
        comments
      )
      VALUES ($1,$2,$3,$4,$5,$6)

      ON CONFLICT (cut_batch_id)
      DO UPDATE SET
        start_time       = EXCLUDED.start_time,
        end_time         = EXCLUDED.end_time,
        temperature_c    = EXCLUDED.temperature_c,
        other_parameters = EXCLUDED.other_parameters,
        comments         = EXCLUDED.comments

      RETURNING *
      `,
      [
        cutBatchId,
        start_time || null,
        end_time || null,
        temperature_c || null,
        other_parameters || null,
        comments || null
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });

  }

});

// GET drying records by batch
batchElectrodesRouter.get('/:id/drying', async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM electrode_drying
      WHERE cut_batch_id = $1
      LIMIT 1
      `,
      [cutBatchId]
    );

    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT update drying record
electrodeDryingRouter.put('/:id', async (req, res) => {
  const dryingId = Number(req.params.id);
  const { start_time, end_time, temperature_c, other_parameters, comments } = req.body;

  if (!Number.isInteger(dryingId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE electrode_drying
      SET start_time = $1,
          end_time = $2,
          temperature_c = $3,
          other_parameters = $4,
          comments = $5
      WHERE drying_id = $6
      RETURNING *
      `,
      [
        start_time || null,
        end_time || null,
        temperature_c || null,
        other_parameters || null,
        comments || null,
        dryingId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE drying record
electrodeDryingRouter.delete('/:id', async (req, res) => {
  const dryingId = Number(req.params.id);

  if (!Number.isInteger(dryingId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    await pool.query(
      `DELETE FROM electrode_drying WHERE drying_id = $1`,
      [dryingId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


module.exports = { electrodesRouter, batchElectrodesRouter, electrodeDryingRouter };
