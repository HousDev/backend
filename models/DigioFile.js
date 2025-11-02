// models/DigioFile.js
const pool = require("../config/database");

const DigioFile = {
  async upsertDbCopy({ digio_id, local_document_id = null, file_name = null, mime_type = "application/pdf", buffer }) {
    if (!digio_id) throw new Error("digio_id required");
    if (!buffer) throw new Error("buffer required");

    const sql = `
      INSERT INTO digio_files
        (digio_id, local_document_id, file_name, mime_type, byte_size, storage, pdf_blob)
      VALUES
        (?, ?, ?, ?, ?, 'db', ?)
      ON DUPLICATE KEY UPDATE
        local_document_id = VALUES(local_document_id),
        file_name         = VALUES(file_name),
        mime_type         = VALUES(mime_type),
        byte_size         = VALUES(byte_size),
        storage           = 'db',
        pdf_blob          = VALUES(pdf_blob),
        disk_path         = NULL,
        updated_at        = CURRENT_TIMESTAMP
    `;
    const params = [
      digio_id,
      local_document_id,
      file_name,
      mime_type,
      Buffer.byteLength(buffer),
      buffer,
    ];
    await pool.execute(sql, params);
    return { digio_id, stored: "db", bytes: Buffer.byteLength(buffer) };
  },

  async upsertDiskCopy({ digio_id, local_document_id = null, file_name = null, mime_type = "application/pdf", bytes, disk_path }) {
    if (!digio_id) throw new Error("digio_id required");
    if (!disk_path) throw new Error("disk_path required");

    const sql = `
      INSERT INTO digio_files
        (digio_id, local_document_id, file_name, mime_type, byte_size, storage, disk_path)
      VALUES
        (?, ?, ?, ?, ?, 'disk', ?)
      ON DUPLICATE KEY UPDATE
        local_document_id = VALUES(local_document_id),
        file_name         = VALUES(file_name),
        mime_type         = VALUES(mime_type),
        byte_size         = VALUES(byte_size),
        storage           = 'disk',
        disk_path         = VALUES(disk_path),
        pdf_blob          = NULL,
        updated_at        = CURRENT_TIMESTAMP
    `;
    const params = [
      digio_id,
      local_document_id,
      file_name,
      mime_type,
      bytes ?? null,
      disk_path,
    ];
    await pool.execute(sql, params);
    return { digio_id, stored: "disk", bytes: bytes ?? null, disk_path };
  },

  async getByDigioId(digio_id) {
    const [rows] = await pool.execute(`SELECT * FROM digio_files WHERE digio_id = ? LIMIT 1`, [digio_id]);
    return rows?.[0] || null;
  },

  async getByLocalId(local_document_id) {
    const [rows] = await pool.execute(
      `SELECT * FROM digio_files WHERE local_document_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [local_document_id]
    );
    return rows?.[0] || null;
  },
};

module.exports = DigioFile;
