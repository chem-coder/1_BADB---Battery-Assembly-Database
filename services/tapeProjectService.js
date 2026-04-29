'use strict';

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizeTapeProjectIds(payload = {}) {
  const source = Object.prototype.hasOwnProperty.call(payload, 'project_ids')
    ? payload.project_ids
    : [payload.project_id];

  if (!Array.isArray(source)) {
    throw statusError('Некорректный список проектов', 400);
  }

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

function getPrimaryProjectId(projectIds) {
  return Array.isArray(projectIds) && projectIds.length ? projectIds[0] : null;
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

async function replaceTapeProjects(db, tapeId, projectIds, userId) {
  await validateProjectIds(db, projectIds);
  await db.query('DELETE FROM tape_projects WHERE tape_id = $1', [tapeId]);

  for (const projectId of projectIds) {
    await db.query(
      `
      INSERT INTO tape_projects (tape_id, project_id, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (tape_id, project_id) DO NOTHING
      `,
      [tapeId, projectId, userId || null]
    );
  }
}

async function attachTapeProjects(db, rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const tapeIds = sourceRows
    .map((row) => Number(row.tape_id))
    .filter((tapeId) => Number.isInteger(tapeId));

  if (!tapeIds.length) return sourceRows;

  const result = await db.query(
    `
    SELECT
      tp.tape_id,
      tp.project_id,
      p.name AS project_name
    FROM tape_projects tp
    JOIN projects p
      ON p.project_id = tp.project_id
    WHERE tp.tape_id = ANY($1::int[])
    ORDER BY tp.tape_id, p.name, tp.project_id
    `,
    [tapeIds]
  );

  const projectsByTapeId = new Map();
  result.rows.forEach((row) => {
    const tapeId = Number(row.tape_id);
    if (!projectsByTapeId.has(tapeId)) {
      projectsByTapeId.set(tapeId, []);
    }
    projectsByTapeId.get(tapeId).push({
      project_id: Number(row.project_id),
      name: row.project_name
    });
  });

  return sourceRows.map((row) => {
    const tapeId = Number(row.tape_id);
    let projects = projectsByTapeId.get(tapeId) || [];

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
  attachTapeProjects,
  getPrimaryProjectId,
  normalizeTapeProjectIds,
  replaceTapeProjects
};
