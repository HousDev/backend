// models/buyerFollowupModel.js
const db = require("../config/database");

function formatDateTime(d) {
  if (!d) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    buyerId: row.buyer_id,
    leadId: row.lead_id,
    followupId: row.followup_id,
    followupType: row.followup_type,
    buyerLeadStage: row.buyer_lead_stage,
    buyerLeadStatus: row.buyer_lead_status,
    remark: row.remark,
    customRemark: row.custom_remark,
    nextAction: row.next_action,
    completedDate: row.completed_date,
    scheduleDate: row.schedule_date,
    scheduleTime: row.schedule_time,
    priority: row.priority,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class BuyerFollowup {
  static async create(payload) {
    const now = formatDateTime(new Date());
    const sql = `
      INSERT INTO buyer_followups
      (buyer_id, lead_id, followup_id, followup_type, buyer_lead_stage, buyer_lead_status,
       remark, custom_remark, next_action, completed_date, schedule_date, schedule_time,
       priority, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await db.execute(sql, [
      payload.buyerId ?? null,
      payload.leadId ?? null,
      payload.followupId ?? null,
      payload.followupType ?? null,
      payload.buyerLeadStage ?? null,
      payload.buyerLeadStatus ?? null,
      payload.remark ?? null,
      payload.customRemark ?? null,
      payload.nextAction ?? null,
      payload.completedDate ?? null,
      payload.scheduleDate ?? null,
      payload.scheduleTime ?? null,
      payload.priority ?? "Medium",
      payload.createdBy ?? null,
      payload.updatedBy ?? null,
      now,
      now,
    ]);
    return result.insertId;
  }

  /**
   * findAll - fetch followups with optional buyerId, pagination via page+limit
   * @param {Object} opts - { buyerId, page, limit }
   */
static async findAll({ buyerId, page = 1, limit = 20 } = {}) {
  // sanitize / coerce inputs
  const pageInt = Number.isFinite(Number(page)) ? Math.max(1, parseInt(page, 10)) : 1;
  const limitInt = Number.isFinite(Number(limit)) ? Math.max(1, parseInt(limit, 10)) : 20;
  const offset = Math.max(0, (pageInt - 1) * limitInt);

  const hasBuyerId = buyerId !== undefined && buyerId !== null && String(buyerId).trim() !== "";

  // Build SQL with LIMIT/OFFSET inlined (only numeric values inserted)
  let sql = "SELECT * FROM buyer_followups";
  const vals = [];
  if (hasBuyerId) {
    sql += " WHERE buyer_id = ?";
    vals.push(buyerId);
  }

  // Inline validated integers for LIMIT/OFFSET to avoid driver issues binding them
  sql += ` ORDER BY schedule_date DESC, schedule_time DESC LIMIT ${limitInt} OFFSET ${offset}`;

  // DEBUG: log SQL + vals (only in non-prod or while debugging)
  if (process.env.NODE_ENV !== "production") {
    console.debug("[BuyerFollowup.findAll] SQL:", sql);
    console.debug("[BuyerFollowup.findAll] vals:", vals.map(v => ({ value: v, type: typeof v })));
  }

  try {
    const [rows] = await db.execute(sql, vals);
    return Array.isArray(rows) ? rows.map(mapRow) : [];
  } catch (err) {
    // additional debug log before rethrowing
    console.error("[BuyerFollowup.findAll] execute error:", err);
    console.error("[BuyerFollowup.findAll] final SQL:", sql);
    console.error("[BuyerFollowup.findAll] bound vals:", vals);
    throw err;
  }
}


  static async findById(id) {
    const [rows] = await db.execute("SELECT * FROM buyer_followups WHERE id = ?", [id]);
    if (!rows || !rows[0]) return null;
    return mapRow(rows[0]);
  }

  static async update(id, payload) {
    const existing = await this.findById(id);
    if (!existing) return 0;

    const sql = `
      UPDATE buyer_followups SET
        followup_type = ?, buyer_lead_stage = ?, buyer_lead_status = ?, remark = ?,
        custom_remark = ?, next_action = ?, completed_date = ?,
        schedule_date = ?, schedule_time = ?, priority = ?, updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const [res] = await db.execute(sql, [
      payload.followupType ?? existing.followupType,
      payload.buyerLeadStage ?? existing.buyerLeadStage,
      payload.buyerLeadStatus ?? existing.buyerLeadStatus,
      payload.remark ?? existing.remark,
      payload.customRemark ?? existing.customRemark,
      payload.nextAction ?? existing.nextAction,
      payload.completedDate ?? existing.completedDate,
      payload.scheduleDate ?? existing.scheduleDate,
      payload.scheduleTime ?? existing.scheduleTime,
      payload.priority ?? existing.priority,
      payload.updatedBy ?? existing.updatedBy,
      id,
    ]);

    return res.affectedRows;
  }

  static async delete(id) {
    const [res] = await db.execute("DELETE FROM buyer_followups WHERE id = ?", [id]);
    return res.affectedRows;
  }
}

module.exports = BuyerFollowup;
