// models/templateModel.js
const pool = require("../config/database");

const SELECT = `
  id, name, category, subCategory, content, subject, priority, autoApprove, status, is_active, rejection_reason, channel, createdAt, updatedAt
`;

function toInt(v, def = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

function normalizeRow(row) {
  if (!row) return row;
  return {
    ...row,
    subCategory: row.subCategory || row.sub_category || "None",
    sub_category: row.subCategory || row.sub_category || "None",
  };
}

async function createTemplate(data) {
  const sql = `
    INSERT INTO templates
    (name, category, subCategory, content, subject, priority, autoApprove, status, is_active, rejection_reason, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    data.name,
    data.category,
    data.subCategory || data.sub_category || "None",
    data.content,
    data.subject || null,
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
  return rows[0] ? normalizeRow(rows[0]) : null;
}

async function list({ q, channel, status, category, limit = 20, offset = 0 }) {
  let lim = toInt(limit, 20);
  let off = toInt(offset, 0);
  if (lim < 1) lim = 1;
  if (lim > 100) lim = 100;

  const where = [];
  const args = [];

  if (q) {
    where.push(`(name LIKE ? OR content LIKE ? OR subCategory LIKE ?)`);
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
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

  return { data: (rows || []).map(normalizeRow), total };
}

async function updateTemplate(id, data) {
  const sql = `
    UPDATE templates
       SET name = ?,
           category = ?,
           subCategory = ?,
           content = ?,
           subject = ?,
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
    data.subCategory || data.sub_category || "None",
    data.content,
    data.subject || null,
    data.priority,
    data.autoApprove ? 1 : 0,
    data.autoApprove ? "approved" : data.status,
    data.is_active !== undefined ? data.is_active : 1,
    data.rejection_reason || null,
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
