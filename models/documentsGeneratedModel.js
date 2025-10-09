const pool = require('../config/database');

const toJsonOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return (Array.isArray(parsed) || (parsed && typeof parsed === 'object'))
        ? JSON.stringify(parsed)
        : null;
    } catch { return null; }
  }
  if (Array.isArray(v) || (v && typeof v === 'object')) return JSON.stringify(v);
  return null;
};

const DocumentsGeneratedModel = {
  async create(payload) {
    const {
      template_id = null,
      name,
      description = null,
      category = null,
      content,
      variables = null,
      status = 'draft',
      created_by = null,
      updated_by = null,
    } = payload;

    const sql = `
      INSERT INTO documents_generated
        (template_id, name, description, category, content, variables, status, created_by, updated_by)
      VALUES
        (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)
    `;
    const params = [
      template_id,
      name,
      description,
      category,
      content,
      toJsonOrNull(variables),
      status,
      created_by,
      updated_by,
    ];
    const [res] = await pool.execute(sql, params);
    return { id: res.insertId };
  },

  async getAll(opts = {}) {
    const { includeDeleted = false, created_by = null } = opts;
    const where = [];
    const params = [];

    if (!includeDeleted) where.push('dg.is_deleted = 0');
    if (created_by != null) { where.push('dg.created_by = ?'); params.push(created_by); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.execute(
      `
      SELECT
        dg.id,
        dg.template_id,
        dg.name,
        dg.description,
        dg.category,
        dg.content,
        dg.variables,
        dg.status,
        dg.created_by,
        dg.updated_by,
        dg.created_at,
        dg.updated_at,
        dg.last_used_at,
        dg.is_deleted,
        /* joined names */
        TRIM(CONCAT_WS(' ', u1.salutation, u1.first_name, u1.last_name)) AS created_by_name,
        TRIM(CONCAT_WS(' ', u2.salutation, u2.first_name, u2.last_name)) AS updated_by_name
      FROM documents_generated dg
      LEFT JOIN users u1 ON u1.id = dg.created_by
      LEFT JOIN users u2 ON u2.id = dg.updated_by
      ${whereSql}
      ORDER BY dg.created_at DESC
      `,
      params
    );
    return rows;
  },

  async getById(id) {
    const [rows] = await pool.execute(
      `
      SELECT
        dg.*,
        TRIM(CONCAT_WS(' ', u1.salutation, u1.first_name, u1.last_name)) AS created_by_name,
        TRIM(CONCAT_WS(' ', u2.salutation, u2.first_name, u2.last_name)) AS updated_by_name
      FROM documents_generated dg
      LEFT JOIN users u1 ON u1.id = dg.created_by
      LEFT JOIN users u2 ON u2.id = dg.updated_by
      WHERE dg.id = ?
      `,
      [id]
    );
    return rows[0] || null;
  },

  async update(id, patch = {}) {
    const sets = [];
    const params = [];
    const push = (field, value, isJson = false) => {
      sets.push(`${field} = ${isJson ? 'CAST(? AS JSON)' : '?'}`);
      params.push(value);
    };

    if (patch.name !== undefined) push('name', patch.name);
    if (patch.description !== undefined) push('description', patch.description);
    if (patch.category !== undefined) push('category', patch.category);
    if (patch.content !== undefined) push('content', patch.content);
    if (patch.variables !== undefined) push('variables', toJsonOrNull(patch.variables), true);
    if (patch.status !== undefined) push('status', patch.status);
    if (patch.updated_by !== undefined) push('updated_by', patch.updated_by);
    if (patch.last_used_at !== undefined) push('last_used_at', patch.last_used_at);

    if (!sets.length) return { affectedRows: 0 };

    const sql = `UPDATE documents_generated SET ${sets.join(', ')} WHERE id = ?`;
    const [res] = await pool.execute(sql, [...params, id]);
    return { affectedRows: res.affectedRows };
  },

  async softDelete(id, userId = null) {
    const [res] = await pool.execute(
      `UPDATE documents_generated
         SET is_deleted = 1,
             deleted_at = CURRENT_TIMESTAMP,
             updated_by = COALESCE(?, updated_by)
       WHERE id = ?`,
      [userId, id]
    );
    return { affectedRows: res.affectedRows };
  },

  async restore(id, userId = null) {
    const [res] = await pool.execute(
      `UPDATE documents_generated
         SET is_deleted = 0,
             deleted_at = NULL,
             updated_by = COALESCE(?, updated_by)
       WHERE id = ?`,
      [userId, id]
    );
    return { affectedRows: res.affectedRows };
  },

  async hardDelete(id) {
    const [res] = await pool.execute(`DELETE FROM documents_generated WHERE id = ?`, [id]);
    return { affectedRows: res.affectedRows };
  },
};

module.exports = DocumentsGeneratedModel;
