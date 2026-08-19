const db = require("../config/database");

function pad(n) { return String(n).padStart(2, "0"); }
function formatDateTime(d) {
  if (!d) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function normalizeToMysqlDatetime(val) {
  if (!val && val !== 0) return null;
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val)) return val;
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return null;
  return formatDateTime(d);
}
function normalizeToMysqlDate(val) {
  if (!val) return null;
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

class OwnerFollowup {
  static async create(payload) {
    const now = new Date();
    const nowFormatted = formatDateTime(now);

    const ownerId = payload.owner_id ?? payload.ownerId ?? null;
    const followupDate = normalizeToMysqlDatetime(payload.followup_date ?? payload.followupDate ?? null);
    const followupType = payload.followup_type ?? payload.followupType ?? null;
    const notes = payload.notes ?? null;
    const status = payload.status ?? "pending";
    const createdBy = payload.created_by ?? payload.createdBy ?? null;
    const createdAt = nowFormatted;
    const updatedAt = nowFormatted;

    const sql = `
      INSERT INTO owner_followups
      (owner_id, followup_date, followup_type, notes, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [res] = await db.execute(sql, [
      ownerId, followupDate, followupType, notes, status, createdBy, createdAt, updatedAt
    ]);

    return res.insertId;
  }

  static async findAll({ ownerId, page = 1, limit = 20 } = {}) {
    const pageInt = Math.max(1, parseInt(page, 10));
    const limitInt = Math.max(1, parseInt(limit, 10));
    const offset = (pageInt - 1) * limitInt;

    const hasOwnerId = ownerId !== undefined && ownerId !== null && String(ownerId).trim() !== "";
    
    let sql = `
      SELECT of.*,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', cu.salutation, cu.first_name, cu.last_name)), ''), cu.username, cu.email) AS created_by_name
      FROM owner_followups of
      LEFT JOIN users cu ON cu.id = of.created_by
    `;

    const vals = [];
    if (hasOwnerId) {
      sql += " WHERE of.owner_id = ? ";
      vals.push(ownerId);
    }

    sql += ` ORDER BY of.followup_date DESC LIMIT ${limitInt} OFFSET ${offset} `;

    const [rows] = await db.execute(sql, vals);
    return rows;
  }

  static async findById(id) {
    const sql = `
      SELECT of.*,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', cu.salutation, cu.first_name, cu.last_name)), ''), cu.username, cu.email) AS created_by_name
      FROM owner_followups of
      LEFT JOIN users cu ON cu.id = of.created_by
      WHERE of.id = ?
      LIMIT 1
    `;
    const [rows] = await db.execute(sql, [id]);
    return rows && rows[0] ? rows[0] : null;
  }

  static async update(id, payload) {
    const followupDate = normalizeToMysqlDatetime(payload.followup_date ?? payload.followupDate ?? null);
    const followupType = payload.followup_type ?? payload.followupType ?? null;
    const notes = payload.notes ?? null;
    const status = payload.status ?? "pending";

    const sql = `
      UPDATE owner_followups
      SET followup_date = ?,
          followup_type = ?,
          notes = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const [res] = await db.execute(sql, [followupDate, followupType, notes, status, id]);
    return res.affectedRows;
  }

  static async delete(id) {
    const [res] = await db.execute("DELETE FROM owner_followups WHERE id = ?", [id]);
    return res.affectedRows;
  }
}

module.exports = OwnerFollowup;
