'use strict';

/**
 * Track field-level changes for audit trail.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string}   entityType  - e.g. 'tape', 'battery'
 * @param {string}   tableName   - SQL table name
 * @param {string}   pkColumn    - primary key column name
 * @param {number}   entityId    - primary key value
 * @param {object}   oldValues   - current row (before update)
 * @param {object}   newValues   - payload being applied
 * @param {number}   userId      - req.user.userId
 * @param {string[]} [trackFields] - whitelist of fields to compare; null = all keys in newValues
 * @param {boolean}  [updateMeta=true] - update updated_by/updated_at on entity table
 */
async function trackChanges(db, entityType, tableName, pkColumn, entityId, oldValues, newValues, userId, trackFields, updateMeta) {
  if (updateMeta === undefined) updateMeta = true;
  const fields = trackFields || Object.keys(newValues);
  const changes = [];

  for (const field of fields) {
    if (!(field in newValues)) continue;
    // Skip meta fields themselves
    if (field === 'updated_by' || field === 'updated_at') continue;

    const oldVal = oldValues[field];
    const newVal = newValues[field];

    const oldStr = oldVal == null ? null : String(oldVal);
    const newStr = newVal == null ? null : String(newVal);

    if (oldStr !== newStr) {
      changes.push({ field_name: field, old_value: oldStr, new_value: newStr });
    }
  }

  if (changes.length === 0) return;

  // Batch insert changelog entries
  const valueClauses = [];
  const params = [];
  let idx = 1;

  for (const ch of changes) {
    valueClauses.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
    params.push(entityType, entityId, ch.field_name, ch.old_value, ch.new_value, userId);
    idx += 6;
  }

  await db.query(
    `INSERT INTO field_changelog (entity_type, entity_id, field_name, old_value, new_value, changed_by)
     VALUES ${valueClauses.join(', ')}`,
    params
  );

  if (updateMeta) {
    await db.query(
      `UPDATE ${tableName} SET updated_by = $1, updated_at = now() WHERE ${pkColumn} = $2`,
      [userId, entityId]
    );
  }
}

module.exports = { trackChanges };
