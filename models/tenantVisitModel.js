const db = require("../config/database");

const tenantVisitModel = {
  async create(data) {
    try {
      const sql = `
        INSERT INTO tenant_visits (
          tenant_id, property_title, visit_date, visit_time, meeting_point, status, remarks,
          rental_property_id, owner_id, executive_id, visit_type, duration_minutes,
          feedback, rating, accompanied_by, outcome, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;
      const params = [
        data.tenant_id || data.tenantId,
        data.property_title || data.propertyTitle || 'Property Site Visit',
        data.visit_date || data.visitDate || null,
        data.visit_time || data.visitTime || null,
        data.meeting_point || data.meetPoint || '',
        data.status || 'Scheduled',
        data.remarks || data.remark || '',
        data.rental_property_id || data.rentalPropertyId || null,
        data.owner_id || data.ownerId || null,
        data.executive_id || data.executiveId || null,
        data.visit_type || data.visitType || 'site_visit',
        data.duration_minutes || data.durationMinutes || 60,
        data.feedback || null,
        data.rating || null,
        data.accompanied_by || data.accompaniedBy || null,
        data.outcome || null,
      ];
      const [res] = await db.query(sql, params);
      return res ? res.insertId : null;
    } catch (err) {
      console.error("Error creating tenant visit:", err);
      throw err;
    }
  },

  async getByTenantId(tenantId) {
    try {
      const sql = `SELECT * FROM tenant_visits WHERE tenant_id = ? ORDER BY id DESC`;
      const [rows] = await db.query(sql, [tenantId]);
      return rows || [];
    } catch (err) {
      console.error("Error fetching tenant visits by tenantId:", err);
      return [];
    }
  },

  async getAll() {
    try {
      const sql = `SELECT * FROM tenant_visits ORDER BY id DESC LIMIT 100`;
      const [rows] = await db.query(sql);
      return rows || [];
    } catch (err) {
      console.error("Error fetching all tenant visits:", err);
      return [];
    }
  }
};

module.exports = tenantVisitModel;
