const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');

const ALLOWED_TARGET_FORM_FACTORS = new Set(['coin', 'pouch', 'cylindrical']);
const ALLOWED_TARGET_CONFIG_CODES = new Set([
  '2016',
  '2025',
  '2032',
  '103x83',
  '86x56',
  '18650',
  '21700',
  'other'
]);

const TARGET_CONFIG_CODES_BY_FORM_FACTOR = {
  coin: new Set(['2016', '2025', '2032', 'other']),
  pouch: new Set(['103x83', '86x56', 'other']),
  cylindrical: new Set(['18650', '21700', 'other'])
};

function toFiniteNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function calculateCutBatchAreaMm2(batch) {
  if (!batch) return null;

  if (batch.shape === 'circle') {
    const diameter = toFiniteNumberOrNull(batch.diameter_mm);
    if (!(diameter > 0)) return null;
    const radius = diameter / 2;
    return Math.PI * radius * radius;
  }

  if (batch.shape === 'rectangle') {
    const length = toFiniteNumberOrNull(batch.length_mm);
    const width = toFiniteNumberOrNull(batch.width_mm);
    if (!(length > 0) || !(width > 0)) return null;
    return length * width;
  }

  return null;
}

function getSideCountFromSidedness(coatingSidedness) {
  if (coatingSidedness === 'one_sided') return 1;
  if (coatingSidedness === 'two_sided') return 2;
  return null;
}

function getFallbackComponent(line) {
  const materialId = Number(line?.material_id);
  if (!Number.isInteger(materialId)) return [];
  return [{
    material_id: materialId,
    material_role: line?.material_role || null,
    mass_fraction: 1
  }];
}

function getLineComponents(line, componentsByInstanceId) {
  const selectedInstanceId = Number(line?.material_instance_id);
  if (Number.isInteger(selectedInstanceId) && componentsByInstanceId.has(selectedInstanceId)) {
    return componentsByInstanceId.get(selectedInstanceId);
  }
  return getFallbackComponent(line);
}

function averageOfFinite(values) {
  const numeric = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(value));
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function getEffectiveActualMass(line) {
  if (!line) return null;

  if (line.measure_mode === 'mass') {
    const actualMass = toFiniteNumberOrNull(line.actual_mass_g);
    return Number.isFinite(actualMass) && actualMass > 0 ? actualMass : null;
  }

  if (line.measure_mode === 'volume') {
    const actualVolumeMl = toFiniteNumberOrNull(line.actual_volume_ml);
    const density = toFiniteNumberOrNull(line.density_g_ml);
    if (!(Number.isFinite(actualVolumeMl) && actualVolumeMl > 0 && Number.isFinite(density) && density > 0)) {
      return null;
    }
    return actualVolumeMl * density;
  }

  return null;
}

function computeElectrodeDerivedValues(electrode, capacityContext) {
  const electrodeMass = toFiniteNumberOrNull(electrode?.electrode_mass_g);
  const averageFoilMass = toFiniteNumberOrNull(capacityContext?.average_foil_mass_g);
  const activeFractionTheoretical = toFiniteNumberOrNull(capacityContext?.active_fraction_theoretical);
  const activeFractionActual = toFiniteNumberOrNull(capacityContext?.active_fraction_actual);
  const specificCapacity = toFiniteNumberOrNull(capacityContext?.specific_capacity_mAh_g);

  const coatingMass =
    Number.isFinite(electrodeMass) && Number.isFinite(averageFoilMass)
      ? electrodeMass - averageFoilMass
      : null;

  const normalizedCoatingMass = Number.isFinite(coatingMass) && coatingMass > 0 ? coatingMass : null;

  const activeMaterialMassTheoretical =
    Number.isFinite(normalizedCoatingMass) && Number.isFinite(activeFractionTheoretical)
      ? normalizedCoatingMass * activeFractionTheoretical
      : null;

  const activeMaterialMassActual =
    Number.isFinite(normalizedCoatingMass) && Number.isFinite(activeFractionActual)
      ? normalizedCoatingMass * activeFractionActual
      : null;

  const capacityTheoretical =
    Number.isFinite(activeMaterialMassTheoretical) && Number.isFinite(specificCapacity)
      ? activeMaterialMassTheoretical * specificCapacity
      : null;

  const capacityActual =
    Number.isFinite(activeMaterialMassActual) && Number.isFinite(specificCapacity)
      ? activeMaterialMassActual * specificCapacity
      : null;

  return {
    coating_mass_g: normalizedCoatingMass,
    active_material_mass_theoretical_g: Number.isFinite(activeMaterialMassTheoretical) ? activeMaterialMassTheoretical : null,
    active_material_mass_actual_g: Number.isFinite(activeMaterialMassActual) ? activeMaterialMassActual : null,
    capacity_theoretical_mAh: Number.isFinite(capacityTheoretical) ? capacityTheoretical : null,
    capacity_actual_mAh: Number.isFinite(capacityActual) ? capacityActual : null
  };
}

function buildBatchCapacitySummary(electrodes, capacityContext) {
  const usableElectrodes = (Array.isArray(electrodes) ? electrodes : []).filter((row) => Number(row.status_code) !== 3);

  const averageCoatingMass = averageOfFinite(usableElectrodes.map((row) => toFiniteNumberOrNull(row.coating_mass_g)));
  const averageActiveMaterialMassTheoretical = averageOfFinite(usableElectrodes.map((row) => toFiniteNumberOrNull(row.active_material_mass_theoretical_g)));
  const averageActiveMaterialMassActual = averageOfFinite(usableElectrodes.map((row) => toFiniteNumberOrNull(row.active_material_mass_actual_g)));
  const averageCapacityTheoretical = averageOfFinite(usableElectrodes.map((row) => toFiniteNumberOrNull(row.capacity_theoretical_mAh)));
  const averageCapacityActual = averageOfFinite(usableElectrodes.map((row) => toFiniteNumberOrNull(row.capacity_actual_mAh)));
  const electrodeAreaCm2 = toFiniteNumberOrNull(capacityContext?.electrode_area_cm2);
  const sideCount = toFiniteNumberOrNull(capacityContext?.side_count);

  const arealCapacityTheoretical =
    Number.isFinite(averageCapacityTheoretical) && Number.isFinite(electrodeAreaCm2) && electrodeAreaCm2 > 0
      ? averageCapacityTheoretical / electrodeAreaCm2
      : null;
  const arealCapacityActual =
    Number.isFinite(averageCapacityActual) && Number.isFinite(electrodeAreaCm2) && electrodeAreaCm2 > 0
      ? averageCapacityActual / electrodeAreaCm2
      : null;

  const capacityPerSideTheoretical =
    Number.isFinite(arealCapacityTheoretical) && Number.isFinite(sideCount) && sideCount > 0
      ? arealCapacityTheoretical / sideCount
      : null;
  const capacityPerSideActual =
    Number.isFinite(arealCapacityActual) && Number.isFinite(sideCount) && sideCount > 0
      ? arealCapacityActual / sideCount
      : null;

  return {
    active_material_name: capacityContext?.active_material_name || null,
    active_material_instance_id: capacityContext?.active_material_instance_id ?? null,
    specific_capacity_mAh_g: toFiniteNumberOrNull(capacityContext?.specific_capacity_mAh_g),
    active_fraction_theoretical: toFiniteNumberOrNull(capacityContext?.active_fraction_theoretical),
    active_fraction_actual: toFiniteNumberOrNull(capacityContext?.active_fraction_actual),
    actual_fraction_status: capacityContext?.actual_fraction_status || null,
    average_foil_mass_g: toFiniteNumberOrNull(capacityContext?.average_foil_mass_g),
    foil_measurement_count: Number(capacityContext?.foil_measurement_count) || 0,
    electrode_area_mm2: toFiniteNumberOrNull(capacityContext?.electrode_area_mm2),
    electrode_area_cm2: toFiniteNumberOrNull(capacityContext?.electrode_area_cm2),
    coating_sidedness: capacityContext?.coating_sidedness || null,
    side_count: Number(capacityContext?.side_count) || null,
    average_coating_mass_g: averageCoatingMass,
    average_active_material_mass_theoretical_g: averageActiveMaterialMassTheoretical,
    average_active_material_mass_actual_g: averageActiveMaterialMassActual,
    average_capacity_theoretical_mAh: averageCapacityTheoretical,
    average_capacity_actual_mAh: averageCapacityActual,
    areal_capacity_theoretical_mAh_cm2: arealCapacityTheoretical,
    areal_capacity_actual_mAh_cm2: arealCapacityActual,
    capacity_per_side_theoretical_mAh_cm2: capacityPerSideTheoretical,
    capacity_per_side_actual_mAh_cm2: capacityPerSideActual,
    included_electrode_count: usableElectrodes.length,
    included_capacity_theoretical_count: usableElectrodes.filter((row) => Number.isFinite(toFiniteNumberOrNull(row.capacity_theoretical_mAh))).length,
    included_capacity_actual_count: usableElectrodes.filter((row) => Number.isFinite(toFiniteNumberOrNull(row.capacity_actual_mAh))).length
  };
}

async function fetchCutBatchCapacityContext(queryable, cutBatchId) {
  const batchResult = await queryable.query(
    `
    SELECT
      b.cut_batch_id,
      b.tape_id,
      b.shape,
      b.diameter_mm,
      b.length_mm,
      b.width_mm,
      (
        SELECT c.coating_sidedness
        FROM tape_process_steps ts_coating
        JOIN operation_types ot_coating
          ON ot_coating.operation_type_id = ts_coating.operation_type_id
        JOIN tape_step_coating c
          ON c.step_id = ts_coating.step_id
        WHERE ts_coating.tape_id = b.tape_id
          AND ot_coating.code = 'coating'
        LIMIT 1
      ) AS coating_sidedness
    FROM electrode_cut_batches b
    WHERE b.cut_batch_id = $1
    `,
    [cutBatchId]
  );

  if (!batchResult.rowCount) {
    return null;
  }

  const batch = batchResult.rows[0];

  const recipeLinesResult = await queryable.query(
    `
    SELECT
      rl.recipe_line_id,
      rl.material_id,
      rl.recipe_role,
      rl.include_in_pct,
      rl.slurry_percent,
      m.name AS material_name,
      m.role AS material_role,
      a.material_instance_id,
      mi.name AS instance_name,
      a.measure_mode,
      a.actual_mass_g,
      a.actual_volume_ml,
      mp.specific_capacity_mah_g,
      mp.density_g_ml
    FROM electrode_cut_batches b
    JOIN tapes t
      ON t.tape_id = b.tape_id
    JOIN tape_recipe_lines rl
      ON rl.tape_recipe_id = t.tape_recipe_id
    JOIN materials m
      ON m.material_id = rl.material_id
    LEFT JOIN tape_recipe_line_actuals a
      ON a.tape_id = t.tape_id
     AND a.recipe_line_id = rl.recipe_line_id
    LEFT JOIN material_instances mi
      ON mi.material_instance_id = a.material_instance_id
    LEFT JOIN material_properties mp
      ON mp.material_instance_id = a.material_instance_id
    WHERE b.cut_batch_id = $1
    ORDER BY rl.recipe_role, rl.recipe_line_id
    `,
    [cutBatchId]
  );

  const rows = recipeLinesResult.rows;
  const activeLine = rows.find(
    (line) => line.recipe_role === 'cathode_active' || line.recipe_role === 'anode_active'
  ) || null;

  const totalDryPercent = rows
    .filter((line) => line.include_in_pct)
    .reduce((sum, line) => sum + Number(line.slurry_percent || 0), 0);

  const activePercent = toFiniteNumberOrNull(activeLine?.slurry_percent);
  const activeFractionTheoretical =
    Number.isFinite(activePercent) &&
    Number.isFinite(totalDryPercent) &&
    totalDryPercent > 0 &&
    activePercent >= 0
      ? activePercent / totalDryPercent
      : null;

  const selectedInstanceIds = rows
    .map((row) => Number(row.material_instance_id))
    .filter((value) => Number.isInteger(value));

  const componentsByInstanceId = new Map();

  if (selectedInstanceIds.length) {
    const componentsResult = await queryable.query(
      `
      SELECT
        mic.parent_material_instance_id,
        mi.material_id,
        m.role AS material_role,
        mic.mass_fraction
      FROM material_instance_components mic
      JOIN material_instances mi
        ON mi.material_instance_id = mic.component_material_instance_id
      JOIN materials m
        ON m.material_id = mi.material_id
      WHERE mic.parent_material_instance_id = ANY($1::int[])
      ORDER BY mic.parent_material_instance_id, mic.material_instance_component_id
      `,
      [selectedInstanceIds]
    );

    componentsResult.rows.forEach((row) => {
      const instanceId = Number(row.parent_material_instance_id);
      if (!componentsByInstanceId.has(instanceId)) {
        componentsByInstanceId.set(instanceId, []);
      }
      componentsByInstanceId.get(instanceId).push({
        material_id: Number(row.material_id),
        material_role: row.material_role || null,
        mass_fraction: Number(row.mass_fraction)
      });
    });
  }

  const activeMaterialId = Number(activeLine?.material_id);
  let totalActualSolidsMass = 0;
  let actualActiveMaterialMass = 0;
  let hasUsableActuals = false;

  rows.forEach((line) => {
    const actualMass = getEffectiveActualMass(line);
    if (!(Number.isFinite(actualMass) && actualMass > 0)) return;

    hasUsableActuals = true;

    const components = getLineComponents(line, componentsByInstanceId);
    components.forEach((component) => {
      const fraction = toFiniteNumberOrNull(component.mass_fraction);
      if (!(Number.isFinite(fraction) && fraction > 0)) return;
      if (component.material_role === 'solvent') return;

      const componentMass = actualMass * fraction;
      totalActualSolidsMass += componentMass;

      if (Number.isInteger(activeMaterialId) && Number(component.material_id) === activeMaterialId) {
        actualActiveMaterialMass += componentMass;
      }
    });
  });

  const actualFractionStatus =
    !hasUsableActuals ? 'unavailable'
    : !(totalActualSolidsMass > 0) ? 'incomplete'
    : !(actualActiveMaterialMass >= 0) ? 'incomplete'
    : 'complete';

  const activeFractionActual =
    totalActualSolidsMass > 0
      ? actualActiveMaterialMass / totalActualSolidsMass
      : null;

  const foilStatsResult = await queryable.query(
    `
    SELECT
      AVG(mass_g) AS average_foil_mass_g,
      COUNT(*)::int AS foil_measurement_count
    FROM foil_mass_measurements
    WHERE cut_batch_id = $1
    `,
    [cutBatchId]
  );

  const foilStats = foilStatsResult.rows[0] || {};
  const electrodeAreaMm2 = calculateCutBatchAreaMm2(batch);
  const electrodeAreaCm2 = Number.isFinite(electrodeAreaMm2) ? electrodeAreaMm2 / 100 : null;
  const coatingSidedness = batch.coating_sidedness || null;
  const sideCount = getSideCountFromSidedness(coatingSidedness);

  return {
    cut_batch_id: batch.cut_batch_id,
    tape_id: batch.tape_id,
    active_material_name: activeLine?.instance_name || activeLine?.material_name || null,
    active_material_instance_id: Number(activeLine?.material_instance_id) || null,
    specific_capacity_mAh_g: toFiniteNumberOrNull(activeLine?.specific_capacity_mah_g),
    active_fraction_theoretical: activeFractionTheoretical,
    active_fraction_actual: Number.isFinite(activeFractionActual) ? activeFractionActual : null,
    actual_fraction_status: actualFractionStatus,
    average_foil_mass_g: toFiniteNumberOrNull(foilStats.average_foil_mass_g),
    foil_measurement_count: Number(foilStats.foil_measurement_count) || 0,
    electrode_area_mm2: electrodeAreaMm2,
    electrode_area_cm2: electrodeAreaCm2,
    coating_sidedness: coatingSidedness,
    side_count: sideCount
  };
}

function normalizeCutBatchGeometry({
  target_form_factor,
  target_config_code,
  target_config_other,
  shape,
  diameter_mm,
  length_mm,
  width_mm
}) {
  const normalizedTargetFormFactor = target_form_factor || null;
  const normalizedTargetConfigCode = target_config_code || null;
  const normalizedTargetConfigOther = target_config_other?.trim() || null;
  const normalizedShape =
    normalizedTargetFormFactor === 'coin' ? 'circle'
    : normalizedTargetFormFactor === 'pouch' || normalizedTargetFormFactor === 'cylindrical' ? 'rectangle'
    : (shape || null);
  const normalizedDiameter = diameter_mm != null && diameter_mm !== '' ? Number(diameter_mm) : null;
  const normalizedLength = length_mm != null && length_mm !== '' ? Number(length_mm) : null;
  const normalizedWidth = width_mm != null && width_mm !== '' ? Number(width_mm) : null;
  if (normalizedShape && !['circle', 'rectangle'].includes(normalizedShape)) {
    return { error: 'Некорректная форма электрода' };
  }

  if (!normalizedTargetFormFactor || !ALLOWED_TARGET_FORM_FACTORS.has(normalizedTargetFormFactor)) {
    return { error: 'Необходимо выбрать семейство элемента' };
  }

  if (!normalizedTargetConfigCode || !ALLOWED_TARGET_CONFIG_CODES.has(normalizedTargetConfigCode)) {
    return { error: 'Необходимо выбрать конфигурацию элемента' };
  }

  if (!TARGET_CONFIG_CODES_BY_FORM_FACTOR[normalizedTargetFormFactor].has(normalizedTargetConfigCode)) {
    return { error: 'Конфигурация не соответствует выбранному семейству элемента' };
  }

  if (
    normalizedTargetConfigCode === 'other' &&
    !normalizedTargetConfigOther
  ) {
    return { error: 'Для конфигурации other необходимо заполнить пояснение' };
  }

  if (normalizedDiameter != null && (!Number.isFinite(normalizedDiameter) || normalizedDiameter <= 0)) {
    return { error: 'Диаметр должен быть положительным числом' };
  }

  if (normalizedLength != null && (!Number.isFinite(normalizedLength) || normalizedLength <= 0)) {
    return { error: 'Длина должна быть положительным числом' };
  }

  if (normalizedWidth != null && (!Number.isFinite(normalizedWidth) || normalizedWidth <= 0)) {
    return { error: 'Ширина должна быть положительным числом' };
  }

  if (normalizedShape === 'circle') {
    if (normalizedDiameter == null) {
      return { error: 'Для круглого электрода необходимо указать диаметр' };
    }

    if (normalizedLength != null || normalizedWidth != null) {
      return { error: 'Для круглого электрода нельзя указывать длину и ширину' };
    }

    if (normalizedTargetFormFactor !== 'coin') {
      return { error: 'Круглый электрод может относиться только к монеточному элементу' };
    }
  }

  if (normalizedShape === 'rectangle') {
    if (normalizedLength == null || normalizedWidth == null) {
      return { error: 'Для прямоугольного электрода необходимо указать длину и ширину' };
    }

    if (normalizedDiameter != null) {
      return { error: 'Для прямоугольного электрода нельзя указывать диаметр' };
    }

    if (!['pouch', 'cylindrical'].includes(normalizedTargetFormFactor)) {
      return { error: 'Прямоугольный электрод может относиться только к pouch или cylindrical' };
    }
  }

  return {
    target_form_factor: normalizedTargetFormFactor,
    target_config_code: normalizedTargetConfigCode,
    target_config_other: normalizedTargetConfigOther,
    shape: normalizedShape,
    diameter_mm: normalizedDiameter,
    length_mm: normalizedLength,
    width_mm: normalizedWidth
  };
}

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});

router.get('/electrode-cut-batches', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        b.*,
        t.name AS tape_name,
        t.project_id,
        p.name AS project_name,
        r.role AS tape_role,
        (
          SELECT c.coating_sidedness
          FROM tape_process_steps ts_coating
          JOIN operation_types ot_coating
            ON ot_coating.operation_type_id = ts_coating.operation_type_id
          JOIN tape_step_coating c
            ON c.step_id = ts_coating.step_id
          WHERE ts_coating.tape_id = b.tape_id
            AND ot_coating.code = 'coating'
          LIMIT 1
        ) AS tape_coating_sidedness,
        u_created.name AS created_by_name,
        u_updated.name AS updated_by_name,
        d.start_time AS drying_start,
        d.end_time AS drying_end,
        COALESCE(ec.electrode_count, 0) AS electrode_count
      FROM electrode_cut_batches b
      JOIN tapes t
        ON t.tape_id = b.tape_id
      LEFT JOIN projects p
        ON p.project_id = t.project_id
      LEFT JOIN tape_recipes r
        ON r.tape_recipe_id = t.tape_recipe_id
      LEFT JOIN users u_created
        ON u_created.user_id = b.created_by
      LEFT JOIN users u_updated
        ON u_updated.user_id = b.updated_by
      LEFT JOIN electrode_drying d
        ON d.cut_batch_id = b.cut_batch_id
      LEFT JOIN (
        SELECT
          cut_batch_id,
          COUNT(*) AS electrode_count
        FROM electrodes
        GROUP BY cut_batch_id
      ) ec
        ON ec.cut_batch_id = b.cut_batch_id
      ORDER BY b.created_at DESC, b.cut_batch_id DESC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- ELECTRODE CUT BATCHES --------
// CREATE cut batch
router.post('/electrode-cut-batches', auth, async (req, res) => {
  const {
    tape_id,
    created_by,
    target_form_factor,
    target_config_code,
    target_config_other,
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

  const geometry = normalizeCutBatchGeometry({
    target_form_factor,
    target_config_code,
    target_config_other,
    shape,
    diameter_mm,
    length_mm,
    width_mm
  });

  if (geometry.error) {
    return res.status(400).json({ error: geometry.error });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tapeResult = await client.query(
      `
      SELECT tape_id, availability_status
      FROM tapes
      WHERE tape_id = $1
      `,
      [tapeId]
    );

    if (!tapeResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Лента не найдена' });
    }

    if (tapeResult.rows[0].availability_status === 'depleted') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Лента отмечена как израсходованная' });
    }

    const result = await client.query(
      `
      INSERT INTO electrode_cut_batches (
        tape_id,
        created_by,
        target_form_factor,
        target_config_code,
        target_config_other,
        shape,
        diameter_mm,
        length_mm,
        width_mm,
        comments
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        tapeId,
        createdBy,
        geometry.target_form_factor,
        geometry.target_config_code,
        geometry.target_config_other,
        geometry.shape,
        geometry.diameter_mm,
        geometry.length_mm,
        geometry.width_mm,
        comments || null
      ]
    );

    await client.query(
      `
      INSERT INTO tape_dry_box_state (
        tape_id,
        started_at,
        removed_at,
        temperature_c,
        atmosphere,
        other_parameters,
        comments,
        updated_by,
        updated_at
      )
      SELECT
        $1,
        COALESCE(ds.started_at, final_dry.started_at, now()),
        now(),
        COALESCE(ds.temperature_c, final_dry.temperature_c),
        COALESCE(ds.atmosphere, final_dry.atmosphere),
        COALESCE(ds.other_parameters, final_dry.other_parameters),
        ds.comments,
        $2,
        now()
      FROM (SELECT 1) seed
      LEFT JOIN tape_dry_box_state ds
        ON ds.tape_id = $1
      LEFT JOIN LATERAL (
        SELECT
          s.started_at,
          d.temperature_c,
          d.atmosphere,
          d.other_parameters
        FROM tape_process_steps s
        JOIN operation_types ot
          ON ot.operation_type_id = s.operation_type_id
        LEFT JOIN tape_step_drying d
          ON d.step_id = s.step_id
        WHERE s.tape_id = $1
          AND ot.code = 'drying_pressed_tape'
        ORDER BY s.started_at DESC NULLS LAST, s.step_id DESC
        LIMIT 1
      ) final_dry ON TRUE
      ON CONFLICT (tape_id)
      DO UPDATE SET
        started_at = COALESCE(tape_dry_box_state.started_at, EXCLUDED.started_at),
        removed_at = EXCLUDED.removed_at,
        temperature_c = COALESCE(tape_dry_box_state.temperature_c, EXCLUDED.temperature_c),
        atmosphere = COALESCE(tape_dry_box_state.atmosphere, EXCLUDED.atmosphere),
        other_parameters = COALESCE(tape_dry_box_state.other_parameters, EXCLUDED.other_parameters),
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      `,
      [tapeId, createdBy]
    );

    await client.query(
      `
      UPDATE tapes
      SET availability_status = 'out_of_dry_box'
      WHERE tape_id = $1
      `,
      [tapeId]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// UPDATE
router.put('/electrode-cut-batches/:id', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  const {
    target_form_factor,
    target_config_code,
    target_config_other,
    shape,
    diameter_mm,
    length_mm,
    width_mm,
    comments
  } = req.body;

  if (!Number.isInteger(cutBatchId) || cutBatchId <= 0) {
    return res.status(400).json({ error: 'Некорректный ID партии' });
  }

  try {
    const currentRes = await pool.query(
      `
      SELECT
        target_form_factor,
        target_config_code,
        target_config_other,
        shape,
        diameter_mm,
        length_mm,
        width_mm,
        comments
      FROM electrode_cut_batches
      WHERE cut_batch_id = $1
      `,
      [cutBatchId]
    );

    if (currentRes.rowCount === 0) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    const current = currentRes.rows[0];
    const geometry = normalizeCutBatchGeometry({
      target_form_factor: target_form_factor !== undefined ? target_form_factor : current.target_form_factor,
      target_config_code: target_config_code !== undefined ? target_config_code : current.target_config_code,
      target_config_other: target_config_other !== undefined ? target_config_other : current.target_config_other,
      shape: shape !== undefined ? shape : current.shape,
      diameter_mm: diameter_mm !== undefined ? diameter_mm : current.diameter_mm,
      length_mm: length_mm !== undefined ? length_mm : current.length_mm,
      width_mm: width_mm !== undefined ? width_mm : current.width_mm
    });

    if (geometry.error) {
      return res.status(400).json({ error: geometry.error });
    }

    const newVals = {
      target_form_factor: geometry.target_form_factor,
      target_config_code: geometry.target_config_code,
      target_config_other: geometry.target_config_other,
      shape: geometry.shape,
      diameter_mm: geometry.diameter_mm,
      length_mm: geometry.length_mm,
      width_mm: geometry.width_mm,
      comments: comments !== undefined ? (comments || null) : current.comments
    };

    const result = await pool.query(
      `
      UPDATE electrode_cut_batches
      SET
        target_form_factor = $1,
        target_config_code = $2,
        target_config_other = $3,
        shape = $4,
        diameter_mm = $5,
        length_mm = $6,
        width_mm = $7,
        comments = $8,
        updated_by = $9,
        updated_at = now()
      WHERE cut_batch_id = $10
      RETURNING *
      `,
      [
        newVals.target_form_factor,
        newVals.target_config_code,
        newVals.target_config_other,
        newVals.shape,
        newVals.diameter_mm,
        newVals.length_mm,
        newVals.width_mm,
        newVals.comments,
        req.user.userId,
        cutBatchId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    await trackChanges(pool, 'electrode_cut_batch', 'electrode_cut_batches', 'cut_batch_id', cutBatchId, current, newVals, req.user.userId);

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET cut batch by ID
router.get('/electrode-cut-batches/:id', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const [result, capacityContext, electrodesResult] = await Promise.all([
      pool.query(
      `
      SELECT b.*,
        b.tape_id,
        (
          SELECT c.coating_sidedness
          FROM tape_process_steps ts_coating
          JOIN operation_types ot_coating
            ON ot_coating.operation_type_id = ts_coating.operation_type_id
          JOIN tape_step_coating c
            ON c.step_id = ts_coating.step_id
          WHERE ts_coating.tape_id = b.tape_id
            AND ot_coating.code = 'coating'
          LIMIT 1
        ) AS tape_coating_sidedness,
        u_created.name AS created_by_name,
        u_updated.name AS updated_by_name
      FROM electrode_cut_batches b
      LEFT JOIN users u_created ON u_created.user_id = b.created_by
      LEFT JOIN users u_updated ON u_updated.user_id = b.updated_by
      WHERE b.cut_batch_id = $1
      `,
      [cutBatchId]
      ),
      fetchCutBatchCapacityContext(pool, cutBatchId),
      pool.query(
        `
        SELECT *
        FROM electrodes
        WHERE cut_batch_id = $1
        ORDER BY
          status_code ASC,
          electrode_mass_g DESC,
          electrode_id ASC
        `,
        [cutBatchId]
      )
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    const electrodesWithDerived = electrodesResult.rows.map((row) => ({
      ...row,
      ...computeElectrodeDerivedValues(row, capacityContext)
    }));
    const capacitySummary = buildBatchCapacitySummary(electrodesWithDerived, capacityContext);

    res.json({
      ...result.rows[0],
      capacity_summary: capacitySummary
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/electrode-cut-batches/:id/report', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const batchResult = await pool.query(
      `
      SELECT
        b.cut_batch_id,
        b.tape_id,
        b.comments,
        b.target_form_factor,
        b.target_config_code,
        b.target_config_other,
        b.shape,
        b.diameter_mm,
        b.length_mm,
        b.width_mm,
        b.created_at,
        b.updated_at,
        b.created_by,
        b.updated_by,
        u_created.name AS created_by_name,
        u_updated.name AS updated_by_name,
        t.name AS tape_name,
        t.availability_status AS tape_availability_status,
        r.role AS tape_role,
        r.name AS tape_recipe_name,
        p.name AS project_name,
        (
          SELECT c.coating_sidedness
          FROM tape_process_steps ts_coating
          JOIN operation_types ot_coating
            ON ot_coating.operation_type_id = ts_coating.operation_type_id
          JOIN tape_step_coating c
            ON c.step_id = ts_coating.step_id
          WHERE ts_coating.tape_id = b.tape_id
            AND ot_coating.code = 'coating'
          LIMIT 1
        ) AS tape_coating_sidedness,
        d.drying_id,
        d.start_time AS drying_start_time,
        d.end_time AS drying_end_time,
        d.temperature_c AS drying_temperature_c,
        d.other_parameters AS drying_other_parameters,
        d.comments AS drying_comments
      FROM electrode_cut_batches b
      JOIN tapes t
        ON t.tape_id = b.tape_id
      LEFT JOIN tape_recipes r
        ON r.tape_recipe_id = t.tape_recipe_id
      LEFT JOIN projects p
        ON p.project_id = t.project_id
      LEFT JOIN users u_created
        ON u_created.user_id = b.created_by
      LEFT JOIN users u_updated
        ON u_updated.user_id = b.updated_by
      LEFT JOIN electrode_drying d
        ON d.cut_batch_id = b.cut_batch_id
      WHERE b.cut_batch_id = $1
      `,
      [cutBatchId]
    );

    if (batchResult.rowCount === 0) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    const foilMassesResult = await pool.query(
      `
      SELECT foil_measurement_id, mass_g
      FROM foil_mass_measurements
      WHERE cut_batch_id = $1
      ORDER BY foil_measurement_id ASC
      `,
      [cutBatchId]
    );

    const electrodesResult = await pool.query(
      `
      SELECT
        electrode_id,
        number_in_batch,
        electrode_mass_g,
        cup_number,
        comments,
        status_code,
        used_in_battery_id,
        scrapped_reason
      FROM electrodes
      WHERE cut_batch_id = $1
      ORDER BY number_in_batch ASC, electrode_id ASC
      `,
      [cutBatchId]
    );

    const capacityContext = await fetchCutBatchCapacityContext(pool, cutBatchId);
    const electrodesWithDerived = electrodesResult.rows.map((row) => ({
      ...row,
      ...computeElectrodeDerivedValues(row, capacityContext)
    }));
    const capacitySummary = buildBatchCapacitySummary(electrodesWithDerived, capacityContext);

    res.json({
      batch: batchResult.rows[0],
      foil_masses: foilMassesResult.rows,
      electrodes: electrodesWithDerived,
      capacity_summary: capacitySummary
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки печатного отчёта по партии электродов' });
  }
});

// DELETE cut batch (and cascade delete electrodes and measurements)
router.delete('/electrode-cut-batches/:id', auth, async (req, res) => {
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



// GET electrodes by batch
router.get('/electrode-cut-batches/:id/electrodes', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const [result, capacityContext] = await Promise.all([
      pool.query(
      `
      SELECT *
      FROM electrodes
      WHERE cut_batch_id = $1
      ORDER BY
        status_code ASC,
        electrode_mass_g DESC,
        electrode_id ASC
      `,
      [cutBatchId]
      ),
      fetchCutBatchCapacityContext(pool, cutBatchId)
    ]);

    res.json(
      result.rows.map((row) => ({
        ...row,
        ...computeElectrodeDerivedValues(row, capacityContext)
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- FOIL MASS MEASUREMENTS --------

// ADD measurement
router.post('/electrode-cut-batches/:id/foil-masses', auth, async (req, res) => {
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
router.get('/electrode-cut-batches/:id/foil-masses', auth, async (req, res) => {
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
router.delete('/electrode-cut-batches/:id/foil-masses', auth, async (req, res) => {
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


// These don't seem to appear anywhere... 
// THere are no foil-measurements routes in the html files... 
// UPDATE measurement
router.put('/foil-measurements/:id', auth, async (req, res) => {
  const measurementId = Number(req.params.id);
  const { mass_g } = req.body;

  if (!Number.isInteger(measurementId) || !mass_g || Number(mass_g) <= 0) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const current = await pool.query('SELECT mass_g FROM foil_mass_measurements WHERE foil_measurement_id = $1', [measurementId]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Измерение не найдено' });
    }

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

    await trackChanges(pool, 'foil_measurement', 'foil_mass_measurements', 'foil_measurement_id', measurementId, current.rows[0], { mass_g }, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE measurement
router.delete('/foil-measurements/:id', auth, async (req, res) => {
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



// -------- ELECTRODES --------

// CREATE electrode
router.post('/', auth, async (req, res) => {
  const {
    cut_batch_id,
    electrode_mass_g,
    cup_number,
    comments
  } = req.body;

  const mass = Number(electrode_mass_g);
  
  if (
    !Number.isInteger(cut_batch_id) ||
    !Number.isFinite(mass) ||
    mass <= 0
  ) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO electrodes (
        cut_batch_id,
        number_in_batch,
        electrode_mass_g,
        cup_number,
        comments
      )
      VALUES (
        $1,
        (
          SELECT COALESCE(MAX(number_in_batch),0) + 1
          FROM electrodes
          WHERE cut_batch_id = $1
        ),
        $2,
        $3,
        $4
      )
      RETURNING *
      `,
      [
        cut_batch_id,
        mass,
        cup_number ?? null,
        comments || null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });

  }
});

// UPDATE electrode status
router.put('/:id/status', auth, async (req, res) => {
  const electrodeId = Number(req.params.id);
  const { status_code, used_in_battery_id, scrapped_reason } = req.body;

  if (!Number.isInteger(electrodeId) || !Number.isInteger(status_code)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  if (![1,2,3].includes(status_code)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }

  if (status_code === 3 && !scrapped_reason) {
    return res.status(400).json({ error: 'Нужно указать причину списания' });
  }

  if (status_code === 2 && !used_in_battery_id) {
    return res.status(400).json({ error: 'Нужно указать батарею' });
  }
  
  try {
    const current = await pool.query('SELECT status_code, used_in_battery_id, scrapped_reason FROM electrodes WHERE electrode_id = $1', [electrodeId]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Электрод не найден' });
    }

    const newVals = { status_code, used_in_battery_id: used_in_battery_id || null, scrapped_reason: scrapped_reason || null };

    const result = await pool.query(
      `
      UPDATE electrodes
      SET status_code = $1,
          used_in_battery_id = $2,
          scrapped_reason = $3
      WHERE electrode_id = $4
      RETURNING *
      `,
      [newVals.status_code, newVals.used_in_battery_id, newVals.scrapped_reason, electrodeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Электрод не найден' });
    }

    await trackChanges(pool, 'electrode', 'electrodes', 'electrode_id', electrodeId, current.rows[0], newVals, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE electrode fields (mass, cup, comments)
router.put('/:id', auth, async (req, res) => {

  const electrodeId = Number(req.params.id);
  const {
    electrode_mass_g,
    cup_number,
    comments
  } = req.body;

  if (!Number.isInteger(electrodeId)) {
    return res.status(400).json({ error: 'Invalid electrode id' });
  }

  try {
    const current = await pool.query('SELECT electrode_mass_g, cup_number, comments FROM electrodes WHERE electrode_id = $1', [electrodeId]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Electrode not found' });
    }

    const result = await pool.query(
      `
      UPDATE electrodes
      SET
        electrode_mass_g = COALESCE($1, electrode_mass_g),
        cup_number = COALESCE($2, cup_number),
        comments = COALESCE($3, comments)
      WHERE electrode_id = $4
      RETURNING *
      `,
      [
        electrode_mass_g ?? null,
        cup_number ?? null,
        comments ?? null,
        electrodeId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Electrode not found' });
    }

    const newVals = {};
    if (electrode_mass_g !== undefined) newVals.electrode_mass_g = electrode_mass_g;
    if (cup_number !== undefined) newVals.cup_number = cup_number;
    if (comments !== undefined) newVals.comments = comments;
    await trackChanges(pool, 'electrode', 'electrodes', 'electrode_id', electrodeId, current.rows[0], newVals, req.user.userId, null, false);

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Server error' });

  }

});

// DELETE single electrode
router.delete('/:id', auth, async (req, res) => {

  const electrodeId = Number(req.params.id);

  if (!Number.isInteger(electrodeId)) {
    return res.status(400).json({ error: 'Invalid electrode id' });
  }

  try {

    const check = await pool.query(
      `
      SELECT used_in_battery_id
      FROM electrodes
      WHERE electrode_id = $1
      `,
      [electrodeId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Electrode not found' });
    }

    if (check.rows[0].used_in_battery_id) {
      return res.status(400).json({
        error: 'Electrode already used in a battery and cannot be deleted'
      });
    }

    await pool.query(
      `
      DELETE FROM electrodes
      WHERE electrode_id = $1
      `,
      [electrodeId]
    );

    res.json({ success: true });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Server error' });

  }

});


// -------- ELECTRODE DRYING --------

// CREATE or UPDATE drying record (UPSERT)
router.post('/electrode-cut-batches/:id/drying', auth, async (req, res) => {

  const cutBatchId = Number(req.params.id);

  const {
    start_time,
    end_time,
    temperature_c,
    other_parameters,
    comments
  } = req.body;

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {

    const result = await pool.query(
      `
      INSERT INTO electrode_drying (
        cut_batch_id,
        start_time,
        end_time,
        temperature_c,
        other_parameters,
        comments
      )
      VALUES ($1,$2,$3,$4,$5,$6)

      ON CONFLICT (cut_batch_id)
      DO UPDATE SET
        start_time       = EXCLUDED.start_time,
        end_time         = EXCLUDED.end_time,
        temperature_c    = EXCLUDED.temperature_c,
        other_parameters = EXCLUDED.other_parameters,
        comments         = EXCLUDED.comments

      RETURNING *
      `,
      [
        cutBatchId,
        start_time || null,
        end_time || null,
        temperature_c ?? null,
        other_parameters || null,
        comments || null
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });

  }

});

// GET drying records by batch
router.get('/electrode-cut-batches/:id/drying', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM electrode_drying
      WHERE cut_batch_id = $1
      LIMIT 1
      `,
      [cutBatchId]
    );

    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT update drying record
router.put('/electrode-drying/:id', auth, async (req, res) => {
  const dryingId = Number(req.params.id);
  const { start_time, end_time, temperature_c, other_parameters, comments } = req.body;

  if (!Number.isInteger(dryingId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const current = await pool.query('SELECT start_time, end_time, temperature_c, other_parameters, comments FROM electrode_drying WHERE drying_id = $1', [dryingId]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    const newVals = { start_time: start_time || null, end_time: end_time || null, temperature_c: temperature_c ?? null, other_parameters: other_parameters || null, comments: comments || null };

    const result = await pool.query(
      `
      UPDATE electrode_drying
      SET start_time = $1,
          end_time = $2,
          temperature_c = $3,
          other_parameters = $4,
          comments = $5
      WHERE drying_id = $6
      RETURNING *
      `,
      [newVals.start_time, newVals.end_time, newVals.temperature_c, newVals.other_parameters, newVals.comments, dryingId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    await trackChanges(pool, 'electrode_drying', 'electrode_drying', 'drying_id', dryingId, current.rows[0], newVals, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE drying record
router.delete('/electrode-drying/:id', auth, async (req, res) => {
  const dryingId = Number(req.params.id);

  if (!Number.isInteger(dryingId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    await pool.query(
      `DELETE FROM electrode_drying WHERE drying_id = $1`,
      [dryingId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});




module.exports = router;
