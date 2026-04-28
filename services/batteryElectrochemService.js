const fs = require('fs/promises');
const path = require('path');

const ELECTROCHEM_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'electrochem');

async function fetchBatteryElectrochem(pool, batteryId) {
  const result = await pool.query(
    `
    SELECT
      battery_electrochem_id,
      battery_id,
      file_name,
      file_link,
      electrochem_notes,
      uploaded_at
    FROM battery_electrochem
    WHERE battery_id = $1
    ORDER BY battery_electrochem_id
    `,
    [batteryId]
  );

  return result.rows.length === 0 ? null : result.rows;
}

async function saveBatteryElectrochem(pool, batteryId, entries) {
  await fs.mkdir(ELECTROCHEM_UPLOAD_DIR, { recursive: true });

  for (const entry of entries) {
    const originalName = entry.file_name || 'electrochem_file';
    const safeName = String(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const relativePath = `/uploads/electrochem/${storedName}`;
    const absolutePath = path.join(ELECTROCHEM_UPLOAD_DIR, storedName);

    if (!entry.file_content_base64) {
      throw new Error('Не передано содержимое файла');
    }

    const buffer = Buffer.from(entry.file_content_base64, 'base64');
    await fs.writeFile(absolutePath, buffer);

    await pool.query(
      `
      INSERT INTO battery_electrochem (
        battery_id,
        file_name,
        file_link,
        electrochem_notes
      )
      VALUES ($1,$2,$3,$4)
      `,
      [
        batteryId,
        originalName,
        relativePath,
        entry.electrochem_notes || null
      ]
    );
  }

  return (await fetchBatteryElectrochem(pool, batteryId)) || [];
}

module.exports = {
  fetchBatteryElectrochem,
  saveBatteryElectrochem
};
