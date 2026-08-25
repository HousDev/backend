const db = require("../config/database");

const tenantActivityModel = {
  async create(data) {
    try {
      const sql = `
        INSERT INTO tenant_activities (
          tenant_id, activity_type, notes, created_at
        ) VALUES (?, ?, ?, NOW())
      `;
      const params = [
        data.tenant_id || data.tenantId,
        data.activity_type || data.activityType || 'Note',
        data.notes || data.remark || '',
      ];
      const [res] = await db.query(sql, params);
      return res ? res.insertId : null;
    } catch (err) {
      console.error("Error creating tenant activity:", err);
      throw err;
    }
  },

  async getByTenantId(tenantId) {
    try {
      const sql = `SELECT * FROM tenant_activities WHERE tenant_id = ? ORDER BY id DESC`;
      const [rows] = await db.query(sql, [tenantId]);
      return rows || [];
    } catch (err) {
      console.error("Error fetching tenant activities by tenantId:", err);
      return [];
    }
  },

  async getAll() {
    try {
      const sql = `SELECT * FROM tenant_activities ORDER BY id DESC LIMIT 100`;
      const [rows] = await db.query(sql);
      return rows || [];
    } catch (err) {
      console.error("Error fetching all tenant activities:", err);
      return [];
    }
  }
};

module.exports = tenantActivityModel;
