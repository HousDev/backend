// models/sellerFollowupModel.js
const db = require("../config/database");

/* ----------------------------- helpers ----------------------------- */
function pad(n) { return String(n).padStart(2, "0"); }
function formatDateTime(d) {
  if (!d) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function normalizeToMysqlDatetime(val) {
  if (!val && val !== 0) return null;
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val)) return val;
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return null;
  return formatDateTime(d);
}
function normalizeToMysqlDate(val) {
  if (!val) return null;
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function normalizeToTimeHHmmss(val) {
  if (!val) return null;
  if (typeof val !== "string") return null;
  if (/^\d{2}:\d{2}:\d{2}$/.test(val)) return val;
  if (/^\d{2}:\d{2}$/.test(val)) return `${val}:00`;
  return val; // let DB/SQL handle exotic values
}
function intFlag(v) {
  return (v === 1 || v === "1" || v === true || v === "true") ? 1 : 0;
}

/** Convert DB row -> API shape (send EVERYTHING you asked for) */
function mapRow(row) {
  if (!row) return null;
  return {
    // primary / relations
    id: row.id,
    followupId: row.followup_id ?? null,
    leadId: row.lead_id ?? null,
    sellerId: row.seller_id ?? null,

    // dates/times
    followupDate: row.followup_date ?? null,         // DATE
    followupTime: row.followup_time ?? null,         // TIME
    completedDate: row.completed_date ?? null,       // DATETIME
    scheduleDate: row.schedule_date ?? null,         // DATE
    scheduleTime: row.schedule_time ?? null,         // TIME

    // core fields
    followupType: row.followup_type ?? null,
    sellerLeadStage: row.seller_lead_stage ?? null,
    sellerLeadStatus: row.seller_lead_status ?? null,
    status: row.status ?? null,
    priority: row.priority ?? null,

    // transfer info
    transferredFromLead: row.transferred_from_lead ?? null,
    transferredAt: row.transferred_at ?? null,
    transferredBy: row.transferred_by ?? null,
    transferType: row.transfer_type ?? null,

    // assignment
    assignedTo: row.assigned_to ?? null,
    assignedExecutive: row.assigned_executive ?? null,

    // audit ids
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,

    // text
    notes: row.notes ?? null,
    remark: row.remark ?? null,
    customRemark: row.custom_remark ?? null,
    nextAction: row.next_action ?? null,

    // audit times
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,

    // flags
    reminder: row.reminder ? 1 : 0,

    // joined display names (when present)
    createdByName: row.created_by_name ?? null,
    updatedByName: row.updated_by_name ?? null,
    assignedExecutiveName: row.assigned_executive_name ?? null,
    assignedToName: row.assigned_to_name ?? null,
    transferredByName: row.transferred_by_name ?? null,
  };
}

/* =============================== Model =============================== */
class SellerFollowup {
  /** Create a new seller follow-up (snake_case & camelCase both accepted) */
  static async create(payload) {
    const now = new Date();
    const nowFormatted = formatDateTime(now);

    // IDs / relations
    const followupId        = payload.followup_id ?? payload.followupId ?? null;
    const leadId            = payload.lead_id ?? payload.leadId ?? null;
    const sellerId          = payload.seller_id ?? payload.sellerId ?? null;

    // dates/times
    const followupDate      = normalizeToMysqlDate(payload.followup_date ?? payload.followupDate ?? null);
    const followupTime      = normalizeToTimeHHmmss(payload.followup_time ?? payload.followupTime ?? null);
    const completedDate     = normalizeToMysqlDatetime(payload.completed_date ?? payload.completedDate ?? null);
    const scheduleDate      = normalizeToMysqlDate(payload.schedule_date ?? payload.scheduleDate ?? null);
    const scheduleTime      = normalizeToTimeHHmmss(payload.schedule_time ?? payload.scheduleTime ?? null);

    // core fields
    const followupType      = payload.followup_type ?? payload.followupType ?? null;
    const sellerLeadStage   = payload.seller_lead_stage ?? payload.sellerLeadStage ?? null;
    const sellerLeadStatus  = payload.seller_lead_status ?? payload.sellerLeadStatus ?? null;
    const status            = payload.status ?? null;
    const priority          = payload.priority ?? "Medium";

    // transfer info
    const transferredFromLead = intFlag(payload.transferred_from_lead ?? payload.transferredFromLead ?? 0);
    const transferredAt     = normalizeToMysqlDatetime(payload.transferred_at ?? payload.transferredAt ?? null);
    const transferredBy     = payload.transferred_by ?? payload.transferredBy ?? null;
    const transferType      = payload.transfer_type ?? payload.transferType ?? null;

    // assignment
    const assignedTo        = payload.assigned_to ?? payload.assignedTo ?? null;
    const assignedExecutive = payload.assigned_executive ?? payload.assignedExecutive ?? null;

    // text
    const notes             = payload.notes ?? null;
    const remark            = payload.remark ?? null;
    const customRemark      = payload.custom_remark ?? payload.customRemark ?? null;
    const nextAction        = payload.next_action ?? payload.nextAction ?? null;

    // audit
    const createdBy         = payload.created_by ?? payload.createdBy ?? null;
    const updatedBy         = payload.updated_by ?? payload.updatedBy ?? createdBy ?? null;
    const createdAt         = normalizeToMysqlDatetime(payload.created_at ?? payload.createdAt) ?? nowFormatted;
    const updatedAt         = normalizeToMysqlDatetime(payload.updated_at ?? payload.updatedAt) ?? nowFormatted;

    // flags
    const reminder          = intFlag(payload.reminder);

    if (process.env.NODE_ENV !== "production") {
      console.debug("[SellerFollowup.create] normalized:", {
        followupId, leadId, sellerId,
        followupDate, followupTime, completedDate, scheduleDate, scheduleTime,
        followupType, sellerLeadStage, sellerLeadStatus, status, priority,
        transferredFromLead, transferredAt, transferredBy, transferType,
        assignedTo, assignedExecutive,
        notes, remark, customRemark, nextAction,
        createdBy, updatedBy, createdAt, updatedAt, reminder
      });
    }

    const sql = `
      INSERT INTO seller_followups
      (
        followup_id, lead_id, seller_id,
        followup_date, followup_time, completed_date,
        schedule_date, schedule_time,
        followup_type, seller_lead_stage, seller_lead_status, status, priority,
        transferred_from_lead, transferred_at, transferred_by, transfer_type,
        assigned_to, assigned_executive,
        created_by, updated_by,
        notes, remark, custom_remark, next_action,
        created_at, updated_at, reminder
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [res] = await db.execute(sql, [
      followupId, leadId, sellerId,
      followupDate, followupTime, completedDate,
      scheduleDate, scheduleTime,
      followupType, sellerLeadStage, sellerLeadStatus, status, priority,
      transferredFromLead, transferredAt, transferredBy, transferType,
      assignedTo, assignedExecutive,
      createdBy, updatedBy,
      notes, remark, customRemark, nextAction,
      createdAt, updatedAt, reminder
    ]);

    return res.insertId;
  }

  /**
   * Get all (optionally filter by sellerId) with pagination
   * @param {Object} opts - { sellerId, page=1, limit=20 }
   */
  static async findAll({ sellerId, page = 1, limit = 20 } = {}) {
    const pageInt  = Number.isFinite(Number(page))  ? Math.max(1, parseInt(page, 10))  : 1;
    const limitInt = Number.isFinite(Number(limit)) ? Math.max(1, parseInt(limit, 10)) : 20;
    const offset   = Math.max(0, (pageInt - 1) * limitInt);

    const hasSellerId = sellerId !== undefined && sellerId !== null && String(sellerId).trim() !== "";

    // Smart "latest first": prefer followup_date+time, else schedule, else updated_at, else created_at
    // Use COALESCE of computed DATETIME values.
    const sql = `
      SELECT
        sf.*,

        /* Display names */
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', cu.salutation, cu.first_name, cu.last_name)), ''), cu.username, cu.email) AS created_by_name,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', uu.salutation, uu.first_name, uu.last_name)), ''), uu.username, uu.email) AS updated_by_name,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', ae.salutation, ae.first_name, ae.last_name)), ''), ae.username, ae.email) AS assigned_executive_name,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', at.salutation, at.first_name, at.last_name)), ''), at.username, at.email) AS assigned_to_name,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', tb.salutation, tb.first_name, tb.last_name)), ''), tb.username, tb.email) AS transferred_by_name

      FROM seller_followups sf
      LEFT JOIN users cu ON cu.id = sf.created_by
      LEFT JOIN users uu ON uu.id = sf.updated_by
      LEFT JOIN users ae ON ae.id = sf.assigned_executive
      LEFT JOIN users at ON at.id = sf.assigned_to
      LEFT JOIN users tb ON tb.id = sf.transferred_by
      ${hasSellerId ? "WHERE sf.seller_id = ?" : ""}
      ORDER BY
        COALESCE(
          /* 1) followup date+time */
          CASE
            WHEN sf.followup_date IS NOT NULL THEN
              CONCAT(sf.followup_date, ' ', IFNULL(sf.followup_time, '00:00:00'))
            ELSE NULL
          END,
          /* 2) schedule date+time */
          CASE
            WHEN sf.schedule_date IS NOT NULL THEN
              CONCAT(sf.schedule_date, ' ', IFNULL(sf.schedule_time, '00:00:00'))
            ELSE NULL
          END,
          /* 3) updated_at */
          sf.updated_at,
          /* 4) created_at */
          sf.created_at
        ) DESC
      LIMIT ${limitInt} OFFSET ${offset}
    `;

    const vals = hasSellerId ? [sellerId] : [];

    if (process.env.NODE_ENV !== "production") {
      console.debug("[SellerFollowup.findAll] SQL:", sql);
      console.debug("[SellerFollowup.findAll] vals:", vals);
    }

    try {
      const [rows] = await db.execute(sql, vals);
      return Array.isArray(rows) ? rows.map(mapRow) : [];
    } catch (err) {
      console.error("[SellerFollowup.findAll] error:", err);
      throw err;
    }
  }

  /** Get one by primary id */
  static async findById(id) {
    const sql = `
      SELECT
        sf.*,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', cu.salutation, cu.first_name, cu.last_name)), ''), cu.username, cu.email) AS created_by_name,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', uu.salutation, uu.first_name, uu.last_name)), ''), uu.username, uu.email) AS updated_by_name,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', ae.salutation, ae.first_name, ae.last_name)), ''), ae.username, ae.email) AS assigned_executive_name,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', at.salutation, at.first_name, at.last_name)), ''), at.username, at.email) AS assigned_to_name,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', tb.salutation, tb.first_name, tb.last_name)), ''), tb.username, tb.email) AS transferred_by_name
      FROM seller_followups sf
      LEFT JOIN users cu ON cu.id = sf.created_by
      LEFT JOIN users uu ON uu.id = sf.updated_by
      LEFT JOIN users ae ON ae.id = sf.assigned_executive
      LEFT JOIN users at ON at.id = sf.assigned_to
      LEFT JOIN users tb ON tb.id = sf.transferred_by
      WHERE sf.id = ?
      LIMIT 1
    `;
    const [rows] = await db.execute(sql, [id]);
    if (!rows || !rows[0]) return null;
    return mapRow(rows[0]);
  }

  /** Update by id (full field support) */
  static async update(id, payload) {
    const existing = await this.findById(id);
    if (!existing) return 0;

    // IDs / relations
    const followupId        = payload.followup_id ?? payload.followupId ?? existing.followupId ?? null;
    const leadId            = payload.lead_id ?? payload.leadId ?? existing.leadId ?? null;
    const sellerId          = payload.seller_id ?? payload.sellerId ?? existing.sellerId ?? null;

    // dates/times
    const followupDate      = normalizeToMysqlDate(payload.followup_date ?? payload.followupDate ?? existing.followupDate);
    const followupTime      = normalizeToTimeHHmmss(payload.followup_time ?? payload.followupTime ?? existing.followupTime);
    const completedDate     = normalizeToMysqlDatetime(payload.completed_date ?? payload.completedDate ?? existing.completedDate);
    const scheduleDate      = normalizeToMysqlDate(payload.schedule_date ?? payload.scheduleDate ?? existing.scheduleDate);
    const scheduleTime      = normalizeToTimeHHmmss(payload.schedule_time ?? payload.scheduleTime ?? existing.scheduleTime);

    // core fields
    const followupType      = payload.followup_type ?? payload.followupType ?? existing.followupType ?? null;
    const sellerLeadStage   = payload.seller_lead_stage ?? payload.sellerLeadStage ?? existing.sellerLeadStage ?? null;
    const sellerLeadStatus  = payload.seller_lead_status ?? payload.sellerLeadStatus ?? existing.sellerLeadStatus ?? null;
    const status            = payload.status ?? existing.status ?? null;
    const priority          = payload.priority ?? existing.priority ?? "Medium";

    // transfer info
    const transferredFromLead = intFlag((payload.transferred_from_lead ?? payload.transferredFromLead ?? existing.transferredFromLead) ?? 0);
    const transferredAt     = normalizeToMysqlDatetime(payload.transferred_at ?? payload.transferredAt ?? existing.transferredAt);
    const transferredBy     = payload.transferred_by ?? payload.transferredBy ?? existing.transferredBy ?? null;
    const transferType      = payload.transfer_type ?? payload.transferType ?? existing.transferType ?? null;

    // assignment
    const assignedTo        = payload.assigned_to ?? payload.assignedTo ?? existing.assignedTo ?? null;
    const assignedExecutive = payload.assigned_executive ?? payload.assignedExecutive ?? existing.assignedExecutive ?? null;

    // text
    const notes             = payload.notes ?? existing.notes ?? null;
    const remark            = payload.remark ?? existing.remark ?? null;
    const customRemark      = payload.custom_remark ?? payload.customRemark ?? existing.customRemark ?? null;
    const nextAction        = payload.next_action ?? payload.nextAction ?? existing.nextAction ?? null;

    // audit
    const updatedBy         = payload.updated_by ?? payload.updatedBy ?? existing.updatedBy ?? null;

    // flags
    const reminder          = intFlag(payload.reminder ?? existing.reminder);

    if (process.env.NODE_ENV !== "production") {
      console.debug("[SellerFollowup.update] bound vals:", {
        followupId, leadId, sellerId,
        followupDate, followupTime, completedDate, scheduleDate, scheduleTime,
        followupType, sellerLeadStage, sellerLeadStatus, status, priority,
        transferredFromLead, transferredAt, transferredBy, transferType,
        assignedTo, assignedExecutive,
        notes, remark, customRemark, nextAction,
        reminder, updatedBy
      });
    }

    const sql = `
      UPDATE seller_followups
      SET
        followup_id = ?,
        lead_id = ?,
        seller_id = ?,

        followup_date = ?,
        followup_time = ?,
        completed_date = ?,

        schedule_date = ?,
        schedule_time = ?,

        followup_type = ?,
        seller_lead_stage = ?,
        seller_lead_status = ?,
        status = ?,
        priority = ?,

        transferred_from_lead = ?,
        transferred_at = ?,
        transferred_by = ?,
        transfer_type = ?,

        assigned_to = ?,
        assigned_executive = ?,

        notes = ?,
        remark = ?,
        custom_remark = ?,
        next_action = ?,

        reminder = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const [res] = await db.execute(sql, [
      followupId,
      leadId,
      sellerId,

      followupDate,
      followupTime,
      completedDate,

      scheduleDate,
      scheduleTime,

      followupType,
      sellerLeadStage,
      sellerLeadStatus,
      status,
      priority,

      transferredFromLead,
      transferredAt,
      transferredBy,
      transferType,

      assignedTo,
      assignedExecutive,

      notes,
      remark,
      customRemark,
      nextAction,

      reminder,
      updatedBy,
      id,
    ]);

    return res.affectedRows;
  }

  /** Delete by id */
  static async delete(id) {
    const [res] = await db.execute("DELETE FROM seller_followups WHERE id = ?", [id]);
    return res.affectedRows;
  }
}

module.exports = SellerFollowup;
