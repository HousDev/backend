const db = require('../config/database');

const Variable = {
    findAllByTab: async (tabId) => {
        const [rows] = await db.query(
            'SELECT * FROM variables WHERE variable_tab_id = ? ORDER BY id DESC',
            [tabId]
        );
        return rows;
    },

    findById: async (id) => {
        const [rows] = await db.query('SELECT * FROM variables WHERE id = ?', [id]);
        return rows[0];
    },

    create: async ({ name, variableName, variableTabId, status }) => {
        const [result] = await db.query(
            'INSERT INTO variables (name, variable_name, variable_tab_id, status) VALUES (?, ?, ?, ?)',
            [name, variableName, variableTabId, status]
        );
        return result.insertId;
    },

    update: async (id, { name, variableName, status }) => {
        await db.query(
            'UPDATE variables SET name = ?, variable_name = ?, status = ? WHERE id = ?',
            [name, variableName, status, id]
        );
    },

    delete: async (id) => {
        await db.query('DELETE FROM variables WHERE id = ?', [id]);
    },

    bulkDelete: async (ids) => {
        if (!ids.length) return;
        const placeholders = ids.map(() => '?').join(',');
        await db.query(`DELETE FROM variables WHERE id IN (${placeholders})`, ids);
    },

    bulkUpdateStatus: async (ids, status) => {
        if (!ids.length) return;
        const placeholders = ids.map(() => '?').join(',');
        await db.query(`UPDATE variables SET status = ? WHERE id IN (${placeholders})`, [status, ...ids]);
    }
    ,
 bulkUpsertByTab: async (tabId, rows) => {
    if (!rows?.length) return { affectedRows: 0 };

    // Build VALUES (...),(...),(...)
    const placeholders = rows.map(() => '(?, ?, ?, ?)').join(',');
    const values = [];
    for (const r of rows) {
      values.push(
        r.name,
        r.variable_name,      // already {{snake}} format
        tabId,                // force tab here
        r.status || 'active'
      );
    }

    const sql = `
      INSERT INTO variables (name, variable_name, variable_tab_id, status)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        status = VALUES(status)
    `;
    const [result] = await db.query(sql, values);
    return result; // note: updates count as 2 in affectedRows (MySQL behavior)
  },


};

module.exports = Variable;
