const { trackChanges } = require('../middleware/trackChanges');
const {
  ensureMaterialSourceForPureInstance,
  getMaterialInstanceContext
} = require('./materialInstanceService');

const QUALITY_RATING_LABELS = new Set(['good', 'ok', 'bad', 'tbd']);

class MaterialInfoValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MaterialInfoValidationError';
    this.statusCode = 400;
  }
}

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizeOptionalNumber(value) {
  return value === '' || value === null || value === undefined ? null : Number(value);
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeMaterialPropertiesPayload(payload) {
  const specificCapacityValue =
    payload.specific_capacity_mah_g !== undefined
      ? payload.specific_capacity_mah_g
      : payload.specific_capacity_mAh_g;
  const normalizedSpecificCapacity = normalizeOptionalNumber(specificCapacityValue);
  const normalizedDensity = normalizeOptionalNumber(payload.density_g_ml);

  if (
    normalizedSpecificCapacity !== null &&
    (!Number.isFinite(normalizedSpecificCapacity) || normalizedSpecificCapacity < 0)
  ) {
    throw new MaterialInfoValidationError('Удельная ёмкость должна быть неотрицательным числом');
  }

  if (normalizedDensity !== null && (!Number.isFinite(normalizedDensity) || normalizedDensity < 0)) {
    throw new MaterialInfoValidationError('Плотность должна быть неотрицательным числом');
  }

  return {
    specific_capacity_mah_g: normalizedSpecificCapacity,
    density_g_ml: normalizedDensity,
    notes: normalizeOptionalText(payload.notes)
  };
}

function withMaterialPropertyAliases(properties) {
  if (!properties) return null;
  return {
    ...properties,
    specific_capacity_mAh_g: properties.specific_capacity_mah_g
  };
}

function normalizeMaterialSourcePayload(payload) {
  const normalizedLabel =
    payload.quality_rating_label === '' ||
    payload.quality_rating_label === null ||
    payload.quality_rating_label === undefined
      ? null
      : String(payload.quality_rating_label).trim();
  const normalizedScore = normalizeOptionalNumber(payload.quality_rating_score);

  if (normalizedLabel !== null && !QUALITY_RATING_LABELS.has(normalizedLabel)) {
    throw new MaterialInfoValidationError('Некорректная метка качества');
  }

  if (
    normalizedScore !== null &&
    (!Number.isInteger(normalizedScore) || normalizedScore < 1 || normalizedScore > 5)
  ) {
    throw new MaterialInfoValidationError('Оценка качества должна быть целым числом от 1 до 5');
  }

  return {
    supplier: normalizeOptionalText(payload.supplier),
    brand: normalizeOptionalText(payload.brand),
    model_or_catalog_no: normalizeOptionalText(payload.model_or_catalog_no),
    lot_number: normalizeOptionalText(payload.lot_number),
    date_ordered: payload.date_ordered || null,
    date_received: payload.date_received || null,
    quality_rating_label: normalizedLabel,
    quality_rating_score: normalizedScore,
    evaluation_notes: normalizeOptionalText(payload.evaluation_notes),
    is_evaluated: Boolean(payload.is_evaluated)
  };
}

async function getMaterialProperties(pool, materialInstanceId) {
  const context = await getMaterialInstanceContext(pool, materialInstanceId);

  if (!context) {
    throw statusError('Экземпляр материала не найден', 404);
  }

  const result = await pool.query(
    `
    SELECT
      mp.material_property_id,
      mp.material_instance_id,
      mp.specific_capacity_mah_g,
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
    [materialInstanceId]
  );

  return {
    instance: context,
    properties: withMaterialPropertyAliases(result.rows[0])
  };
}

async function saveMaterialProperties(pool, materialInstanceId, payload, userId) {
  const newVals = normalizeMaterialPropertiesPayload(payload);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const context = await getMaterialInstanceContext(client, materialInstanceId);

    if (!context) {
      throw statusError('Экземпляр материала не найден', 404);
    }

    const current = await client.query(
      `
      SELECT specific_capacity_mah_g, density_g_ml, notes
      FROM material_properties
      WHERE material_instance_id = $1
      `,
      [materialInstanceId]
    );

    const result = await client.query(
      `
      INSERT INTO material_properties (
        material_instance_id,
        specific_capacity_mah_g,
        density_g_ml,
        notes,
        updated_at,
        updated_by
      )
      VALUES ($1, $2, $3, $4, now(), $5)
      ON CONFLICT (material_instance_id)
      DO UPDATE
      SET
        specific_capacity_mah_g = EXCLUDED.specific_capacity_mah_g,
        density_g_ml = EXCLUDED.density_g_ml,
        notes = EXCLUDED.notes,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by
      RETURNING *
      `,
      [
        materialInstanceId,
        newVals.specific_capacity_mah_g,
        newVals.density_g_ml,
        newVals.notes,
        userId
      ]
    );

    await trackChanges(
      client,
      'material_properties',
      'material_properties',
      'material_property_id',
      result.rows[0].material_property_id,
      current.rows[0] || {},
      newVals,
      userId,
      null,
      false
    );

    await client.query('COMMIT');
    return {
      instance: context,
      properties: withMaterialPropertyAliases(result.rows[0])
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getMaterialSourceInfo(pool, materialInstanceId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const context = await ensureMaterialSourceForPureInstance(client, materialInstanceId);

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
    return {
      instance: context,
      source: result.rows[0] || null
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function saveMaterialSourceInfo(pool, materialInstanceId, payload, userId) {
  const newVals = normalizeMaterialSourcePayload(payload);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const context = await ensureMaterialSourceForPureInstance(client, materialInstanceId, userId);

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
        userId,
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
      userId,
      null,
      false
    );

    await client.query('COMMIT');
    return {
      instance: context,
      source: result.rows[0]
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  MaterialInfoValidationError,
  getMaterialProperties,
  getMaterialSourceInfo,
  saveMaterialProperties,
  saveMaterialSourceInfo
};
