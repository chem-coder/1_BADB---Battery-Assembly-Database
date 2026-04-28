const { Router } = require('express');
const pool = require('../db/pool');
const { auth, requireRole } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');
const {
  collectDependencyConflicts,
  sendDependencyConflict,
  sendForeignKeyConflict
} = require('../utils/dependencyConflicts');
const router = Router();


// -------- USERS --------

// CREATE — lead: can add employees only; admin: can add any role
router.post('/', auth, requireRole('admin', 'lead'), async (req, res) => {
  const { name, role, position, department_id } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Имя пользователя обязательно' });
  }

  // Lead cannot create lead/admin users
  const targetRole = role || 'employee';
  if (req.user.role !== 'admin' && targetRole !== 'employee') {
    return res.status(403).json({ error: 'Только администратор может добавлять руководителей' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (name, role, position, department_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, targetRole, position || null, department_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ — no auth required (reference data)
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.name, u.active, u.role, u.position,
              u.department_id, d.name AS department_name,
              (SELECT MAX(created_at) FROM auth_log
               WHERE user_id = u.user_id AND event = 'login_success') AS last_login
       FROM users u
       LEFT JOIN departments d ON d.department_id = u.department_id
       ORDER BY u.name`);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE — lead: can edit but not promote to lead/admin; admin: full access
router.put('/:id', auth, requireRole('admin', 'lead'), async (req, res) => {
  const { id } = req.params;
  const { name, active, role, position, department_id } = req.body;

  if (!name || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  // Lead cannot assign lead/admin role
  if (req.user.role !== 'admin' && role && role !== 'employee') {
    return res.status(403).json({ error: 'Только администратор может назначать роль руководителя' });
  }

  try {
    const current = await pool.query('SELECT name, active, role, position, department_id FROM users WHERE user_id = $1', [id]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const result = await pool.query(
      `UPDATE users SET name = $1, active = $2, role = COALESCE($3, role),
              position = COALESCE($4, position), department_id = COALESCE($5, department_id)
       WHERE user_id = $6 RETURNING *`,
      [name, active, role || null, position || null, department_id || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    await trackChanges(pool, 'user', 'users', 'user_id', Number(id), current.rows[0], { name, active, role: role || null, position: position || null, department_id: department_id || null }, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь с таким именем уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE — admin only
router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный user_id' });
  }

  try {
    const dependencies = await collectDependencyConflicts(pool, [
      {
        key: 'projects',
        label: 'проекты, где пользователь является лидом/создателем/редактором',
        query: `
          SELECT project_id AS id, name
          FROM projects
          WHERE lead_id = $1 OR created_by = $1 OR updated_by = $1
          ORDER BY project_id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'tapes',
        label: 'ленты, созданные или обновлённые пользователем',
        query: `
          SELECT tape_id AS id, name
          FROM tapes
          WHERE created_by = $1 OR updated_by = $1
          ORDER BY tape_id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'batteries',
        label: 'аккумуляторы, созданные или обновлённые пользователем',
        query: `
          SELECT battery_id AS id, battery_notes AS name
          FROM batteries
          WHERE created_by = $1 OR updated_by = $1
          ORDER BY battery_id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'tape_recipes',
        label: 'рецепты, созданные или обновлённые пользователем',
        query: `
          SELECT tape_recipe_id AS id, name
          FROM tape_recipes
          WHERE created_by = $1 OR updated_by = $1
          ORDER BY tape_recipe_id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'inventory',
        label: 'материалы, сепараторы, электролиты или партии электродов с этим пользователем',
        query: `
          SELECT id, name
          FROM (
            SELECT sep_id AS id, name FROM separators WHERE created_by = $1 OR updated_by = $1
            UNION ALL
            SELECT electrolyte_id AS id, name FROM electrolytes WHERE created_by = $1 OR updated_by = $1
            UNION ALL
            SELECT cut_batch_id AS id, 'electrode cut batch #' || cut_batch_id AS name
            FROM electrode_cut_batches
            WHERE created_by = $1 OR updated_by = $1
          ) refs
          ORDER BY id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'tape_process_steps',
        label: 'технологические шаги, выполненные или обновлённые пользователем',
        query: `
          SELECT step_id AS id, 'tape #' || tape_id AS name
          FROM tape_process_steps
          WHERE performed_by = $1 OR updated_by = $1
          ORDER BY step_id
          LIMIT 25
        `,
        params: [id]
      }
    ]);

    if (dependencies.length > 0) {
      return sendDependencyConflict(
        res,
        'Нельзя удалить пользователя: он связан с существующими записями',
        dependencies
      );
    }

    const result = await pool.query('DELETE FROM users WHERE user_id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.status(204).end();
  } catch (err) {
    if (sendForeignKeyConflict(res, err, 'Нельзя удалить пользователя: он связан с другими записями')) {
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


module.exports = router;
