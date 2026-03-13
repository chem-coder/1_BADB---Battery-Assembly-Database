const { Router } = require('express');
const pool = require('../db/pool');

// Routes mounted at /api/materials (nested instances)
const materialsRouter = Router();

// Routes mounted at /api/material-instances
const materialInstancesRouter = Router();


// -------- MATERIAL INSTANCES --------

// CREATE instance for material
materialsRouter.post('/:id/instances', async (req, res) => {
  const materialId = Number(req.params.id);

  if (!Number.isInteger(materialId)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  const { name, notes } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO material_instances (
        material_id, name, notes
      )
      VALUES ($1,$2,$3)
      RETURNING
        material_instance_id,
        material_id,
        name,
        notes,
        created_at
      `,
      [
        materialId,
        name,
        notes || null
      ]
      );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ instances for a material
materialsRouter.get('/:id/instances', async (req, res) => {
  const materialId = Number(req.params.id);

  if (!Number.isInteger(materialId)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        material_instance_id,
        material_id,
        name,
        notes,
        created_at
      FROM material_instances
      WHERE material_id = $1
      ORDER BY created_at DESC, material_instance_id DESC
      `,
      [materialId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE instance
materialInstancesRouter.put('/:id', async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  const { name, notes } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE material_instances
      SET
        name = $1,
        notes = $2
      WHERE material_instance_id = $3
      RETURNING
        material_instance_id,
        material_id,
        name,
        notes,
        created_at
      `,
      [
        name,
        notes || null,
        instanceId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Экземпляр материала не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE instance
materialInstancesRouter.delete('/:id', async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM material_instances WHERE material_instance_id = $1',
      [instanceId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Экземпляр материала не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


module.exports = { materialsRouter, materialInstancesRouter };
