const {
  ensureMaterialPropertiesRow,
  ensureMaterialSourceForPureInstance
} = require('./materialInstanceService');

function addSourceDownloadUrl(row) {
  return {
    ...row,
    download_url: `/api/materials/source-files/${row.material_source_file_id}/download`
  };
}

function addPropertyDownloadUrl(row) {
  return {
    ...row,
    download_url: `/api/materials/property-files/${row.material_property_file_id}/download`
  };
}

async function fetchMaterialSourceFiles(client, sourceId) {
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
    [sourceId]
  );

  return result.rows.map(addSourceDownloadUrl);
}

async function fetchMaterialPropertyFiles(client, materialPropertyId) {
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
    [materialPropertyId]
  );

  return result.rows.map(addPropertyDownloadUrl);
}

async function listMaterialSourceFiles(pool, materialInstanceId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const context = await ensureMaterialSourceForPureInstance(client, materialInstanceId);
    const rows = await fetchMaterialSourceFiles(client, context.source_id);
    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function addMaterialSourceFiles(pool, materialInstanceId, entries, userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const context = await ensureMaterialSourceForPureInstance(client, materialInstanceId, userId);

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

    const rows = await fetchMaterialSourceFiles(client, context.source_id);
    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getMaterialSourceFile(pool, fileId) {
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

  return result.rows[0] || null;
}

async function deleteMaterialSourceFile(pool, fileId) {
  const result = await pool.query(
    `
    DELETE FROM material_source_files
    WHERE material_source_file_id = $1
    RETURNING material_source_file_id
    `,
    [fileId]
  );

  return result.rows.length > 0;
}

async function listMaterialPropertyFiles(pool, materialInstanceId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const ensured = await ensureMaterialPropertiesRow(client, materialInstanceId);
    const rows = await fetchMaterialPropertyFiles(client, ensured.material_property_id);
    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function addMaterialPropertyFiles(pool, materialInstanceId, entries, userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const ensured = await ensureMaterialPropertiesRow(client, materialInstanceId, userId);

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

    const rows = await fetchMaterialPropertyFiles(client, ensured.material_property_id);
    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getMaterialPropertyFile(pool, fileId) {
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

  return result.rows[0] || null;
}

async function deleteMaterialPropertyFile(pool, fileId) {
  const result = await pool.query(
    `
    DELETE FROM material_property_files
    WHERE material_property_file_id = $1
    RETURNING material_property_file_id
    `,
    [fileId]
  );

  return result.rows.length > 0;
}

module.exports = {
  addMaterialPropertyFiles,
  addMaterialSourceFiles,
  deleteMaterialPropertyFile,
  deleteMaterialSourceFile,
  getMaterialPropertyFile,
  getMaterialSourceFile,
  listMaterialPropertyFiles,
  listMaterialSourceFiles
};
