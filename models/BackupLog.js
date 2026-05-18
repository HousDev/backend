

// models/BackupLog.js
"use strict";

const db = require("../config/database");

class BackupLog {
  /* ---------- Create ---------- */
  static async create({
    operation,
    entity,
    filename      = null,
    file_format   = "csv",
    file_size     = null,
    total_records = 0,
    success_records = 0,
    failed_records  = 0,
    status        = "processing",
    error_log     = null,
    performed_by  = null,
  }) {
    const [result] = await db.execute(
      `INSERT INTO backup_logs
         (operation, entity, filename, file_format, file_size,
          total_records, success_records, failed_records,
          status, error_log, performed_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        operation, entity, filename, file_format, file_size,
        total_records, success_records, failed_records,
        status,
        error_log ? JSON.stringify(error_log) : null,
        performed_by,
      ]
    );
    return BackupLog.findById(result.insertId);
  }

  /* ---------- Update ---------- */
  static async update(id, fields = {}) {
    const allowed = ["status","total_records","success_records",
                     "failed_records","error_log","file_size","filename"];
    const keys    = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!keys.length) return BackupLog.findById(id);

    const set    = keys.map((k) => `\`${k}\` = ?`).join(", ");
    const values = keys.map((k) =>
      k === "error_log" && fields[k] ? JSON.stringify(fields[k]) : (fields[k] ?? null)
    );
    values.push(id);
    await db.execute(`UPDATE backup_logs SET ${set}, updated_at=NOW() WHERE id=?`, values);
    return BackupLog.findById(id);
  }

  /* ---------- Find one ---------- */
  static async findById(id) {
    const [rows] = await db.execute("SELECT * FROM backup_logs WHERE id=?", [id]);
    return rows[0] ? BackupLog._parse(rows[0]) : null;
  }

  /* ---------- List (paginated + filtered) ---------- */
  static async list({ operation=null, entity=null, status=null, page=1, limit=10 } = {}) {
    const where  = [];
    const params = [];
    
    if (operation) { where.push("operation=?"); params.push(operation); }
    if (entity)    { where.push("entity=?");    params.push(entity);    }
    if (status)    { where.push("status=?");    params.push(status);    }

    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
    
    // Ensure page and limit are numbers
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const offset = (Math.max(1, pageNum) - 1) * limitNum;

    // Get total count
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM backup_logs ${whereSQL}`, params
    );
    
    // Get paginated results - cast limit and offset to numbers explicitly
    const [rows] = await db.query(
      `SELECT * FROM backup_logs ${whereSQL} ORDER BY created_at DESC LIMIT ${Number(limitNum)} OFFSET ${Number(offset)}`,
      params
    );
    
    return {
      records:     rows.map(BackupLog._parse),
      total:       Number(total),
      total_pages: Math.ceil(Number(total) / limitNum),
      page:        pageNum,
      limit:       limitNum,
    };
  }

  /* ---------- Stats ---------- */
  static async stats() {
    const [[row]] = await db.execute(`
      SELECT
        SUM(operation='import')  AS totalImports,
        SUM(operation='export')  AS totalExports,
        SUM(status='failed')     AS recentFailed,
        SUM(success_records)     AS totalRecordsProcessed
      FROM backup_logs
    `);
    return {
      totalImports:          Number(row.totalImports          || 0),
      totalExports:          Number(row.totalExports          || 0),
      recentFailed:          Number(row.recentFailed          || 0),
      totalRecordsProcessed: Number(row.totalRecordsProcessed || 0),
    };
  }

  /* ---------- Delete ---------- */
  static async delete(id) {
    const [result] = await db.execute("DELETE FROM backup_logs WHERE id=?", [id]);
    return { deleted: result.affectedRows > 0, id };
  }

  /* ---------- Internal ---------- */
  static _parse(row) {
    let error_log = null;
    if (row.error_log) {
      try { error_log = typeof row.error_log === "string" ? JSON.parse(row.error_log) : row.error_log; }
      catch { error_log = null; }
    }
    return {
      ...row,
      total_records:   Number(row.total_records   || 0),
      success_records: Number(row.success_records || 0),
      failed_records:  Number(row.failed_records  || 0),
      file_size:       row.file_size ? Number(row.file_size) : null,
      error_log,
    };
  }
}

module.exports = BackupLog;