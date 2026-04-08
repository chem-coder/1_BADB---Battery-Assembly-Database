const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// ── GET /api/dashboard/kpi ────────────────────────────────────────────
// Returns counts and breakdowns for all entity types
router.get('/kpi', auth, async (req, res) => {
  try {
    const { period } = req.query // '7d', '30d', '90d', 'all'
    const dateFilter = periodToDateFilter(period)

    const [tapes, electrodes, batteries, projects, materials, recipes] = await Promise.all([
      pool.query(`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE step_count >= 8) AS completed,
          count(*) FILTER (WHERE step_count < 8 OR step_count IS NULL) AS in_progress
        FROM (
          SELECT t.tape_id,
            (SELECT count(*) FROM tape_process_steps s WHERE s.tape_id = t.tape_id AND s.performed_by IS NOT NULL) AS step_count
          FROM tapes t
          ${dateFilter ? `WHERE t.created_at >= $1` : ''}
        ) sub
      `, dateFilter ? [dateFilter] : []),

      pool.query(`
        SELECT
          count(DISTINCT b.cut_batch_id) AS batches,
          count(e.electrode_id) AS electrodes
        FROM electrode_cut_batches b
        LEFT JOIN electrodes e ON e.cut_batch_id = b.cut_batch_id
        ${dateFilter ? `WHERE b.created_at >= $1` : ''}
      `, dateFilter ? [dateFilter] : []),

      pool.query(`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE status = 'assembled') AS assembled,
          count(*) FILTER (WHERE status = 'testing') AS testing,
          count(*) FILTER (WHERE status = 'completed') AS completed
        FROM batteries
        ${dateFilter ? `WHERE created_at >= $1` : ''}
      `, dateFilter ? [dateFilter] : []),

      pool.query(`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE status = 'active') AS active,
          count(*) FILTER (WHERE status = 'completed') AS completed,
          count(*) FILTER (WHERE status = 'paused') AS paused
        FROM projects
      `),

      pool.query(`SELECT count(*) AS total FROM materials`),
      pool.query(`SELECT count(*) AS total FROM tape_recipes`),
    ])

    res.json({
      tapes: tapes.rows[0],
      electrodes: electrodes.rows[0],
      batteries: batteries.rows[0],
      projects: projects.rows[0],
      materials: materials.rows[0],
      recipes: recipes.rows[0],
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки KPI' })
  }
})

// ── GET /api/dashboard/filter-options ──────────────────────────────────
// Returns available filter values with counts
router.get('/filter-options', auth, async (req, res) => {
  try {
    const [projects, operators] = await Promise.all([
      pool.query(`
        SELECT p.project_id AS id, p.name, count(t.tape_id) AS tape_count
        FROM projects p
        LEFT JOIN tapes t ON t.project_id = p.project_id
        GROUP BY p.project_id, p.name
        ORDER BY p.name
      `),
      pool.query(`
        SELECT u.user_id AS id, u.name, count(t.tape_id) AS tape_count
        FROM users u
        LEFT JOIN tapes t ON t.created_by = u.user_id
        WHERE u.active = true
        GROUP BY u.user_id, u.name
        ORDER BY u.name
      `),
    ])

    res.json({
      projects: projects.rows,
      operators: operators.rows,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки фильтров' })
  }
})

// ── GET /api/dashboard/activity ───────────────────────────────────────
// Returns recent activity events for timeline
router.get('/activity', auth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100)

    const result = await pool.query(`
      SELECT
        a.id,
        a.user_id,
        u.name AS user_name,
        a.action,
        a.entity,
        a.entity_id,
        a.details,
        a.created_at
      FROM activity_log a
      LEFT JOIN users u ON u.user_id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT $1
    `, [limit])

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки активности' })
  }
})

// ── GET /api/dashboard/production ─────────────────────────────────────
// Returns production counts per week for chart
router.get('/production', auth, async (req, res) => {
  try {
    const weeks = Math.min(Number(req.query.weeks) || 12, 52)

    const result = await pool.query(`
      WITH weeks AS (
        SELECT generate_series(
          date_trunc('week', now()) - ($1 - 1) * interval '1 week',
          date_trunc('week', now()),
          interval '1 week'
        ) AS week_start
      )
      SELECT
        w.week_start,
        COALESCE(t.tape_count, 0) AS tapes,
        COALESCE(e.batch_count, 0) AS electrode_batches,
        COALESCE(b.battery_count, 0) AS batteries
      FROM weeks w
      LEFT JOIN (
        SELECT date_trunc('week', created_at) AS wk, count(*) AS tape_count
        FROM tapes GROUP BY wk
      ) t ON t.wk = w.week_start
      LEFT JOIN (
        SELECT date_trunc('week', created_at) AS wk, count(*) AS batch_count
        FROM electrode_cut_batches GROUP BY wk
      ) e ON e.wk = w.week_start
      LEFT JOIN (
        SELECT date_trunc('week', created_at) AS wk, count(*) AS battery_count
        FROM batteries GROUP BY wk
      ) b ON b.wk = w.week_start
      ORDER BY w.week_start
    `, [weeks])

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки production data' })
  }
})

// ── Helper ────────────────────────────────────────────────────────────
function periodToDateFilter(period) {
  if (!period || period === 'all') return null
  const days = { '7d': 7, '30d': 30, '90d': 90, 'ytd': 365 }
  const d = days[period]
  if (!d) return null
  const date = new Date()
  date.setDate(date.getDate() - d)
  return date.toISOString()
}

module.exports = router;
