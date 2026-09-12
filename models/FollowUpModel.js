const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const { sendAssignmentNotification } = require("../utils/notificationHelper");

class FollowUpModel {
  /**
   * Create a new follow-up record
   */
  static async create(data) {
    const id =
      data.id || `fu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const entityCode = (
      data.entity_code ||
      data.entityCode ||
      "LEAD"
    ).toUpperCase();
    const entityId = data.entity_id || data.entityId || null;
    const entityName =
      data.entity_name ||
      data.entityName ||
      data.name ||
      (data.entity_ref
        ? String(data.entity_ref).replace(/\s*\([^)]*\)\s*$/, "")
        : "Customer");
    const entityPhone =
      data.entity_phone ||
      data.entityPhone ||
      data.phone ||
      (data.entity_ref && String(data.entity_ref).match(/\(([^)]+)\)/)
        ? String(data.entity_ref).match(/\(([^)]+)\)/)[1]
        : null);
    const entityRef =
      data.entity_ref ||
      data.entityRef ||
      (entityPhone ? `${entityName} (${entityPhone})` : entityName);
    const followUpTypeCode = (
      data.follow_up_type_code ||
      data.followUpTypeCode ||
      data.type ||
      "CALL"
    ).toUpperCase();
    const stageCode = data.stage_code || data.stageCode || data.stage || null;
    const statusCode =
      data.status_code || data.statusCode || data.status || null;
    const outcomeCode =
      data.outcome_code || data.outcomeCode || data.outcome || null;
    const reasonCode =
      data.reason_code || data.reasonCode || data.reason || null;
    const nextActionCode =
      data.next_action_code || data.nextActionCode || data.nextAction || null;
    const nextFollowUpTypeCode =
      data.next_follow_up_type_code || data.nextFollowUpTypeCode || null;
    const priorityCode = (
      data.priority_code ||
      data.priorityCode ||
      data.priority ||
      "MEDIUM"
    ).toUpperCase();

    // Scheduled Date & Time
    let scheduledDate =
      data.scheduled_date ||
      data.scheduledDate ||
      data.date ||
      new Date().toISOString().slice(0, 10);
    let scheduledTime =
      data.scheduled_time || data.scheduledTime || data.time || "11:00";
    if (scheduledDate && scheduledDate.includes("T")) {
      const d = new Date(scheduledDate);
      scheduledDate = d.toISOString().slice(0, 10);
      if (!data.scheduled_time && !data.scheduledTime && !data.time) {
        scheduledTime = d.toTimeString().slice(0, 5);
      }
    }

    const attemptNo = Number(data.attempt_no || data.attemptNo || 1);
    const sequenceName = data.sequence_name || data.sequenceName || null;
    const isComplete = data.is_complete || data.isComplete ? 1 : 0;
    const completedAt = data.completed_at || data.completedAt || null;
    const terminal = data.terminal ? 1 : 0;
    const customRemark =
      data.custom_remark ||
      data.customRemark ||
      data.remark ||
      data.notes ||
      null;
    const project = data.project || null;
    const siteLocation = data.site_location || data.siteLocation || null;
    const participants = data.participants || null;
    const messageTemplate =
      data.message_template || data.messageTemplate || null;
    const ruleSnapshot = data.rule_snapshot
      ? JSON.stringify(data.rule_snapshot)
      : null;
    const aiGenerated = data.ai_generated ? 1 : 0;
    const aiActionType = data.ai_action_type || null;
    const aiMetadata = data.ai_metadata
      ? JSON.stringify(data.ai_metadata)
      : null;
    const aiProcessedAt = data.ai_processed_at || null;
    const assignedTo = data.assigned_to || data.assignedTo || null;
    const dueDate = data.due_date || data.dueDate || null;
    const dueTime = data.due_time || data.dueTime || null;
    const createdBy = data.created_by || data.createdBy || null;

    let resolvedEntityId = entityId;
    let leadUuid = null;
    if (entityCode === "LEAD" && entityId) {
      try {
        const [lRows] = await db.query(
          "SELECT id, lead_number FROM client_leads WHERE id = ? OR lead_number = ? LIMIT 1",
          [entityId, entityId],
        );
        if (lRows.length > 0) {
          leadUuid = lRows[0].id;
          if (lRows[0].lead_number) {
            resolvedEntityId = String(lRows[0].lead_number);
          }
        }
      } catch (err) {
        console.warn(
          "[FollowUpModel.create] could not resolve lead_number:",
          err.message,
        );
      }
    }

    // Dynamic column matching to prevent errors if schema has differences
    try {
      const [colRows] = await db.query(
        `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'fu_follow_ups'`,
      );
      const existingCols = colRows.map((r) => r.COLUMN_NAME);

      const recordMap = {
        id,
        entity_code: entityCode,
        entity_id: resolvedEntityId,
        entity_name: entityName,
        entity_phone: entityPhone,
        entity_ref: entityRef,
        follow_up_type_code: followUpTypeCode,
        stage_code: stageCode,
        status_code: statusCode,
        outcome_code: outcomeCode,
        reason_code: reasonCode,
        next_action_code: nextActionCode,
        next_follow_up_type_code: nextFollowUpTypeCode,
        priority_code: priorityCode,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        attempt_no: attemptNo,
        sequence_name: sequenceName,
        is_complete: isComplete,
        completed_at: completedAt,
        terminal,
        custom_remark: customRemark,
        project,
        site_location: siteLocation,
        participants,
        message_template: messageTemplate,
        rule_snapshot: ruleSnapshot,
        ai_generated: aiGenerated,
        ai_action_type: aiActionType,
        ai_metadata: aiMetadata,
        ai_processed_at: aiProcessedAt,
        assigned_to: assignedTo,
        assigned_by: data.assigned_by || data.assignedBy || null,
        due_date: dueDate,
        due_time: dueTime,
        created_by: createdBy,
      };

      const insertCols = [];
      const insertVals = [];
      const insertPlaceholders = [];

      for (const [col, val] of Object.entries(recordMap)) {
        if (existingCols.length === 0 || existingCols.includes(col)) {
          insertCols.push(`\`${col}\``);
          insertVals.push(val);
          insertPlaceholders.push("?");
        }
      }

      if (existingCols.includes("created_at")) {
        insertCols.push("`created_at`");
        insertPlaceholders.push("NOW()");
      }
      if (existingCols.includes("updated_at")) {
        insertCols.push("`updated_at`");
        insertPlaceholders.push("NOW()");
      }

      const sql = `INSERT INTO \`fu_follow_ups\` (${insertCols.join(", ")}) VALUES (${insertPlaceholders.join(", ")})`;
      await db.query(sql, insertVals);
    } catch (err) {
      console.error(
        "[FollowUpModel.create] insert error in fu_follow_ups:",
        err.message,
      );
      throw err;
    }

    // Update parent entity (Lead / Buyer / Seller) stage, status, priority, and last_contact
    if (entityId) {
      try {
        if (entityCode === "LEAD") {
          await db.query(
            `UPDATE client_leads 
             SET status = COALESCE(?, status), 
                 stage = COALESCE(?, stage), 
                 priority = COALESCE(?, priority),
                 last_contact = NOW(),
                 last_contact_by = COALESCE(?, last_contact_by),
                 updated_at = NOW()
             WHERE id = ? OR lead_number = ?`,
            [
              statusCode,
              stageCode,
              priorityCode,
              createdBy,
              leadUuid || entityId,
              resolvedEntityId || entityId,
            ],
          );
        } else if (entityCode === "BUYER") {
          await db.query(
            `UPDATE buyers 
             SET buyer_lead_status = COALESCE(?, buyer_lead_status), 
                 buyer_lead_stage = COALESCE(?, buyer_lead_stage), 
                 priority = COALESCE(?, priority),
                 last_contact = NOW(),
                 last_contact_by = COALESCE(?, last_contact_by),
                 updated_at = NOW()
             WHERE id = ?`,
            [statusCode, stageCode, priorityCode, createdBy, entityId],
          );
        } else if (entityCode === "SELLER") {
          await db.query(
            `UPDATE sellers 
             SET status = COALESCE(?, status), 
                 stage = COALESCE(?, stage), 
                 priority = COALESCE(?, priority),
                 last_activity = NOW(),
                 updated_at = NOW()
             WHERE id = ?`,
            [statusCode, stageCode, priorityCode, entityId],
          );
        }
      } catch (parentUpdateErr) {
        console.warn(
          "[FollowUpModel.create] Parent entity update warning:",
          parentUpdateErr.message,
        );
      }
    }

    const createdFollowup = await this.findById(id);
    await this.queueFollowupReminder(createdFollowup);
    return createdFollowup;
  }

  /**
   * Queue a reminder notification for a follow-up that was scheduled for an assigned user.
   * It uses the same fu_automation_jobs table already trusted by the scheduler.
   */
  static async queueFollowupReminder(followup) {
    try {
      if (
        !followup ||
        !followup.entity_code ||
        !followup.assigned_to ||
        !followup.scheduled_date ||
        !followup.scheduled_time
      ) {
        return;
      }

      const entityCode = String(followup.entity_code || "").toUpperCase();
      if (entityCode !== "LEAD" && entityCode !== "CLIENT_LEAD") {
        return;
      }

      const scheduledDate = String(followup.scheduled_date || "").slice(0, 10);
      const scheduledTime = String(followup.scheduled_time || "11:00");
      const scheduledAt = new Date(
        `${scheduledDate}T${scheduledTime}:00+05:30`,
      );
      if (
        Number.isNaN(scheduledAt.getTime()) ||
        scheduledAt.getTime() < Date.now()
      ) {
        return;
      }

      const leadIdByEntity = await db
        .query(
          `SELECT id, lead_number, name FROM client_leads WHERE id = ? OR lead_number = ? LIMIT 1`,
          [followup.entity_id, followup.entity_id],
        )
        .then(([rows]) => rows[0] || null)
        .catch(() => null);

      if (!leadIdByEntity) {
        return;
      }

      const [userRows] = await db
        .query(
          `SELECT id, first_name, last_name, email, phone FROM users WHERE id = ? LIMIT 1`,
          [followup.assigned_to],
        )
        .catch(() => [[]]);
      if (!userRows || userRows.length === 0) {
        return;
      }

      const user = userRows[0];
      const reminderFor = scheduledAt
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      const reminderId = `FU_REM_${followup.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const payload = {
        type: "FOLLOWUP_REMINDER",
        is_reminder: true,
        entity_code: entityCode,
        entity_id: String(followup.entity_id || leadIdByEntity.id),
        data: {
          followup_id: followup.id,
          lead_id: leadIdByEntity.id,
          lead_number: leadIdByEntity.lead_number || null,
          lead_name: leadIdByEntity.name || null,
          followup_date: scheduledDate,
          followup_time: scheduledTime,
          followup_type:
            followup.follow_up_type_code || followup.type || "CALL",
          assignee_id: followup.assigned_to,
          assignee_name:
            `${user.first_name || ""} ${user.last_name || ""}`.trim(),
          message: `Follow-up reminder for ${leadIdByEntity.name || "lead"} scheduled at ${scheduledDate} ${scheduledTime}.`,
        },
      };

      await db.query(
        `INSERT INTO \`fu_automation_jobs\` (id, channel, recipient_phone, recipient_email, template_id, payload, status, scheduled_for, entity_code, entity_id, rule_id, created_at, updated_at)
 VALUES (?, 'MESSAGE', ?, ?, 'FOLLOWUP_REMINDER', ?, 'PENDING', ?, ?, ?, 'FOLLOWUP_REMINDER', NOW(), NOW())`,
        [
          reminderId,
          user.phone || "",
          user.email || "",
          JSON.stringify(payload),
          reminderFor,
          entityCode,
          String(followup.entity_id || leadIdByEntity.id),
        ],
      );

      const leadName = leadIdByEntity.name || followup.entity_name || "Lead";
      const leadLink = `/leads/${leadIdByEntity.id}`;
      await sendAssignmentNotification({
        userId: followup.assigned_to,
        type: "followup_reminder",
        itemId: leadIdByEntity.id,
        itemName: leadName,
        message: `Follow-up reminder: ${leadName} follow-up is scheduled on ${scheduledDate} at ${scheduledTime}.`,
        link: leadLink,
      });
    } catch (err) {
      console.warn(
        "[FollowUpModel.queueFollowupReminder] warning:",
        err && err.message ? err.message : err,
      );
    }
  }

  /**
   * Helper to map raw database row to standard enriched FollowUp object
   */
  static formatFollowUp(row) {
    if (!row) return null;

    const firstName = row.created_by_first_name || "";
    const lastName = row.created_by_last_name || "";
    const fullName =
      row.created_by_name &&
      row.created_by_name.trim().length > 0 &&
      row.created_by_name !== "System" &&
      !row.created_by_name.toLowerCase().includes("system")
        ? row.created_by_name.trim()
        : firstName || lastName
          ? `${firstName} ${lastName}`.trim()
          : null;

    const asgnFirst = row.assigned_first_name || "";
    const asgnLast = row.assigned_last_name || "";
    const asgnName =
      row.assigned_to_name ||
      (asgnFirst || asgnLast ? `${asgnFirst} ${asgnLast}`.trim() : null);

    const asgnByFirst = row.assigned_by_first_name || "";
    const asgnByLast = row.assigned_by_last_name || "";
    const asgnByName =
      row.assigned_by_name &&
      row.assigned_by_name.trim().length > 0 &&
      row.assigned_by_name !== "System" &&
      !row.assigned_by_name.toLowerCase().includes("system")
        ? row.assigned_by_name.trim()
        : asgnByFirst || asgnByLast
          ? `${asgnByFirst} ${asgnByLast}`.trim()
          : row.entity_creator_name
            ? row.entity_creator_name.trim()
            : null;

    return {
      ...row,
      id: row.id,
      entity_code: row.entity_code || "LEAD",
      entityCode: row.entity_code || "LEAD",
      entity_id: row.entity_id,
      entityId: row.entity_id,
      lead_id: row.entity_id,
      leadId: row.entity_id,
      buyer_id: row.entity_id,
      buyerId: row.entity_id,
      seller_id: row.entity_id,
      sellerId: row.entity_id,
      type: row.follow_up_type_code || row.type || "Call",
      followupType: row.follow_up_type_code || row.type || "Call",
      follow_up_type_code: row.follow_up_type_code || "CALL",
      stage: row.stage_code || row.stage || "",
      stage_code: row.stage_code || "",
      leadStage: row.stage_code || "",
      status: row.status_code || row.status || "",
      status_code: row.status_code || "",
      leadStatus: row.status_code || "",
      outcome: row.outcome_code || "",
      outcome_code: row.outcome_code || "",
      reason: row.reason_code || "",
      reason_code: row.reason_code || "",
      nextAction: row.next_action_code || "",
      next_action: row.next_action_code || "",
      next_action_code: row.next_action_code || "",
      customRemark: row.custom_remark || row.remark || "",
      remark: row.custom_remark || row.remark || "",
      custom_remark: row.custom_remark || "",
      notes: row.custom_remark || row.notes || "",
      priority: row.priority_code || "Medium",
      priority_code: row.priority_code || "MEDIUM",
      scheduledDate: row.scheduled_date || row.scheduledDate || null,
      scheduled_date: row.scheduled_date || row.scheduledDate || null,
      scheduledTime: row.scheduled_time || row.scheduledTime || "11:00",
      scheduled_time: row.scheduled_time || row.scheduledTime || "11:00",
      isComplete:
        row.is_complete === 1 ||
        row.is_complete === true ||
        row.is_complete === "1",
      is_complete:
        row.is_complete === 1 ||
        row.is_complete === true ||
        row.is_complete === "1"
          ? 1
          : 0,
      completedAt: row.completed_at || null,
      completed_at: row.completed_at || null,
      createdAt: row.created_at || null,
      created_at: row.created_at || null,
      updatedAt: row.updated_at || null,
      updated_at: row.updated_at || null,
      createdByFirstName: firstName,
      createdByLastName: lastName,
      created_by_name: fullName,
      createdByName: fullName,
      createdBy: fullName,
      assigned_to: row.assigned_to || null,
      assignedTo: row.assigned_to || null,
      assigned_to_name: asgnName,
      assignedToName: asgnName,
      assignedExecutiveName: asgnName,
      assigned_by_name: asgnByName,
      assignedByName: asgnByName,
    };
  }

  /**
   * Helper to inspect existing columns in fu_follow_ups
   */
  static async getExistingColumns() {
    try {
      const [colRows] = await db.query(
        `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'fu_follow_ups'`,
      );
      return colRows.map((r) => r.COLUMN_NAME);
    } catch (err) {
      console.warn("[FollowUpModel.getExistingColumns] warning:", err.message);
      return [];
    }
  }

  /**
   * Find a follow-up by ID
   */
  static async findById(id) {
    try {
      const existingCols = await this.getExistingColumns();
      let selectExtra = "";
      let joins = "";

      if (existingCols.includes("created_by")) {
        selectExtra += `, u1.first_name AS created_by_first_name, u1.last_name AS created_by_last_name, CONCAT(COALESCE(u1.first_name, ''), ' ', COALESCE(u1.last_name, '')) AS created_by_name`;
        joins += ` LEFT JOIN users u1 ON u1.id = f.created_by`;
      }
      if (existingCols.includes("assigned_to")) {
        selectExtra += `, u_asgn.first_name AS assigned_first_name, u_asgn.last_name AS assigned_last_name`;
        joins += ` LEFT JOIN users u_asgn ON u_asgn.id = f.assigned_to`;
      }
      if (existingCols.includes("assigned_by")) {
        selectExtra += `, u_asgn_by.first_name AS assigned_by_first_name, u_asgn_by.last_name AS assigned_by_last_name, CONCAT(COALESCE(u_asgn_by.first_name, ''), ' ', COALESCE(u_asgn_by.last_name, '')) AS assigned_by_name`;
        joins += ` LEFT JOIN users u_asgn_by ON u_asgn_by.id = f.assigned_by`;
      }

      const sql = `SELECT f.* ${selectExtra} FROM \`fu_follow_ups\` f ${joins} WHERE f.id = ?`;
      const [rows] = await db.query(sql, [id]);
      if (!rows || rows.length === 0) return null;
      return this.formatFollowUp(rows[0]);
    } catch (err) {
      console.error("[FollowUpModel.findById] error:", err.message);
      return null;
    }
  }

  /**
   * Find all follow-ups with optional filters
   */
  static async findAll(filters = {}) {
    try {
      const existingCols = await this.getExistingColumns();
      let conditions = [];
      let params = [];

      if (filters.entityCode || filters.entity_code) {
        conditions.push("f.entity_code = ?");
        params.push(filters.entityCode || filters.entity_code);
      }

      if (
        filters.entityId ||
        filters.entity_id ||
        filters.leadId ||
        filters.buyerId ||
        filters.sellerId
      ) {
        const idVal = String(
          filters.entityId ||
            filters.entity_id ||
            filters.leadId ||
            filters.buyerId ||
            filters.sellerId,
        );
        conditions.push(
          "(f.entity_id = ? OR f.entity_id IN (SELECT CAST(lead_number AS CHAR) FROM client_leads WHERE id = ?) OR f.entity_id IN (SELECT id FROM client_leads WHERE lead_number = ?))",
        );
        params.push(idVal, idVal, idVal);
      }

      if (
        filters.followUpTypeCode ||
        filters.follow_up_type_code ||
        filters.type
      ) {
        conditions.push("f.follow_up_type_code = ?");
        params.push(
          filters.followUpTypeCode ||
            filters.follow_up_type_code ||
            filters.type,
        );
      }

      if (filters.isComplete !== undefined && filters.isComplete !== null) {
        conditions.push("f.is_complete = ?");
        params.push(filters.isComplete ? 1 : 0);
      }

      if (filters.scheduledDate || filters.scheduled_date || filters.date) {
        conditions.push("f.scheduled_date = ?");
        params.push(
          filters.scheduledDate || filters.scheduled_date || filters.date,
        );
      }

      if (filters.priorityCode || filters.priority_code || filters.priority) {
        conditions.push("f.priority_code = ?");
        params.push(
          filters.priorityCode || filters.priority_code || filters.priority,
        );
      }

      if (filters.assignedTo || filters.assigned_to) {
        conditions.push("f.assigned_to = ?");
        params.push(filters.assignedTo || filters.assigned_to);
      }

      let selectExtra = "";
      let joins = "";

      if (existingCols.includes("created_by")) {
        selectExtra += `, u1.first_name AS created_by_first_name, u1.last_name AS created_by_last_name, CONCAT(COALESCE(u1.first_name, ''), ' ', COALESCE(u1.last_name, '')) AS created_by_name`;
        joins += ` LEFT JOIN users u1 ON u1.id = f.created_by`;
      }
      if (existingCols.includes("assigned_to")) {
        selectExtra += `, u_asgn.first_name AS assigned_first_name, u_asgn.last_name AS assigned_last_name`;
        joins += ` LEFT JOIN users u_asgn ON u_asgn.id = f.assigned_to`;
      }
      if (existingCols.includes("assigned_by")) {
        selectExtra += `, u_asgn_by.first_name AS assigned_by_first_name, u_asgn_by.last_name AS assigned_by_last_name, CONCAT(COALESCE(u_asgn_by.first_name, ''), ' ', COALESCE(u_asgn_by.last_name, '')) AS assigned_by_name`;
        joins += ` LEFT JOIN users u_asgn_by ON u_asgn_by.id = f.assigned_by`;
      }

      // Parent entity creator joins for BUYER, SELLER, LEAD + primary admin fallback
      joins += `
        LEFT JOIN buyers b_ent ON (f.entity_code = 'BUYER' OR f.entity_code = 'BUYER_LEAD') AND (b_ent.id = f.entity_id)
        LEFT JOIN users b_creator ON b_creator.id = b_ent.created_by
        LEFT JOIN sellers s_ent ON (f.entity_code = 'SELLER' OR f.entity_code = 'SELLER_LEAD') AND (s_ent.id = f.entity_id)
        LEFT JOIN users s_creator ON s_creator.id = s_ent.created_by
        LEFT JOIN client_leads l_ent ON (f.entity_code = 'LEAD' OR f.entity_code = 'CLIENT_LEAD') AND (l_ent.id = f.entity_id OR l_ent.lead_number = f.entity_id)
        LEFT JOIN users l_creator ON l_creator.id = l_ent.created_by
        LEFT JOIN (SELECT id, salutation, first_name, last_name FROM users WHERE role LIKE '%admin%' OR role LIKE '%super%' ORDER BY id ASC LIMIT 1) adm ON 1=1
      `;

      selectExtra += `,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(b_creator.first_name, ''), ' ', COALESCE(b_creator.last_name, ''))), ''),
          NULLIF(TRIM(CONCAT(COALESCE(s_creator.first_name, ''), ' ', COALESCE(s_creator.last_name, ''))), ''),
          NULLIF(TRIM(CONCAT(COALESCE(l_creator.first_name, ''), ' ', COALESCE(l_creator.last_name, ''))), ''),
          NULLIF(TRIM(CONCAT(COALESCE(adm.first_name, ''), ' ', COALESCE(adm.last_name, ''))), '')
        ) AS entity_creator_name
      `;

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const sql = `
        SELECT f.* ${selectExtra}
        FROM \`fu_follow_ups\` f
        ${joins}
        ${whereClause}
        ORDER BY f.scheduled_date DESC, f.scheduled_time DESC, f.created_at DESC
      `;

      const [rows] = await db.query(sql, params);
      return rows.map((r) => this.formatFollowUp(r));
    } catch (err) {
      console.error("[FollowUpModel.findAll] error:", err.message);
      return [];
    }
  }

  /**
   * Update an existing follow-up
   */
  static async update(id, data) {
    try {
      const allowedFields = [
        "entity_code",
        "entity_id",
        "entity_name",
        "entity_phone",
        "entity_ref",
        "follow_up_type_code",
        "stage_code",
        "status_code",
        "outcome_code",
        "reason_code",
        "next_action_code",
        "next_follow_up_type_code",
        "priority_code",
        "scheduled_date",
        "scheduled_time",
        "attempt_count",
        "attempt_no",
        "sequence_name",
        "sequence_step",
        "is_complete",
        "completed_at",
        "terminal",
        "custom_remark",
        "auto_remark",
        "project",
        "site_location",
        "participants",
        "message_template",
        "rule_snapshot",
        "ai_generated",
        "ai_action_type",
        "ai_metadata",
        "ai_processed_at",
        "assigned_to",
        "assigned_by",
        "due_date",
        "due_time",
        "created_by",
        "updated_by",
      ];

      const existingCols = await this.getExistingColumns();
      const updates = [];
      const params = [];

      for (const [key, val] of Object.entries(data)) {
        const snakeKey = key.replace(
          /[A-Z]/g,
          (letter) => `_${letter.toLowerCase()}`,
        );
        if (
          allowedFields.includes(snakeKey) &&
          (existingCols.length === 0 || existingCols.includes(snakeKey))
        ) {
          updates.push(`\`${snakeKey}\` = ?`);
          if (typeof val === "object" && val !== null) {
            params.push(JSON.stringify(val));
          } else {
            params.push(val);
          }
        }
      }

      if (updates.length === 0) return await this.findById(id);

      if (existingCols.includes("updated_at")) {
        updates.push("`updated_at` = NOW()");
      }

      const sql = `UPDATE \`fu_follow_ups\` SET ${updates.join(", ")} WHERE id = ?`;
      params.push(id);
      await db.query(sql, params);

      // Update parent entity (Lead / Buyer / Seller) stage, status, priority, and last_contact if updated
      const current = await this.findById(id);
      if (current && current.entity_id) {
        const entityCode = data.entity_code || current.entity_code;
        const statusCode = data.status_code || current.status_code;
        const stageCode = data.stage_code || current.stage_code;
        const priorityCode = data.priority_code || current.priority_code;
        const entityId = current.entity_id;
        const updatedBy = data.updated_by || current.updated_by || null;

        try {
          if (entityCode === "LEAD") {
            await db.query(
              `UPDATE client_leads 
               SET status = COALESCE(?, status), 
                   stage = COALESCE(?, stage), 
                   priority = COALESCE(?, priority),
                   last_contact = NOW(),
                   last_contact_by = COALESCE(?, last_contact_by),
                   updated_at = NOW()
               WHERE id = ? OR lead_number = ?`,
              [
                statusCode,
                stageCode,
                priorityCode,
                updatedBy,
                entityId,
                entityId,
              ],
            );
          } else if (entityCode === "BUYER") {
            await db.query(
              `UPDATE buyers 
               SET buyer_lead_status = COALESCE(?, buyer_lead_status), 
                   buyer_lead_stage = COALESCE(?, buyer_lead_stage), 
                   priority = COALESCE(?, priority),
                   last_contact = NOW(),
                   last_contact_by = COALESCE(?, last_contact_by),
                   updated_at = NOW()
               WHERE id = ?`,
              [statusCode, stageCode, priorityCode, updatedBy, entityId],
            );
          } else if (entityCode === "SELLER") {
            await db.query(
              `UPDATE sellers 
               SET status = COALESCE(?, status), 
                   stage = COALESCE(?, stage), 
                   priority = COALESCE(?, priority),
                   last_activity = NOW(),
                   updated_at = NOW()
               WHERE id = ?`,
              [statusCode, stageCode, priorityCode, entityId],
            );
          }
        } catch (parentUpdateErr) {
          console.warn(
            "[FollowUpModel.update] Parent entity update warning:",
            parentUpdateErr.message,
          );
        }
      }

      return current;
    } catch (err) {
      console.error("[FollowUpModel.update] error:", err.message);
      throw err;
    }
  }

  /**
   * Mark a follow-up as completed with outcome & reason
   */
  static async complete(id, outcomeData = {}) {
    try {
      const outcomeCode =
        outcomeData.outcome_code ||
        outcomeData.outcomeCode ||
        outcomeData.outcome ||
        null;
      const reasonCode =
        outcomeData.reason_code ||
        outcomeData.reasonCode ||
        outcomeData.reason ||
        null;
      const customRemark =
        outcomeData.custom_remark || outcomeData.customRemark || null;
      const existingCols = await this.getExistingColumns();

      const updates = ["is_complete = 1"];
      const params = [];

      if (existingCols.includes("completed_at")) {
        updates.push("completed_at = NOW()");
      }
      if (existingCols.includes("outcome_code")) {
        updates.push("outcome_code = COALESCE(?, outcome_code)");
        params.push(outcomeCode);
      }
      if (existingCols.includes("reason_code")) {
        updates.push("reason_code = COALESCE(?, reason_code)");
        params.push(reasonCode);
      }
      if (existingCols.includes("custom_remark")) {
        updates.push("custom_remark = COALESCE(?, custom_remark)");
        params.push(customRemark);
      }
      if (existingCols.includes("updated_at")) {
        updates.push("updated_at = NOW()");
      }

      params.push(id);
      const sql = `UPDATE \`fu_follow_ups\` SET ${updates.join(", ")} WHERE id = ?`;
      await db.query(sql, params);

      return await this.findById(id);
    } catch (err) {
      console.error("[FollowUpModel.complete] error:", err.message);
      throw err;
    }
  }

  /**
   * Delete a follow-up by ID
   */
  static async delete(id) {
    try {
      const [result] = await db.query(
        `DELETE FROM \`fu_follow_ups\` WHERE id = ?`,
        [id],
      );
      return result.affectedRows > 0;
    } catch (err) {
      console.error("[FollowUpModel.delete] error:", err.message);
      return false;
    }
  }
}

module.exports = FollowUpModel;
