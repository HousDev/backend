const db = require("../config/database");

const pad = (n) => String(n).padStart(2, "0");
const formatDateTime = (d) => {
  if (!d) return null;
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return null;
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;
};

const tenantFollowupModel = {
  async create(data) {
    try {
      const sql = `
        INSERT INTO tenant_followups (
          tenant_id, followup_type, schedule_date, schedule_time, status, remark,
          priority, custom_remark, next_action, completed_date, assigned_executive,
          created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;
      const params = [
        data.tenant_id || data.tenantId,
        data.followup_type || data.followupType || 'call',
        data.schedule_date || data.scheduledDate || null,
        data.schedule_time || data.scheduledTime || null,
        data.status || 'Active Search',
        data.remark || data.remarks || '',
        data.priority || 'Medium',
        data.custom_remark || data.customRemark || null,
        data.next_action || data.nextAction || null,
        formatDateTime(data.completed_date || data.completedDate),
        data.assigned_executive || data.assignedExecutive || null,
        data.created_by || data.createdBy || null,
        data.updated_by || data.updatedBy || null,
      ];
      const [res] = await db.query(sql, params);
      return res ? res.insertId : null;
    } catch (err) {
      console.error("Error creating tenant followup:", err);
      throw err;
    }
  },

  async getByTenantId(tenantId) {
    try {
      const sql = `SELECT * FROM tenant_followups WHERE tenant_id = ? ORDER BY id DESC`;
      const [rows] = await db.query(sql, [tenantId]);
      return rows || [];
    } catch (err) {
      console.error("Error fetching tenant followups by tenantId:", err);
      return [];
    }
  },

  async getAll() {
    try {
      const sql = `SELECT * FROM tenant_followups ORDER BY id DESC LIMIT 100`;
      const [rows] = await db.query(sql);
      return rows || [];
    } catch (err) {
      console.error("Error fetching all tenant followups:", err);
      return [];
    }
  }
};

module.exports = tenantFollowupModel;
