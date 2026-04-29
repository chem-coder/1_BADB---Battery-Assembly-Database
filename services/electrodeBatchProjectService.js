'use strict';

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizeProjectIds(values) {
  const source = Array.isArray(values) ? values : [values];
  const projectIds = [];

  source.forEach((value) => {
    if (value === null || value === undefined || value === '') return;
    const projectId = Number(value);
    if (!Number.isInteger(projectId)) {
      throw statusError('Некорректный project_id', 400);
    }
    if (!projectIds.includes(projectId)) {
      projectIds.push(projectId);
    }
  });

  return projectIds;
}

function getPayloadProjectIds(payload = {}) {
  if (Object.prototype.hasOwnProperty.call(payload, 'project_ids')) {
    return normalizeProjectIds(payload.project_ids);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'project_id')) {
    return normalizeProjectIds(payload.project_id);
  }
  return null;
}

async function validateProjectIds(db, projectIds) {
  if (!projectIds.length) return;

  const result = await db.query(
    'SELECT project_id FROM projects WHERE project_id = ANY($1::int[])',
    [projectIds]
  );
  const found = new Set(result.rows.map((row) => Number(row.project_id)));
  const missing = projectIds.filter((projectId) => !found.has(projectId));

  if (missing.length) {
    throw statusError('Некорректный project_id', 400);
  }
}

async function getTapeProjectIds(db, tapeId) {
  const result = await db.query(
    `
    SELECT project_id
    FROM tape_projects
    WHERE tape_id = $1

    UNION

    SELECT project_id
    FROM tapes
    WHERE tape_id = $1
      AND project_id IS NOT NULL

    ORDER BY project_id
    `,
    [tapeId]
  );

  return result.rows.map((row) => Number(row.project_id));
}

async function validateProjectIdsForTape(db, tapeId, projectIds) {
  await validateProjectIds(db, projectIds);

  const tapeProjectIds = await getTapeProjectIds(db, tapeId);
  const allowed = new Set(tapeProjectIds);
  const invalid = projectIds.filter((projectId) => !allowed.has(projectId));

  if (invalid.length) {
    throw statusError('Проекты партии электродов должны быть связаны с выбранной лентой', 400);
  }
}

async function replaceElectrodeBatchProjects(db, cutBatchId, projectIds, userId) {
  await validateProjectIds(db, projectIds);
  await db.query(
    'DELETE FROM electrode_cut_batch_projects WHERE cut_batch_id = $1',
    [cutBatchId]
  );

  for (const projectId of projectIds) {
    await db.query(
      `
      INSERT INTO electrode_cut_batch_projects (cut_batch_id, project_id, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (cut_batch_id, project_id) DO NOTHING
      `,
      [cutBatchId, projectId, userId || null]
    );
  }
}

async function attachElectrodeBatchProjects(db, rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const cutBatchIds = sourceRows
    .map((row) => Number(row.cut_batch_id))
    .filter((cutBatchId) => Number.isInteger(cutBatchId));

  if (!cutBatchIds.length) return sourceRows;

  const result = await db.query(
    `
    SELECT
      ecbp.cut_batch_id,
      ecbp.project_id,
      p.name AS project_name
    FROM electrode_cut_batch_projects ecbp
    JOIN projects p
      ON p.project_id = ecbp.project_id
    WHERE ecbp.cut_batch_id = ANY($1::int[])
    ORDER BY ecbp.cut_batch_id, p.name, ecbp.project_id
    `,
    [cutBatchIds]
  );

  const projectsByBatchId = new Map();
  result.rows.forEach((row) => {
    const cutBatchId = Number(row.cut_batch_id);
    if (!projectsByBatchId.has(cutBatchId)) {
      projectsByBatchId.set(cutBatchId, []);
    }
    projectsByBatchId.get(cutBatchId).push({
      project_id: Number(row.project_id),
      name: row.project_name
    });
  });

  return sourceRows.map((row) => {
    const cutBatchId = Number(row.cut_batch_id);
    let projects = projectsByBatchId.get(cutBatchId) || [];

    if (!projects.length && row.project_id) {
      projects = [{
        project_id: Number(row.project_id),
        name: row.project_name || null
      }];
    }

    const projectIds = projects.map((project) => project.project_id);
    const projectNames = projects
      .map((project) => project.name)
      .filter(Boolean)
      .join(', ');

    return {
      ...row,
      project_id: row.project_id ?? (projectIds[0] || null),
      project_name: projectNames || row.project_name || null,
      project_ids: projectIds,
      projects,
      project_names: projectNames || null
    };
  });
}

module.exports = {
  attachElectrodeBatchProjects,
  getPayloadProjectIds,
  getTapeProjectIds,
  validateProjectIdsForTape,
  replaceElectrodeBatchProjects
};
