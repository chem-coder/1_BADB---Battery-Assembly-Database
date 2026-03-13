const { Router } = require('express');
const pool = require('../db/pool');
const router = Router();


// -------- TAPES --------

// CREATE tape
router.post('/', async (req, res) => {
  const {
    name,
    project_id,
    tape_recipe_id,
    created_by,
    notes,
    calc_mode,
    target_mass_g
  } = req.body;

  const projectId = Number(project_id);
  const recipeId  = Number(tape_recipe_id);
  const createdBy = Number(created_by);

  if (
    !Number.isInteger(projectId) ||
    !Number.isInteger(recipeId) ||
    !Number.isInteger(createdBy)
  ) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO tapes (
        name,
        project_id,
        tape_recipe_id,
        created_by,
        notes,
        calc_mode,
        target_mass_g
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        name,
        projectId,
        recipeId,
        createdBy,
        notes || null,
        calc_mode || null,
        target_mass_g || null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
router.get('/', async (req, res) => {
  const { role } = req.query;

  try {
    const result = role
      ? await pool.query(
          `
          SELECT
            t.tape_id,
            t.name,
            t.project_id,
            t.tape_recipe_id,
            t.created_by,
            t.created_at,
            t.status,
            t.notes,
            t.calc_mode,
            t.target_mass_g,
            r.role,
            r.name AS recipe_name
          FROM tapes t
          JOIN tape_recipes r
            ON r.tape_recipe_id = t.tape_recipe_id
          WHERE r.role = $1
          ORDER BY t.created_at DESC
          `,
          [role]
        )
      : await pool.query(
          `
          SELECT
            t.tape_id,
            t.name,
            t.project_id,
            t.tape_recipe_id,
            t.created_by,
            t.created_at,
            t.status,
            t.notes,
            t.calc_mode,
            t.target_mass_g,
            r.role,
            r.name AS recipe_name
          FROM tapes t
          JOIN tape_recipes r
            ON r.tape_recipe_id = t.tape_recipe_id
          ORDER BY t.created_at DESC
          `
        );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// EDIT
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  const {
    name,
    project_id,
    tape_recipe_id,
    created_by,
    notes,
    calc_mode,
    target_mass_g
  } = req.body;

  const projectId = Number(project_id);
  const recipeId  = Number(tape_recipe_id);
  const createdBy = Number(created_by);

  if (
    !Number.isInteger(projectId) ||
    !Number.isInteger(recipeId) ||
    !Number.isInteger(createdBy)
  ) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
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
        target_mass_g = $7
      WHERE tape_id = $8
      RETURNING *
      `,
      [
        name,
        projectId,
        recipeId,
        createdBy,
        notes || null,
        calc_mode || null,
        target_mass_g || null,
        id
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);

  try {
    await pool.query(
      `DELETE FROM tapes WHERE tape_id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});


module.exports = router;
