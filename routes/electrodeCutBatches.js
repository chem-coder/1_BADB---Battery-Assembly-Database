const { Router } = require('express');
const pool = require('../db/pool');

// Routes mounted at /api/tapes (for-electrodes + nested electrode-cut-batches)
const tapesRouter = Router();

// Routes mounted at /api/electrode-cut-batches
const batchesRouter = Router();

// Routes mounted at /api/foil-measurements
const foilMeasurementsRouter = Router();


// -------- TAPES FOR ELECTRODE CUTTING DROPDOWN --------

tapesRouter.get('/for-electrodes', async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        t.tape_id,
        t.name,
        t.project_id,
        r.role,
        r.name AS recipe_name,
        u.name AS created_by,
        TO_CHAR(MAX(ps.started_at), 'YYYY-MM-DD') AS finished_at

      FROM tapes t

      JOIN tape_recipes r
        ON r.tape_recipe_id = t.tape_recipe_id

      LEFT JOIN users u
        ON u.user_id = t.created_by

      LEFT JOIN tape_process_steps ps
        ON ps.tape_id = t.tape_id

      LEFT JOIN tape_step_drying sd
        ON sd.step_id = ps.step_id

      WHERE sd.step_id IS NOT NULL

      GROUP BY
        t.tape_id,
        t.name,
        t.project_id,
        r.role,
        r.name,
        u.name

      ORDER BY finished_at DESC NULLS LAST, t.tape_id DESC;
    `);

    res.json(result.rows);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });

  }

});

// GET cut batches by tape
tapesRouter.get('/:id/electrode-cut-batches', async (req, res) => {
  const tapeId = Number(req.params.id);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        b.*,
        d.start_time AS drying_start,
        d.end_time AS drying_end
      FROM electrode_cut_batches b
      LEFT JOIN electrode_drying d
        ON d.cut_batch_id = b.cut_batch_id
      WHERE b.tape_id = $1
      ORDER BY b.created_at DESC
      `,
      [tapeId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// -------- ELECTRODE CUT BATCHES --------

// CREATE cut batch
batchesRouter.post('/', async (req, res) => {
    const {
    tape_id,
    created_by,
    shape,
    diameter_mm,
    length_mm,
    width_mm,
    comments
  } = req.body;

  const tapeId = Number(tape_id);
  const createdBy = Number(created_by);

  if (!Number.isInteger(tapeId) || !Number.isInteger(createdBy)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO electrode_cut_batches (
        tape_id,
        created_by,
        shape,
        diameter_mm,
        length_mm,
        width_mm,
        comments
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        tapeId,
        createdBy,
        shape || null,
        diameter_mm || null,
        length_mm || null,
        width_mm || null,
        comments || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
batchesRouter.put('/:id', async (req, res) => {
  const cutBatchId = Number(req.params.id);

  const {
    shape,
    diameter_mm,
    length_mm,
    width_mm,
    comments
  } = req.body;

  if (!Number.isInteger(cutBatchId) || cutBatchId <= 0) {
    return res.status(400).json({ error: 'Некорректный ID партии' });
  }

  if (shape && !['circle','rectangle'].includes(shape)) {
    return res.status(400).json({ error: 'Некорректная форма электрода' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE electrode_cut_batches
      SET
        shape = $1,
        diameter_mm = $2,
        length_mm = $3,
        width_mm = $4,
        comments = $5
      WHERE cut_batch_id = $6
      RETURNING *
      `,
      [
        shape || null,
        diameter_mm || null,
        length_mm || null,
        width_mm || null,
        comments || null,
        cutBatchId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET cut batch by ID
batchesRouter.get('/:id', async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM electrode_cut_batches
      WHERE cut_batch_id = $1
      `,
      [cutBatchId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE cut batch (and cascade delete electrodes and measurements)
batchesRouter.delete('/:id', async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    await pool.query(
      `DELETE FROM electrode_cut_batches WHERE cut_batch_id = $1`,
      [cutBatchId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- FOIL MASS MEASUREMENTS --------

// ADD measurement
batchesRouter.post('/:id/foil-masses', async (req, res) => {
  const cutBatchId = Number(req.params.id);
  const { mass_g } = req.body;
  const mass = Number(mass_g);

  if (!Number.isInteger(cutBatchId) || !Number.isFinite(mass) || mass <= 0) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO foil_mass_measurements (cut_batch_id, mass_g)
      VALUES ($1, $2)
      RETURNING *
      `,
      [cutBatchId, mass]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET measurements
batchesRouter.get('/:id/foil-masses', async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM foil_mass_measurements
      WHERE cut_batch_id = $1
      ORDER BY foil_measurement_id
      `,
      [cutBatchId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE all measurements for a batch
batchesRouter.delete('/:id/foil-masses', async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    await pool.query(
      `
      DELETE FROM foil_mass_measurements
      WHERE cut_batch_id = $1
      `,
      [cutBatchId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE measurement
foilMeasurementsRouter.put('/:id', async (req, res) => {
  const measurementId = Number(req.params.id);
  const { mass_g } = req.body;

  if (!Number.isInteger(measurementId) || !mass_g || Number(mass_g) <= 0) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE foil_mass_measurements
      SET mass_g = $1
      WHERE foil_measurement_id = $2
      RETURNING *
      `,
      [mass_g, measurementId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Измерение не найдено' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE measurement
foilMeasurementsRouter.delete('/:id', async (req, res) => {
  const measurementId = Number(req.params.id);

  if (!Number.isInteger(measurementId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    await pool.query(
      `DELETE FROM foil_mass_measurements WHERE foil_measurement_id = $1`,
      [measurementId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


module.exports = { tapesRouter, batchesRouter, foilMeasurementsRouter };
