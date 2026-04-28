function compactRecord(row) {
  const record = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;
    record[key] = value;
  }
  return record;
}

async function collectDependencyConflicts(db, checks) {
  const dependencies = [];

  for (const check of checks) {
    const result = await db.query(check.query, check.params || []);
    const rows = result.rows || [];
    if (rows.length === 0) continue;

    dependencies.push({
      key: check.key,
      label: check.label,
      count: rows.length,
      records: rows.map(compactRecord)
    });
  }

  return dependencies;
}

function sendDependencyConflict(res, message, dependencies) {
  return res.status(409).json({
    error: message,
    dependencies
  });
}

function sendForeignKeyConflict(res, err, fallbackMessage) {
  if (err?.code !== '23503') return false;

  res.status(409).json({
    error: fallbackMessage,
    constraint: err.constraint || null
  });
  return true;
}

module.exports = {
  collectDependencyConflicts,
  sendDependencyConflict,
  sendForeignKeyConflict
};
