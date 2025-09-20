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

     assignedExecutive: row.assigned_executive ?? null,
    assignedExecutiveName: row.assigned_executive_name ?? null,
    // transfer-related columns
    transferredFromLead: Boolean(row.transferred_from_lead === 1 || row.transferred_from_lead === '1'),
    transferredAt: row.transferred_at,
    transferredBy: row.transferred_by,
    transferType: row.transfer_type,
    transferredByName: row.transferred_by_name ?? null,

    // audit
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdByName: row.created_by_name ?? null,
    updatedByName: row.updated_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class BuyerFollowup {
 static async create(payload) {
  // helper: convert value (Date | ISO string | mysql-format string) to mysql DATETIME 'YYYY-MM-DD HH:MM:SS'
  const normalizeToMysqlDatetime = (val) => {
    if (!val && val !== 0) return null;
    // if already looks like mysql DATETIME (YYYY-mm-dd HH:MM:SS)
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val)) return val;
    // if ISO string or other string parseable by Date
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return null;
    return formatDateTime(d);
  };

  const nowFormatted = formatDateTime(new Date());

  // Accept both snake_case and camelCase from payload (robust)
  const buyerId = payload.buyer_id ?? payload.buyerId ?? null;
  const leadId = payload.lead_id ?? payload.leadId ?? null;
  const followupId = payload.followup_id ?? payload.followupId ?? null;
  const followupType = payload.followup_type ?? payload.followupType ?? null;
  const buyerLeadStage = payload.buyer_lead_stage ?? payload.buyerLeadStage ?? null;
  const buyerLeadStatus = payload.buyer_lead_status ?? payload.buyerLeadStatus ?? null;
  const remark = payload.remark ?? null;
  const customRemark = payload.custom_remark ?? payload.customRemark ?? null;
  const nextAction = payload.next_action ?? payload.nextAction ?? null;
  const completedDate = normalizeToMysqlDatetime(payload.completed_date ?? payload.completedDate ?? null);
  const scheduleDate = payload.schedule_date ?? payload.scheduleDate ?? null; // date only (YYYY-MM-DD) is fine
  const scheduleTime = payload.schedule_time ?? payload.scheduleTime ?? null; // HH:MM is fine
  const priority = payload.priority ?? "Medium";
  const createdBy = payload.created_by ?? payload.createdBy ?? null;
  const updatedBy = payload.updated_by ?? payload.updatedBy ?? null;

  // Normalize created_at / updated_at to mysql datetime; fallback to nowFormatted
  const createdAtRaw = payload.created_at ?? payload.createdAt ?? null;
  const updatedAtRaw = payload.updated_at ?? payload.updatedAt ?? null;
  const createdAt = normalizeToMysqlDatetime(createdAtRaw) ?? nowFormatted;
  const updatedAt = normalizeToMysqlDatetime(updatedAtRaw) ?? nowFormatted;

  if (process.env.NODE_ENV !== "production") {
    console.debug("[BuyerFollowup.create] normalized values:", {
      buyerId,
      leadId,
      followupId,
      followupType,
      buyerLeadStage,
      buyerLeadStatus,
      remark,
      customRemark,
      nextAction,
      completedDate,
      scheduleDate,
      scheduleTime,
      priority,
      createdBy,
      updatedBy,
      createdAt,
      updatedAt,
    });
  }

  const sql = `
    INSERT INTO buyer_followups
    (buyer_id, lead_id, followup_id, followup_type, buyer_lead_stage, buyer_lead_status,
     remark, custom_remark, next_action, completed_date, schedule_date, schedule_time,
     priority, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const [result] = await db.execute(sql, [
    buyerId,
    leadId,
    followupId,
    followupType,
    buyerLeadStage,
    buyerLeadStatus,
    remark,
    customRemark,
    nextAction,
    completedDate,
    scheduleDate,
    scheduleTime,
    priority,
    createdBy,
    updatedBy,
    createdAt,
    updatedAt,
  ]);
  return result.insertId;
}


  /**
   * findAll - fetch followups with optional buyerId, pagination via page+limit
   * @param {Object} opts - { buyerId, page, limit }
   */
 static async findAll({ buyerId, page = 1, limit = 20 } = {}) {
  const pageInt = Number.isFinite(Number(page)) ? Math.max(1, parseInt(page, 10)) : 1;
  const limitInt = Number.isFinite(Number(limit)) ? Math.max(1, parseInt(limit, 10)) : 20;
  const offset = Math.max(0, (pageInt - 1) * limitInt);

  const hasBuyerId = buyerId !== undefined && buyerId !== null && String(buyerId).trim() !== "";

  const sql = `
    SELECT bf.*,
      -- creator / updater friendly names (first + last, else username, else email)
      COALESCE(
        NULLIF(CONCAT(TRIM(cu.first_name), ' ', TRIM(cu.last_name)), ' '),
        cu.username,
        cu.email
      ) AS created_by_name,
      COALESCE(
        NULLIF(CONCAT(TRIM(uu.first_name), ' ', TRIM(uu.last_name)), ' '),
        uu.username,
        uu.email
      ) AS updated_by_name,
      -- transferred_by friendly name
      COALESCE(
        NULLIF(CONCAT(TRIM(tb.first_name), ' ', TRIM(tb.last_name)), ' '),
        tb.username,
        tb.email
      ) AS transferred_by_name,
      -- assigned executive friendly name
      COALESCE(
        NULLIF(CONCAT(TRIM(ae.first_name), ' ', TRIM(ae.last_name)), ' '),
        ae.username,
        ae.email
      ) AS assigned_executive_name
    FROM buyer_followups bf
    LEFT JOIN users cu ON cu.id = bf.created_by
    LEFT JOIN users uu ON uu.id = bf.updated_by
    LEFT JOIN users tb ON tb.id = bf.transferred_by
    LEFT JOIN users ae ON ae.id = bf.assigned_executive
    ${hasBuyerId ? "WHERE bf.buyer_id = ?" : ""}
    ORDER BY bf.schedule_date DESC, bf.schedule_time DESC
    LIMIT ${limitInt} OFFSET ${offset}
  `;

  const vals = hasBuyerId ? [buyerId] : [];

  if (process.env.NODE_ENV !== "production") {
    console.debug("[BuyerFollowup.findAll] SQL:", sql);
    console.debug("[BuyerFollowup.findAll] vals:", vals);
  }

  try {
    const [rows] = await db.execute(sql, vals);
    return Array.isArray(rows) ? rows.map(mapRow) : [];
  } catch (err) {
    console.error("[BuyerFollowup.findAll] execute error:", err);
    console.error("[BuyerFollowup.findAll] final SQL:", sql);
    console.error("[BuyerFollowup.findAll] bound vals:", vals);
    throw err;
  }
}

static async findById(id) {
  const sql = `
    SELECT bf.*,
      COALESCE(
        NULLIF(CONCAT(TRIM(cu.first_name), ' ', TRIM(cu.last_name)), ' '),
        cu.username,
        cu.email
      ) AS created_by_name,
      COALESCE(
        NULLIF(CONCAT(TRIM(uu.first_name), ' ', TRIM(uu.last_name)), ' '),
        uu.username,
        uu.email
      ) AS updated_by_name,
      COALESCE(
        NULLIF(CONCAT(TRIM(tb.first_name), ' ', TRIM(tb.last_name)), ' '),
        tb.username,
        tb.email
      ) AS transferred_by_name,
      COALESCE(
        NULLIF(CONCAT(TRIM(ae.first_name), ' ', TRIM(ae.last_name)), ' '),
        ae.username,
        ae.email
      ) AS assigned_executive_name
    FROM buyer_followups bf
    LEFT JOIN users cu ON cu.id = bf.created_by
    LEFT JOIN users uu ON uu.id = bf.updated_by
    LEFT JOIN users tb ON tb.id = bf.transferred_by
    LEFT JOIN users ae ON ae.id = bf.assigned_executive
    WHERE bf.id = ?
    LIMIT 1
  `;

  const [rows] = await db.execute(sql, [id]);
  if (!rows || !rows[0]) return null;
  return mapRow(rows[0]);
}


static async update(id, payload) {
  const existing = await this.findById(id);
  if (!existing) return 0;

  // helper: convert to MySQL date/datetime format
  const normalizeToMysqlDatetime = (val) => {
    if (!val) return null;
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return null;
    return formatDateTime(d); // YYYY-MM-DD HH:MM:SS
  };

  const normalizeToMysqlDate = (val) => {
    if (!val) return null;
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // normalize fields
  const followupType = payload.followup_type ?? payload.followupType ?? existing.followupType;
  const buyerLeadStage = payload.buyer_lead_stage ?? payload.buyerLeadStage ?? existing.buyerLeadStage;
  const buyerLeadStatus = payload.buyer_lead_status ?? payload.buyerLeadStatus ?? existing.buyerLeadStatus;
  const remark = payload.remark ?? existing.remark;
  const customRemark = payload.custom_remark ?? payload.customRemark ?? existing.customRemark;
  const nextAction = payload.next_action ?? payload.nextAction ?? existing.nextAction;
  const completedDate = normalizeToMysqlDatetime(payload.completed_date ?? payload.completedDate ?? existing.completedDate);
  const scheduleDate = normalizeToMysqlDate(payload.schedule_date ?? payload.scheduleDate ?? existing.scheduleDate);
  const scheduleTime = payload.schedule_time ?? payload.scheduleTime ?? existing.scheduleTime;
  const priority = payload.priority ?? existing.priority;
  const updatedBy = payload.updated_by ?? payload.updatedBy ?? existing.updatedBy;

  if (process.env.NODE_ENV !== "production") {
    console.debug("[BuyerFollowup.update] bound vals:", {
      followupType,
      buyerLeadStage,
      buyerLeadStatus,
      remark,
      customRemark,
      nextAction,
      completedDate,
      scheduleDate,
      scheduleTime,
      priority,
      updatedBy,
    });
  }

  const sql = `
    UPDATE buyer_followups SET
      followup_type = ?, buyer_lead_stage = ?, buyer_lead_status = ?, remark = ?,
      custom_remark = ?, next_action = ?, completed_date = ?,
      schedule_date = ?, schedule_time = ?, priority = ?, updated_by = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  const [res] = await db.execute(sql, [
    followupType,
    buyerLeadStage,
    buyerLeadStatus,
    remark,
    customRemark,
    nextAction,
    completedDate,
    scheduleDate,
    scheduleTime,
    priority,
    updatedBy,
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
