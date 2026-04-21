const express = require('express');
const router = express.Router();

function normalizeMassFraction(value) {
  return Number(value.toFixed(8));
}
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');

async function getMaterialInstanceContext(client, materialInstanceId) {
  const result = await client.query(
    `
    SELECT
      mi.material_instance_id,
      mi.material_id,
      mi.name AS instance_name,
      mi.notes AS instance_notes,
      mi.created_at,
      mi.source_id,
      m.name AS material_name,
      m.role AS material_role,
      NOT EXISTS (
        SELECT 1
        FROM material_instance_components mic
        WHERE mic.parent_material_instance_id = mi.material_instance_id
      ) AS is_pure
    FROM material_instances mi
    JOIN materials m
      ON m.material_id = mi.material_id
    WHERE mi.material_instance_id = $1
    `,
    [materialInstanceId]
  );

  return result.rows[0] || null;
}

async function ensureMaterialSourceForPureInstance(client, materialInstanceId, updatedByUserId = null) {
  const context = await getMaterialInstanceContext(client, materialInstanceId);

  if (!context) {
    const err = new Error('Экземпляр материала не найден');
    err.statusCode = 404;
    throw err;
  }

  if (!context.is_pure) {
    const err = new Error('Источник материала доступен только для 100% чистых экземпляров');
    err.statusCode = 400;
    throw err;
  }

  if (context.source_id) {
    return context;
  }

  const sourceInsert = await client.query(
    `
    INSERT INTO material_sources (
      material_id,
      quality_rating_label,
      is_evaluated,
      updated_by
    )
    VALUES ($1, 'tbd', false, $2)
    RETURNING source_id
    `,
    [context.material_id, updatedByUserId]
  );

  await client.query(
    `
    UPDATE material_instances
    SET source_id = $1
    WHERE material_instance_id = $2
    `,
    [sourceInsert.rows[0].source_id, materialInstanceId]
  );

  return {
    ...context,
    source_id: sourceInsert.rows[0].source_id
  };
}

async function ensureMaterialPropertiesRow(client, materialInstanceId, updatedByUserId = null) {
  const context = await getMaterialInstanceContext(client, materialInstanceId);

  if (!context) {
    const err = new Error('Экземпляр материала не найден');
    err.statusCode = 404;
    throw err;
  }

  const current = await client.query(
    `
    SELECT material_property_id
    FROM material_properties
    WHERE material_instance_id = $1
    `,
    [materialInstanceId]
  );

  if (current.rows[0]) {
    return {
      context,
      material_property_id: current.rows[0].material_property_id
    };
  }

  const insertResult = await client.query(
    `
    INSERT INTO material_properties (
      material_instance_id,
      updated_at,
      updated_by
    )
    VALUES ($1, now(), $2)
    RETURNING material_property_id
    `,
    [materialInstanceId, updatedByUserId]
  );

  return {
    context,
    material_property_id: insertResult.rows[0].material_property_id
  };
}

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});

/*
  materials
    └── material_instances
          └── material_instance_components
*/


// -------- MATERIALS --------

// CREATE
router.post('/', auth, async (req, res) => {
  const { name, role } = req.body;
  const cleanName = typeof name === 'string' ? name.trim() : '';

  if (!cleanName) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  // role is optional in schema (role public.material_role), but UI requires it.
  if (typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ error: 'Роль обязательна' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
      INSERT INTO materials (name, role)
      VALUES ($1, $2)
      RETURNING material_id, name, role
      `,
      [cleanName, role]
    );

    const instanceResult = await client.query(
      `
      INSERT INTO material_instances (
        material_id,
        name,
        notes
      )
      VALUES ($1, $2, $3)
      RETURNING material_instance_id
      `,
      [
        result.rows[0].material_id,
        `${cleanName} (чистый)`,
        null
      ]
    );

    const sourceInsert = await client.query(
      `
      INSERT INTO material_sources (
        material_id,
        quality_rating_label,
        is_evaluated,
        updated_by
      )
      VALUES ($1, 'tbd', false, $2)
      RETURNING source_id
      `,
      [result.rows[0].material_id, req.user.userId]
    );

    await client.query(
      `
      UPDATE material_instances
      SET source_id = $1
      WHERE material_instance_id = $2
      `,
      [sourceInsert.rows[0].source_id, instanceResult.rows[0].material_instance_id]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Материал с таким названием уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// READ
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT m.material_id, m.name, m.role,
             m.updated_by,
             m.updated_at,
             u_updated.name AS updated_by_name
      FROM materials m
      LEFT JOIN users u_updated ON u_updated.user_id = m.updated_by
      ORDER BY m.name
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
router.put('/:id', auth, async (req, res) => {
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
    const current = await pool.query('SELECT name, role FROM materials WHERE material_id = $1', [id]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Материал не найден' });
    }

    const newVals = { name: name.trim(), role };

    const result = await pool.query(
      `
      UPDATE materials
      SET name = $1, role = $2, updated_by = $3, updated_at = now()
      WHERE material_id = $4
      RETURNING material_id, name, role, updated_by, updated_at
      `,
      [newVals.name, newVals.role, req.user.userId, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Материал не найден' });
    }

    await trackChanges(pool, 'material', 'materials', 'material_id', id, current.rows[0], newVals, req.user.userId);

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
router.delete('/:id', auth, async (req, res) => {
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



// -------- MATERIAL INSTANCES --------

// CREATE instance for material
router.post('/:id/instances', auth, async (req, res) => {
  const materialId = Number(req.params.id);

  if (!Number.isInteger(materialId)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  const { name, notes, is_pure } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
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
        created_at,
        source_id
      `,
      [
        materialId,
        name,
        notes || null
      ]
    );

    let createdRow = result.rows[0];

    if (is_pure === true) {
      const context = await ensureMaterialSourceForPureInstance(
        client,
        createdRow.material_instance_id,
        req.user.userId
      );

      createdRow = {
        ...createdRow,
        source_id: context.source_id
      };
    }

    await client.query('COMMIT');

    res.status(201).json(createdRow);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// READ all instances for composition dropdowns
router.get('/instances', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        mi.material_instance_id,
        mi.material_id,
        mi.name,
        mi.notes,
        mi.created_at,
        mi.source_id,
        m.name AS material_name,
        m.role AS material_role,
        NOT EXISTS (
          SELECT 1
          FROM material_instance_components mic
          WHERE mic.parent_material_instance_id = mi.material_instance_id
        ) AS is_pure
      FROM material_instances mi
      JOIN materials m
        ON mi.material_id = m.material_id
      ORDER BY mi.name, mi.material_instance_id
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки экземпляров материалов' });
  }
});

// READ instances for a material
router.get('/:id/instances', auth, async (req, res) => {
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
        created_at,
        source_id,
        NOT EXISTS (
          SELECT 1
          FROM material_instance_components mic
          WHERE mic.parent_material_instance_id = material_instances.material_instance_id
        ) AS is_pure
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
// OLD ROUTE: .put('/api/material-instances/:id'
router.put('/instances/:id', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  const { name, notes } = req.body;

  try {
    const current = await pool.query('SELECT name, notes FROM material_instances WHERE material_instance_id = $1', [instanceId]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Экземпляр материала не найден' });
    }

    const newVals = { name, notes: notes || null };

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
      [newVals.name, newVals.notes, instanceId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Экземпляр материала не найден' });
    }

    await trackChanges(pool, 'material_instance', 'material_instances', 'material_instance_id', instanceId, current.rows[0], newVals, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE instance
// OLD ROUTE: .delete('/api/material-instances/:id'
router.delete('/instances/:id', auth, async (req, res) => {
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


// -------- MATERIAL PROPERTIES --------

router.get('/instances/:id/properties', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    const context = await getMaterialInstanceContext(pool, instanceId);

    if (!context) {
      return res.status(404).json({ error: 'Экземпляр материала не найден' });
    }

    const result = await pool.query(
      `
      SELECT
        mp.material_property_id,
        mp.material_instance_id,
        mp.specific_capacity_mAh_g,
        mp.density_g_ml,
        mp.notes,
        mp.created_at,
        mp.updated_at,
        mp.updated_by,
        u.name AS updated_by_name
      FROM material_properties mp
      LEFT JOIN users u
        ON u.user_id = mp.updated_by
      WHERE mp.material_instance_id = $1
      `,
      [instanceId]
    );

    res.json({
      instance: context,
      properties: result.rows[0] || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки свойств материала' });
  }
});

router.put('/instances/:id/properties', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  const { specific_capacity_mAh_g, density_g_ml, notes } = req.body;

  const normalizedSpecificCapacity =
    specific_capacity_mAh_g === '' || specific_capacity_mAh_g === null || specific_capacity_mAh_g === undefined
      ? null
      : Number(specific_capacity_mAh_g);
  const normalizedDensity =
    density_g_ml === '' || density_g_ml === null || density_g_ml === undefined
      ? null
      : Number(density_g_ml);
  const normalizedNotes =
    typeof notes === 'string' && notes.trim() ? notes.trim() : null;

  if (normalizedSpecificCapacity !== null && (!Number.isFinite(normalizedSpecificCapacity) || normalizedSpecificCapacity < 0)) {
    return res.status(400).json({ error: 'Удельная ёмкость должна быть неотрицательным числом' });
  }

  if (normalizedDensity !== null && (!Number.isFinite(normalizedDensity) || normalizedDensity < 0)) {
    return res.status(400).json({ error: 'Плотность должна быть неотрицательным числом' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const context = await getMaterialInstanceContext(client, instanceId);

    if (!context) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Экземпляр материала не найден' });
    }

    const current = await client.query(
      `
      SELECT specific_capacity_mAh_g, density_g_ml, notes
      FROM material_properties
      WHERE material_instance_id = $1
      `,
      [instanceId]
    );

    const newVals = {
      specific_capacity_mAh_g: normalizedSpecificCapacity,
      density_g_ml: normalizedDensity,
      notes: normalizedNotes
    };

    const result = await client.query(
      `
      INSERT INTO material_properties (
        material_instance_id,
        specific_capacity_mAh_g,
        density_g_ml,
        notes,
        updated_at,
        updated_by
      )
      VALUES ($1, $2, $3, $4, now(), $5)
      ON CONFLICT (material_instance_id)
      DO UPDATE
      SET
        specific_capacity_mAh_g = EXCLUDED.specific_capacity_mAh_g,
        density_g_ml = EXCLUDED.density_g_ml,
        notes = EXCLUDED.notes,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by
      RETURNING *
      `,
      [instanceId, normalizedSpecificCapacity, normalizedDensity, normalizedNotes, req.user.userId]
    );

    await trackChanges(
      client,
      'material_properties',
      'material_properties',
      'material_property_id',
      result.rows[0].material_property_id,
      current.rows[0] || {},
      newVals,
      req.user.userId,
      null,
      false
    );

    await client.query('COMMIT');
    res.json({
      instance: context,
      properties: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения свойств материала' });
  } finally {
    client.release();
  }
});


// -------- MATERIAL SOURCE INFO --------

router.get('/instances/:id/source-info', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const context = await ensureMaterialSourceForPureInstance(client, instanceId);

    const result = await client.query(
      `
      SELECT
        ms.source_id,
        ms.material_id,
        ms.supplier,
        ms.brand,
        ms.model_or_catalog_no,
        ms.lot_number,
        ms.date_ordered,
        ms.date_received,
        ms.quality_rating_label,
        ms.quality_rating_score,
        ms.evaluation_notes,
        ms.is_evaluated,
        ms.created_at,
        ms.updated_at,
        ms.updated_by,
        u.name AS updated_by_name
      FROM material_sources ms
      LEFT JOIN users u
        ON u.user_id = ms.updated_by
      WHERE ms.source_id = $1
      `,
      [context.source_id]
    );

    await client.query('COMMIT');
    res.json({
      instance: context,
      source: result.rows[0] || null
    });
  } catch (err) {
    await client.query('ROLLBACK');
    const statusCode = err.statusCode || 500;
    console.error(err);
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Ошибка загрузки информации об источнике материала' : err.message
    });
  } finally {
    client.release();
  }
});

router.put('/instances/:id/source-info', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  const {
    supplier,
    brand,
    model_or_catalog_no,
    lot_number,
    date_ordered,
    date_received,
    quality_rating_label,
    quality_rating_score,
    evaluation_notes,
    is_evaluated
  } = req.body;

  const normalizedLabel =
    quality_rating_label === '' || quality_rating_label === null || quality_rating_label === undefined
      ? null
      : String(quality_rating_label).trim();
  const normalizedScore =
    quality_rating_score === '' || quality_rating_score === null || quality_rating_score === undefined
      ? null
      : Number(quality_rating_score);

  if (normalizedLabel !== null && !['good', 'ok', 'bad', 'tbd'].includes(normalizedLabel)) {
    return res.status(400).json({ error: 'Некорректная метка качества' });
  }

  if (normalizedScore !== null && (!Number.isInteger(normalizedScore) || normalizedScore < 1 || normalizedScore > 5)) {
    return res.status(400).json({ error: 'Оценка качества должна быть целым числом от 1 до 5' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const context = await ensureMaterialSourceForPureInstance(client, instanceId, req.user.userId);

    const current = await client.query(
      `
      SELECT
        supplier,
        brand,
        model_or_catalog_no,
        lot_number,
        date_ordered,
        date_received,
        quality_rating_label,
        quality_rating_score,
        evaluation_notes,
        is_evaluated
      FROM material_sources
      WHERE source_id = $1
      `,
      [context.source_id]
    );

    const newVals = {
      supplier: typeof supplier === 'string' && supplier.trim() ? supplier.trim() : null,
      brand: typeof brand === 'string' && brand.trim() ? brand.trim() : null,
      model_or_catalog_no:
        typeof model_or_catalog_no === 'string' && model_or_catalog_no.trim()
          ? model_or_catalog_no.trim()
          : null,
      lot_number: typeof lot_number === 'string' && lot_number.trim() ? lot_number.trim() : null,
      date_ordered: date_ordered || null,
      date_received: date_received || null,
      quality_rating_label: normalizedLabel,
      quality_rating_score: normalizedScore,
      evaluation_notes:
        typeof evaluation_notes === 'string' && evaluation_notes.trim()
          ? evaluation_notes.trim()
          : null,
      is_evaluated: Boolean(is_evaluated)
    };

    const result = await client.query(
      `
      UPDATE material_sources
      SET
        supplier = $1,
        brand = $2,
        model_or_catalog_no = $3,
        lot_number = $4,
        date_ordered = $5,
        date_received = $6,
        quality_rating_label = $7,
        quality_rating_score = $8,
        evaluation_notes = $9,
        is_evaluated = $10,
        updated_at = now(),
        updated_by = $11
      WHERE source_id = $12
      RETURNING *
      `,
      [
        newVals.supplier,
        newVals.brand,
        newVals.model_or_catalog_no,
        newVals.lot_number,
        newVals.date_ordered,
        newVals.date_received,
        newVals.quality_rating_label,
        newVals.quality_rating_score,
        newVals.evaluation_notes,
        newVals.is_evaluated,
        req.user.userId,
        context.source_id
      ]
    );

    await trackChanges(
      client,
      'material_source',
      'material_sources',
      'source_id',
      context.source_id,
      current.rows[0] || {},
      newVals,
      req.user.userId,
      null,
      false
    );

    await client.query('COMMIT');
    res.json({
      instance: context,
      source: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    const statusCode = err.statusCode || 500;
    console.error(err);
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Ошибка сохранения информации об источнике материала' : err.message
    });
  } finally {
    client.release();
  }
});

router.get('/instances/:id/source-info/files', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const context = await ensureMaterialSourceForPureInstance(client, instanceId);

    const result = await client.query(
      `
      SELECT
        material_source_file_id,
        source_id,
        file_name,
        mime_type,
        uploaded_at
      FROM material_source_files
      WHERE source_id = $1
      ORDER BY material_source_file_id
      `,
      [context.source_id]
    );

    await client.query('COMMIT');

    res.json(
      result.rows.map((row) => ({
        ...row,
        download_url: `/api/materials/source-files/${row.material_source_file_id}/download`
      }))
    );
  } catch (err) {
    await client.query('ROLLBACK');
    const statusCode = err.statusCode || 500;
    console.error(err);
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Ошибка загрузки файлов источника материала' : err.message
    });
  } finally {
    client.release();
  }
});

router.post('/instances/:id/source-info/files', auth, async (req, res) => {
  const instanceId = Number(req.params.id);
  const { entries } = req.body;

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Не переданы файлы источника материала' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const context = await ensureMaterialSourceForPureInstance(client, instanceId, req.user.userId);

    for (const entry of entries) {
      if (!entry.file_content_base64) {
        throw new Error('Не передано содержимое файла');
      }

      await client.query(
        `
        INSERT INTO material_source_files (
          source_id,
          file_name,
          mime_type,
          file_data
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          context.source_id,
          entry.file_name || 'material_source_file',
          entry.mime_type || 'application/octet-stream',
          Buffer.from(entry.file_content_base64, 'base64')
        ]
      );
    }

    const result = await client.query(
      `
      SELECT
        material_source_file_id,
        source_id,
        file_name,
        mime_type,
        uploaded_at
      FROM material_source_files
      WHERE source_id = $1
      ORDER BY material_source_file_id
      `,
      [context.source_id]
    );

    await client.query('COMMIT');

    res.json(
      result.rows.map((row) => ({
        ...row,
        download_url: `/api/materials/source-files/${row.material_source_file_id}/download`
      }))
    );
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения файлов источника материала' });
  } finally {
    client.release();
  }
});

router.get('/source-files/:fileId/download', auth, async (req, res) => {
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор файла' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        file_name,
        mime_type,
        file_data
      FROM material_source_files
      WHERE material_source_file_id = $1
      `,
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const file = result.rows[0];

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.file_name || 'material-source-file')}`
    );
    res.send(file.file_data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка скачивания файла источника материала' });
  }
});

router.delete('/source-files/:fileId', auth, async (req, res) => {
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор файла' });
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM material_source_files
      WHERE material_source_file_id = $1
      RETURNING material_source_file_id
      `,
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления файла источника материала' });
  }
});

router.get('/instances/:id/properties/files', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const ensured = await ensureMaterialPropertiesRow(client, instanceId);

    const result = await client.query(
      `
      SELECT
        material_property_file_id,
        material_property_id,
        file_name,
        mime_type,
        uploaded_at
      FROM material_property_files
      WHERE material_property_id = $1
      ORDER BY material_property_file_id
      `,
      [ensured.material_property_id]
    );

    await client.query('COMMIT');

    res.json(
      result.rows.map((row) => ({
        ...row,
        download_url: `/api/materials/property-files/${row.material_property_file_id}/download`
      }))
    );
  } catch (err) {
    await client.query('ROLLBACK');
    const statusCode = err.statusCode || 500;
    console.error(err);
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Ошибка загрузки файлов свойств материала' : err.message
    });
  } finally {
    client.release();
  }
});

router.post('/instances/:id/properties/files', auth, async (req, res) => {
  const instanceId = Number(req.params.id);
  const { entries } = req.body;

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Не переданы файлы свойств материала' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const ensured = await ensureMaterialPropertiesRow(client, instanceId, req.user.userId);

    for (const entry of entries) {
      if (!entry.file_content_base64) {
        throw new Error('Не передано содержимое файла');
      }

      await client.query(
        `
        INSERT INTO material_property_files (
          material_property_id,
          file_name,
          mime_type,
          file_data
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          ensured.material_property_id,
          entry.file_name || 'material_property_file',
          entry.mime_type || 'application/octet-stream',
          Buffer.from(entry.file_content_base64, 'base64')
        ]
      );
    }

    const result = await client.query(
      `
      SELECT
        material_property_file_id,
        material_property_id,
        file_name,
        mime_type,
        uploaded_at
      FROM material_property_files
      WHERE material_property_id = $1
      ORDER BY material_property_file_id
      `,
      [ensured.material_property_id]
    );

    await client.query('COMMIT');

    res.json(
      result.rows.map((row) => ({
        ...row,
        download_url: `/api/materials/property-files/${row.material_property_file_id}/download`
      }))
    );
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения файлов свойств материала' });
  } finally {
    client.release();
  }
});

router.get('/property-files/:fileId/download', auth, async (req, res) => {
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор файла' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        file_name,
        mime_type,
        file_data
      FROM material_property_files
      WHERE material_property_file_id = $1
      `,
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const file = result.rows[0];

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.file_name || 'material-property-file')}`
    );
    res.send(file.file_data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка скачивания файла свойств материала' });
  }
});

router.delete('/property-files/:fileId', auth, async (req, res) => {
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор файла' });
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM material_property_files
      WHERE material_property_file_id = $1
      RETURNING material_property_file_id
      `,
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления файла свойств материала' });
  }
});


// -------- MATERIAL INSTANCE COMPONENTS --------

// --- GET components for a material instance ---
router.get('/instances/:id/components', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки компонентов' });
  }
});

// --- ADD component to instance ---
router.post('/instances/:id/components', auth, async (req, res) => {
  const parentId = Number(req.params.id);
  const { component_material_instance_id, mass_fraction } = req.body;
  try {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка добавления компонента' });
  }
});

// --- REPLACE full composition for an instance ---
router.put('/instances/:id/components', auth, async (req, res) => {
  const parentId = Number(req.params.id);
  const components = Array.isArray(req.body.components) ? req.body.components : null;

  if (!Number.isInteger(parentId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  if (!components || components.length === 0) {
    return res.status(400).json({ error: 'Состав не передан' });
  }

  const normalized = [];
  const seenIds = new Set();
  let total = 0;

  for (const component of components) {
    const componentId = Number(component.component_material_instance_id);
    const massFraction = normalizeMassFraction(Number(component.mass_fraction));

    if (
      !Number.isInteger(componentId) ||
      !Number.isFinite(massFraction) ||
      massFraction <= 0 ||
      massFraction > 1
    ) {
      return res.status(400).json({ error: 'Некорректные данные состава' });
    }

    if (componentId === parentId) {
      return res.status(400).json({ error: 'Экземпляр не может содержать сам себя' });
    }

    if (seenIds.has(componentId)) {
      return res.status(400).json({ error: 'Один и тот же экземпляр нельзя добавить дважды' });
    }

    seenIds.add(componentId);
    total += massFraction;

    normalized.push({
      component_material_instance_id: componentId,
      mass_fraction: massFraction,
      notes: component.notes ? String(component.notes).trim() : null
    });
  }

  if (Math.abs(total - 1) > 0.0001) {
    return res.status(400).json({ error: 'Сумма состава должна быть ровно 100%' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Snapshot old composition for changelog
    const oldComp = await client.query(
      'SELECT component_material_instance_id, mass_fraction, notes FROM material_instance_components WHERE parent_material_instance_id = $1 ORDER BY component_material_instance_id',
      [parentId]
    );

    await client.query(
      `
      DELETE FROM material_instance_components
      WHERE parent_material_instance_id = $1
      `,
      [parentId]
    );

    for (const component of normalized) {
      await client.query(
        `
        INSERT INTO material_instance_components (
          parent_material_instance_id,
          component_material_instance_id,
          mass_fraction,
          notes
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          parentId,
          component.component_material_instance_id,
          component.mass_fraction,
          component.notes
        ]
      );
    }

    const result = await client.query(
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
      ORDER BY mi.name
      `,
      [parentId]
    );

    // Log composition change as JSON diff
    await trackChanges(client, 'material_composition', 'material_instances', 'material_instance_id', parentId,
      { composition: JSON.stringify(oldComp.rows) },
      { composition: JSON.stringify(normalized) },
      req.user.userId, null, false
    );

    await client.query('COMMIT');
    res.json(result.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения состава' });
  } finally {
    client.release();
  }
});



// --- UPDATE component ---
router.put('/instances/components/:id', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный material_instance_component_id' });
  }

  const { mass_fraction, notes } = req.body;

  const mf =
    mass_fraction === '' || mass_fraction === null || mass_fraction === undefined
      ? null
      : normalizeMassFraction(Number(mass_fraction));

  if (mf === null || !Number.isFinite(mf) || mf < 0 || mf > 1) {
    return res.status(400).json({ error: 'Некорректный mass_fraction (ожидается число 0..1)' });
  }

  try {
    const current = await pool.query('SELECT mass_fraction, notes FROM material_instance_components WHERE material_instance_component_id = $1', [id]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Компонент не найден' });
    }

    const newVals = { mass_fraction: mf, notes: notes || null };

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

    await trackChanges(pool, 'material_component', 'material_instance_components', 'material_instance_component_id', id, current.rows[0], newVals, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// --- DELETE component ---
router.delete('/instances/components/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await pool.query(
      `
      DELETE FROM material_instance_components
      WHERE material_instance_component_id = $1;
      `,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления компонента' });
  }
});




module.exports = router;
