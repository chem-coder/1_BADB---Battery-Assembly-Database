const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');
const {
  collectDependencyConflicts,
  sendDependencyConflict,
  sendForeignKeyConflict
} = require('../utils/dependencyConflicts');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});



// -------- STRUCTURES --------

// CREATE
router.post('/', auth, async (req, res) => {
  const { name, comments } = req.body;
  
  // 1. validate required strings
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название структуры обязательно' });
  }
  
  const cleanName = name.trim();

  try {
    const result = await pool.query(
      `
      INSERT INTO separator_structure (name, comments)
      VALUES ($1, $2)
      RETURNING sep_str_id, name, comments
      `,
      [cleanName, comments || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      // unique violation on name
      return res.status(409).json({ error: 'Такая структура уже существует' });
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT sep_str_id, name, comments FROM separator_structure ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { name, comments } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Название структуры обязательно' });
  }

  try {
    const current = await pool.query('SELECT name, comments FROM separator_structure WHERE sep_str_id = $1', [id]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Структура не найдена' });
    }

    const newVals = { name: name.trim(), comments: comments || null };

    const result = await pool.query(
      `
      UPDATE separator_structure
      SET name = $1,
          comments = $2
      WHERE sep_str_id = $3
      RETURNING sep_str_id, name, comments
      `,
      [newVals.name, newVals.comments, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Структура не найдена' });
    }

    await trackChanges(pool, 'sep_structure', 'separator_structure', 'sep_str_id', Number(id), current.rows[0], newVals, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Такая структура уже существует' });
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный sep_str_id' });
  }

  try {
    const dependencies = await collectDependencyConflicts(pool, [
      {
        key: 'separators',
        label: 'сепараторы с этой структурой',
        query: `
          SELECT sep_id AS id, name
          FROM separators
          WHERE structure_id = $1
          ORDER BY sep_id
          LIMIT 25
        `,
        params: [id]
      }
    ]);

    if (dependencies.length > 0) {
      return sendDependencyConflict(
        res,
        'Нельзя удалить структуру: она используется в сепараторах',
        dependencies
      );
    }

    const result = await pool.query(
      'DELETE FROM separator_structure WHERE sep_str_id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Структура не найдена' });
    }

    res.status(204).end();
  } catch (err) {
    if (sendForeignKeyConflict(res, err, 'Нельзя удалить структуру: она связана с другими записями')) {
      return;
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



module.exports = router;
