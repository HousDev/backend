const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const { toMySQLDateTime, combineDateTime } = require("../utils/dateUtils");

/* ================== CREATE FOLLOWUP ================== */
const createFollowup = async (req, res) => {
  try {
    const {
      leadId,
      type,
      status,
      stage,
      remark,
      customRemark,
      nextAction,
      scheduledDate,
      completedDate,
      createdBy,
      priority   // 👈 this is for client_leads, not followups
    } = req.body;

    const id = uuidv4();
    const createdByValue = Number.isInteger(createdBy) ? createdBy : 1;

    // 1️⃣ Insert into followups (❌ priority हटा दिया गया)
    await db.query(
      `INSERT INTO followups 
       (id, lead_id, type, status, stage, remark, customRemark, next_action, 
        scheduled_date, completed_date, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        leadId || null,
        type || null,
        status || null,
        stage || null,
        remark || null,
        customRemark || null,
        nextAction || null,
        toMySQLDateTime(scheduledDate),
        toMySQLDateTime(completedDate),
        createdByValue,
        null
      ]
    );

    // 2️⃣ Update client_leads (priority यहीं handle होगी)
    if (leadId && (status || stage || priority)) {
      await db.query(
        `UPDATE client_leads 
         SET status = COALESCE(?, status), 
             stage = COALESCE(?, stage), 
             priority = COALESCE(?, priority),
             updated_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          status ?? null,
          stage ?? null,
          priority ?? null,
          createdByValue,
          leadId
        ]
      );
    }

    // 3️⃣ Return followup (priority client_leads से join कर सकते हैं अगर चाहिए तो)
    const [rows] = await db.query(
      `SELECT 
        f.id,
        f.lead_id as leadId,
        f.type,
        f.status,
        f.stage,
        f.remark,
        f.customRemark,
        f.next_action as nextAction,
        f.scheduled_date as scheduledDate,
        f.completed_date as completedDate,
        f.created_by as createdById,
        cu.first_name as createdByFirstName,
        cu.last_name as createdByLastName,
        f.updated_by as updatedById,
        uu.first_name as updatedByFirstName,
        uu.last_name as updatedByLastName,
        f.created_at as createdAt,
        f.updated_at as updatedAt,
        l.priority as leadPriority   -- 👈 lead से priority आ जाएगी
       FROM followups f
       LEFT JOIN users cu ON cu.id = f.created_by
       LEFT JOIN users uu ON uu.id = f.updated_by
       LEFT JOIN client_leads l ON l.id = f.lead_id
       WHERE f.id = ?`,
      [id]
    );

    res.status(201).json({
      message: "Followup created successfully & Lead updated",
      data: rows[0],
    });
  } catch (err) {
    console.error("Create Followup Error:", err);
    res.status(500).json({ error: "Failed to create followup", details: err.message });
  }
};

/* ================== UPDATE FOLLOWUP ================== */
const updateFollowup = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const type = body.type ?? body.followupType ?? null;
    const status = body.status ?? body.leadStatus ?? null;
    const stage = body.stage ?? body.leadStage ?? null;
    const remark = body.remark ?? null;
    const customRemark = body.customRemark ?? null;
    const nextAction = body.nextAction ?? null;
    const updatedBy = Number.isInteger(body.updatedBy) ? body.updatedBy : 1;

    const scheduledDate = body.scheduledDate
      ? toMySQLDateTime(body.scheduledDate)
      : combineDateTime(body.scheduleDate, body.scheduleTime);

    const completedDate = body.completedDate
      ? toMySQLDateTime(body.completedDate)
      : null;

    // 1️⃣ Update followup (❌ priority नहीं)
    const [result] = await db.query(
      `UPDATE followups 
       SET type = ?, status = ?, stage = ?, remark = ?, customRemark = ?, next_action = ?, 
           scheduled_date = ?, completed_date = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        type,
        status,
        stage,
        remark,
        customRemark,
        nextAction,
        scheduledDate,
        completedDate,
        updatedBy,
        id
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: "Followup not found" });
    }

    // 2️⃣ Fetch updated followup (with lead priority)
    const [updatedRows] = await db.query(
      `SELECT 
        f.id,
        f.lead_id as leadId,
        f.type,
        f.status,
        f.stage,
        f.remark,
        f.customRemark,
        f.next_action as nextAction,
        f.scheduled_date as scheduledDate,
        f.completed_date as completedDate,
        f.created_by as createdById,
        cu.first_name as createdByFirstName,
        cu.last_name as createdByLastName,
        f.updated_by as updatedById,
        uu.first_name as updatedByFirstName,
        uu.last_name as updatedByLastName,
        f.created_at as createdAt,
        f.updated_at as updatedAt,
        l.priority as leadPriority
       FROM followups f
       LEFT JOIN users cu ON cu.id = f.created_by
       LEFT JOIN users uu ON uu.id = f.updated_by
       LEFT JOIN client_leads l ON l.id = f.lead_id
       WHERE f.id = ?`,
      [id]
    );

    const updatedFollowup = updatedRows[0];

    // 3️⃣ Update lead
    if (updatedFollowup && (status || stage || body.priority)) {
      await db.query(
        `UPDATE client_leads 
         SET status = COALESCE(?, status), 
             stage = COALESCE(?, stage), 
             priority = COALESCE(?, priority),
             updated_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          status ?? null,
          stage ?? null,
          body.priority ?? null,
          updatedBy,
          updatedFollowup.leadId
        ]
      );
    }

    res.json({
      message: "Followup updated successfully",
      data: updatedFollowup
    });
  } catch (err) {
    console.error("Update Followup Error:", err);
    res.status(500).json({ error: "Failed to update followup", details: err.message });
  }
};

// Get All Followups
const getFollowups = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        id,
        lead_id as leadId,
        type,
        status,
        stage,
        remark,
        customRemark,
        next_action as nextAction,
        scheduled_date as scheduledDate,
        completed_date as completedDate,
        created_by as createdBy,
        created_at as createdAt,
        updated_at as updatedAt
       FROM followups 
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Get Followups Error:", err);
    res.status(500).json({ error: "Failed to fetch followups", details: err.message });
  }
};

// Get Single Followup
const getFollowupById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        id,
        lead_id as leadId,
        type,
        status,
        stage,
        remark,
        customRemark,
        next_action as nextAction,
        scheduled_date as scheduledDate,
        completed_date as completedDate,
        created_by as createdBy,
        created_at as createdAt,
        updated_at as updatedAt
       FROM followups WHERE id = ?`,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: "Followup not found" });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Get Followup By ID Error:", err);
    res.status(500).json({ error: "Failed to fetch followup", details: err.message });
  }
};




// Delete Followup
const deleteFollowup = async (req, res) => {
  try {
    const [result] = await db.query("DELETE FROM followups WHERE id = ?", [req.params.id]);

    if (!result.affectedRows) return res.status(404).json({ error: "Followup not found" });

    res.json({ message: "Followup deleted successfully" });
  } catch (err) {
    console.error("Delete Followup Error:", err);
    res.status(500).json({ error: "Failed to delete followup", details: err.message });
  }
  
};

const getFollowupsByLeadId = async (req, res) => {
  try {
    const { leadId } = req.params;

    const [rows] = await db.query(
      `SELECT 
        f.id,
        f.lead_id AS leadId,
        f.type,
        f.status,
        f.stage,
        f.remark,
        f.customRemark,
        f.next_action AS nextAction,
        f.scheduled_date AS scheduledDate,
        f.completed_date AS completedDate,
        f.created_by AS createdById,
        cu.first_name AS createdByFirstName,
        cu.last_name AS createdByLastName,
        f.updated_by AS updatedById,
        uu.first_name AS updatedByFirstName,
        uu.last_name AS updatedByLastName,
        f.created_at AS createdAt,
        f.updated_at AS updatedAt
       FROM followups f
       LEFT JOIN users cu ON cu.id = CAST(f.created_by AS UNSIGNED) 
       LEFT JOIN users uu ON uu.id = f.updated_by
       WHERE f.lead_id = ?
       ORDER BY f.created_at DESC`,
      [leadId]
    );

    // ✅ अगर कोई followups नहीं है तो भी 200 के साथ empty array भेजो
    return res.json({ success: true, data: rows || [] });

  } catch (err) {
    console.error("Get Followups By LeadId Error:", err);
    res.status(500).json({ error: "Failed to fetch followups", details: err.message });
  }
};




const getFollowupsCountByLeadId = async (req, res) => {
  try {
    const { leadId } = req.params;

    const [[{ count }]] = await db.query(
      `SELECT COUNT(*) as count FROM followups WHERE lead_id = ?`,
      [leadId]
    );

    res.json({ success: true, count });
  } catch (err) {
    console.error("Get Followups Count By LeadId Error:", err);
    res.status(500).json({ error: "Failed to fetch followups count", details: err.message });
  }
};


module.exports = {
  createFollowup,
  getFollowups,
  getFollowupById,
  updateFollowup,
  deleteFollowup,
  getFollowupsByLeadId,
  getFollowupsCountByLeadId
};
