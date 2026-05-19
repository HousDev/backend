
// models/templateModel.js
// Use ONE of the following requires:
// const pool = require("../db");                 // if your pool is at projectRoot/db.js
const pool = require("../config/database");       // if your pool is at projectRoot/config/database.js

const SELECT = `
  id, name, category, content, priority, autoApprove, status, is_active, channel, createdAt, updatedAt
`;

function toInt(v, def = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

async function createTemplate(data) {
  const sql = `
    INSERT INTO templates
      (name, category, content, priority, autoApprove, status, is_active, rejection_reason, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    data.name,
    data.category,
    data.content,
    data.priority,
    data.autoApprove ? 1 : 0,
    data.status,
data.is_active !== undefined ? data.is_active : 1, 
    data.rejection_reason || null,                  
       data.channel,
  ];
  const [res] = await pool.execute(sql, params);
  return getById(res.insertId);
}


async function getById(id) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT} FROM templates WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function list({ q, channel, status, category, limit = 20, offset = 0 }) {
  // sanitize ints BEFORE interpolation
  let lim = toInt(limit, 20);
  let off = toInt(offset, 0);
  if (lim < 1) lim = 1;
  if (lim > 100) lim = 100;

  const where = [];
  const args = [];

  if (q) {
    where.push(`(name LIKE ? OR content LIKE ?)`);
    args.push(`%${q}%`, `%${q}%`);
  }
  if (channel) {
    where.push(`channel = ?`);
    args.push(channel);
  }
  if (status) {
    where.push(`status = ?`);
    args.push(status);
  }
  if (category) {
    where.push(`category = ?`);
    args.push(category);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Inline LIMIT/OFFSET (prepared placeholders can error on some MySQL builds)
  const sqlList = `
    SELECT ${SELECT}
    FROM templates
    ${whereSql}
    ORDER BY updatedAt DESC
    LIMIT ${lim} OFFSET ${off}
  `;
  const [rows] = await pool.execute(sqlList, args);

  const sqlCount = `
    SELECT COUNT(*) AS total
    FROM templates
    ${whereSql}
  `;
  const [[{ total } = { total: 0 }]] = await pool.execute(sqlCount, args);

  return { data: rows, total };
}

async function updateTemplate(id, data) {
  const sql = `
    UPDATE templates
       SET name = ?,
           category = ?,
           content = ?,
           priority = ?,
           autoApprove = ?,
           status = ?,
           is_active = ?,
           rejection_reason = ?,
           channel = ?
     WHERE id = ?
  `;
  const params = [
    data.name,
    data.category,
    data.content,
    data.priority,
    data.autoApprove ? 1 : 0,
    data.autoApprove ? "approved" : data.status,
    data.is_active !== undefined ? data.is_active : 1,  // ✅ ADD THIS
    data.rejection_reason || null,                      // ✅ ADD THIS
    data.channel,
    id,
  ];
  await pool.execute(sql, params);
  return getById(id);
}

async function deleteTemplate(id) {
  const [res] = await pool.execute(`DELETE FROM templates WHERE id = ?`, [id]);
  return res.affectedRows > 0;
}

module.exports = {
  createTemplate,
  getById,
  list,
  updateTemplate,
  deleteTemplate,
};
