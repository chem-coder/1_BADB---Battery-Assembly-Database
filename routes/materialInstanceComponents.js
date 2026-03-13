const { Router } = require('express');
const pool = require('../db/pool');

// Routes mounted at /api/material-instances (nested /components)
const instanceRouter = Router();

// Routes mounted at /api/material-instance-components
const componentRouter = Router();


// -------- MATERIAL INSTANCE COMPONENTS --------

// --- GET components for a material instance ---
instanceRouter.get('/:id/components', async (req, res) => {
  const id = Number(req.params.id);

  const result = await pool.query(
    `
    SELECT
      mic.material_instance_component_id,
      mic.parent_material_instance_id,
      mic.component_material_instance_id,
      mic.mass_fraction,
      mi.name AS component_name,
      mi.material_id,
      m.name AS material_name,
      m.role AS material_role,
      mic.notes
    FROM material_instance_components mic
    JOIN material_instances mi
      ON mic.component_material_instance_id = mi.material_instance_id
    JOIN materials m
      ON mi.material_id = m.material_id
    WHERE mic.parent_material_instance_id = $1
    ORDER BY mi.name;
    `,
    [id]
  );

  res.json(result.rows);
});

// --- ADD component to instance ---
instanceRouter.post('/:id/components', async (req, res) => {
  const parentId = Number(req.params.id);
  const { component_material_instance_id, mass_fraction } = req.body;

  const result = await pool.query(
    `
    WITH ins AS (
      INSERT INTO material_instance_components
        (parent_material_instance_id, component_material_instance_id, mass_fraction)
      VALUES ($1, $2, $3)
      RETURNING *
    )
    SELECT
      ins.material_instance_component_id,
      ins.parent_material_instance_id,
      ins.component_material_instance_id,
      ins.mass_fraction,
      mi.name AS component_name,
      mi.material_id,
      m.name AS material_name,
      ins.notes
    FROM ins
    JOIN material_instances mi
      ON ins.component_material_instance_id = mi.material_instance_id
    JOIN materials m
      ON mi.material_id = m.material_id;
    `,
    [parentId, component_material_instance_id, mass_fraction]
  );

  res.json(result.rows[0]);
});

// --- UPDATE component ---
componentRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный material_instance_component_id' });
  }

  const { mass_fraction, notes } = req.body;

  const mf =
    mass_fraction === '' || mass_fraction === null || mass_fraction === undefined
      ? null
      : Number(mass_fraction);

  if (mf === null || !Number.isFinite(mf) || mf < 0 || mf > 1) {
    return res.status(400).json({ error: 'Некорректный mass_fraction (ожидается число 0..1)' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE material_instance_components
      SET
        mass_fraction = $1,
        notes = $2
      WHERE material_instance_component_id = $3
      RETURNING *
      `,
      [mf, notes || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Компонент не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// --- DELETE component ---
componentRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);

  await pool.query(
    `
    DELETE FROM material_instance_components
    WHERE material_instance_component_id = $1;
    `,
    [id]
  );

  res.json({ success: true });
});


module.exports = { instanceRouter, componentRouter };
