// models/VariableModel.js
const db = require('../config/database');

// NOTE: Ensure you have a composite unique index:
// ALTER TABLE variables ADD UNIQUE KEY uniq_tab_key (variable_tab_id, variable_key);

module.exports = {
 async findAll() {
    const sql = `
      SELECT id, name, variable_key, placeholder, variable_tab_id, category, status, created_at, updated_at
      FROM variables
      ORDER BY id DESC
    `;
    const [rows] = await db.query(sql);
    return rows;
  }

  ,
  async findAllByTab(tabId, { q, status, limit = 100, offset = 0 } = {}) {
    const params = [tabId];
    let where = 'WHERE variable_tab_id = ?';
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }
    if (q) {
      where += ' AND (LOWER(name) LIKE ? OR LOWER(variable_key) LIKE ? OR LOWER(placeholder) LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const sql = `
      SELECT id, name, variable_key, placeholder, variable_tab_id, category, status, created_at, updated_at
      FROM variables
      ${where}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;
    params.push(Number(limit), Number(offset));
    const [rows] = await db.query(sql, params);
    return rows;
  },

  async findByTabAndKey(tabId, variable_key) {
    const [rows] = await db.query(
      `SELECT id, name, variable_key, placeholder, variable_tab_id, category, status
       FROM variables
       WHERE variable_tab_id = ? AND variable_key = ?
       LIMIT 1`,
      [tabId, variable_key]
    );
    return rows[0];
  },

  async findById(id) {
    const [rows] = await db.query(
      `SELECT id, name, variable_key, placeholder, variable_tab_id, category, status
       FROM variables WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0];
  },

  async create({ name, variable_key, placeholder, variable_tab_id, category, status }) {
    const [res] = await db.query(
      `INSERT INTO variables
       (name, variable_key, placeholder, variable_tab_id, category, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, variable_key, placeholder, variable_tab_id, category, status]
    );
    return res.insertId;
  },

  async update(id, { name, variable_key, placeholder, status }) {
    await db.query(
      `UPDATE variables
       SET name = ?, variable_key = ?, placeholder = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, variable_key, placeholder, status, id]
    );
  },

  async delete(id) {
    await db.query(`DELETE FROM variables WHERE id = ?`, [id]);
  },

  async bulkDelete(ids) {
    await db.query(`DELETE FROM variables WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  },

  async bulkUpdateStatus(ids, status) {
    await db.query(
      `UPDATE variables
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      [status, ...ids]
    );
  },
};
