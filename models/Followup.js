const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");

class Followup {
  // ------------------- CREATE -------------------
  static async create(followupData) {
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
      priority,
    } = followupData;

    const id = uuidv4();

    await db.execute(
      `INSERT INTO followups (
        id, lead_id, type, status, stage, remark, customRemark, next_action,
        scheduled_date, completed_date, created_by, updated_by, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        leadId || null,
        type || null,
        status || null,
        stage || null,
        remark || null,
        customRemark || null,
        nextAction || null,
        scheduledDate || null,
        completedDate || null,
        createdBy || null,
        null, // updated_by on create remains null
        priority || null,
      ]
    );

    const followup = await this.findById(id);

    // साथ में Lead भी update करो (status/stage/priority/updated_by) — existing pattern follow करते हुए
    if (leadId) {
      const Lead = require("./Lead");
      await Lead.update(leadId, {
        status,
        stage,
        priority,
        updated_by: createdBy,
      });

      // और client_leads की last_contact fields को भी अपडेट करो
      // हम यहाँ direct DB UPDATE कर रहे हैं ताकि last_contact = NOW() ठीक से DB में रहे
      await db.execute(
        `UPDATE client_leads
         SET last_contact = NOW(),
             last_contact_by = ?,
             updated_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [createdBy || null, createdBy || null, leadId]
      );
    }

    return followup;
  }

  // ------------------- FIND ALL -------------------
  static async findAll() {
    const [rows] = await db.execute(
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
        f.priority,
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
      LEFT JOIN users uu ON uu.id = CAST(f.updated_by AS UNSIGNED)
      ORDER BY f.created_at DESC`
    );
    return rows;
  }

  // ------------------- FIND BY ID -------------------
  static async findById(id) {
    const [rows] = await db.execute(
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
        f.priority,
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
      LEFT JOIN users uu ON uu.id = CAST(f.updated_by AS UNSIGNED)
      WHERE f.id = ?`,
      [id]
    );
    return rows[0];
  }

  // ------------------- FIND BY LEAD ID -------------------
  static async findByLeadId(leadId) {
    const [rows] = await db.execute(
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
        f.priority,
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
      LEFT JOIN users uu ON uu.id = CAST(f.updated_by AS UNSIGNED)
      WHERE f.lead_id = ?
      ORDER BY f.created_at DESC`,
      [leadId]
    );
    return rows;
  }

  // ------------------- UPDATE -------------------
  static async update(id, followupData) {
    const {
      type,
      status,
      stage,
      remark,
      customRemark,
      nextAction,
      scheduledDate,
      completedDate,
      updatedBy,
      priority,
    } = followupData;

    await db.execute(
      `UPDATE followups SET
        type = ?, status = ?, stage = ?, remark = ?, customRemark = ?, next_action = ?,
        scheduled_date = ?, completed_date = ?, priority = ?, updated_by = ?, updated_at = NOW()
      WHERE id = ?`,
      [
        type,
        status,
        stage,
        remark,
        customRemark,
        nextAction,
        scheduledDate || null,
        completedDate || null,
        priority || null,
        updatedBy || null,
        id,
      ]
    );

    const followup = await this.findById(id);

    // Lead भी update करो (status/stage/priority/updated_by) — existing pattern
    if (followup && followup.leadId) {
      const Lead = require("./Lead");
      await Lead.update(followup.leadId, {
        status,
        stage,
        priority,
        updated_by: updatedBy,
      });

      // और client_leads की last_contact fields को भी अपडेट करो (updated time = NOW())
      await db.execute(
        `UPDATE client_leads
         SET last_contact = NOW(),
             last_contact_by = ?,
             updated_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [updatedBy || null, updatedBy || null, followup.leadId]
      );
    }

    return followup;
  }

  // ------------------- DELETE -------------------
  static async delete(id) {
    const [result] = await db.execute("DELETE FROM followups WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Followup;
