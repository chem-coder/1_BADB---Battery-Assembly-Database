const { Router } = require('express');
const pool = require('../db/pool');
const router = Router();


// -------- MATERIALS --------

// CREATE
router.post('/', async (req, res) => {
  const { name, role } = req.body;

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  // role is optional in schema (role public.material_role), but UI requires it.
  if (typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ error: 'Роль обязательна' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO materials (name, role)
      VALUES ($1, $2)
      RETURNING material_id, name, role
      `,
      [name.trim(), role]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Материал с таким названием уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT material_id, name, role
      FROM materials
      ORDER BY name
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, role } = req.body;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  if (typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ error: 'Роль обязательна' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE materials
      SET name = $1, role = $2
      WHERE material_id = $3
      RETURNING material_id, name, role
      `,
      [name.trim(), role, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Материал не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Материал с таким названием уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM materials WHERE material_id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Материал не найден' });
    }

    res.status(204).end();
  } catch (err) {
    // likely FK restrict from material_instances (ON DELETE RESTRICT)
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Нельзя удалить материал: существуют экземпляры (instances)' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


module.exports = router;
