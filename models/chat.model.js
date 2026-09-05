// backend/models/chat.model.js
const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");

class ChatModel {
  /**
   * Helper: Parse JSON safely
   */
  static safeJsonParse(str, defaultValue = null) {
    if (!str) return defaultValue;
    if (typeof str === "object") return str;
    try {
      return JSON.parse(str);
    } catch {
      return defaultValue;
    }
  }

  /**
   * Find conversation by user_id and property_id (latest non-archived)
   */
  static async findByUserAndProperty(userId, propertyId) {
    const [rows] = await db.execute(
      `SELECT c.*,
              COALESCE(NULLIF(CONCAT_WS(' ', p.unit_type, p.property_subtype_name, 'in', p.society_name), ''), p.society_name, 'Property') AS property_title,
              p.slug AS property_slug,
              p.final_price AS property_price,
              p.city_name AS property_city,
              p.location_name AS property_location,
              p.society_name AS property_society,
              p.property_type_name,
              p.property_subtype_name,
              p.unit_type,
              p.photos AS property_photos,
              p.assigned_to AS property_assigned_to,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name,
              u.email AS user_email,
              u.phone AS user_phone,
              u.role AS user_role,
              COALESCE(u.avatar, NULL) AS user_avatar,
              e.salutation AS executive_salutation,
              e.first_name AS executive_first_name,
              e.last_name AS executive_last_name,
              e.email AS executive_email,
              e.phone AS executive_phone,
              e.role AS executive_role,
              COALESCE(e.avatar, NULL) AS executive_avatar
       FROM property_conversations c
       LEFT JOIN my_properties p ON c.property_id = p.id
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN users e ON c.executive_id = e.id
       WHERE c.user_id = ? AND c.property_id = ? AND c.status != 'archived'
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [userId, propertyId]
    );

    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    row.property_photos = this.safeJsonParse(row.property_photos, []);
    row.ai_summary_json = this.safeJsonParse(row.ai_summary_json, null);
    return row;
  }

  /**
   * Find conversation by ID (or UUID)
   */
  static async findById(id) {
    const isUuid = typeof id === "string" && id.includes("-");
    const whereClause = isUuid ? "c.conversation_uuid = ?" : "c.id = ?";

    const [rows] = await db.execute(
      `SELECT c.*,
              COALESCE(NULLIF(CONCAT_WS(' ', p.unit_type, p.property_subtype_name, 'in', p.society_name), ''), p.society_name, 'Property') AS property_title,
              p.slug AS property_slug,
              p.final_price AS property_price,
              p.city_name AS property_city,
              p.location_name AS property_location,
              p.society_name AS property_society,
              p.property_type_name,
              p.property_subtype_name,
              p.unit_type,
              p.photos AS property_photos,
              p.assigned_to AS property_assigned_to,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name,
              u.email AS user_email,
              u.phone AS user_phone,
              u.role AS user_role,
              COALESCE(u.avatar, NULL) AS user_avatar,
              e.salutation AS executive_salutation,
              e.first_name AS executive_first_name,
              e.last_name AS executive_last_name,
              e.email AS executive_email,
              e.phone AS executive_phone,
              e.role AS executive_role,
              COALESCE(e.avatar, NULL) AS executive_avatar
       FROM property_conversations c
       LEFT JOIN my_properties p ON c.property_id = p.id
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN users e ON c.executive_id = e.id
       WHERE ${whereClause}
       LIMIT 1`,
      [id]
    );

    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    row.property_photos = this.safeJsonParse(row.property_photos, []);
    row.ai_summary_json = this.safeJsonParse(row.ai_summary_json, null);
    return row;
  }

  /**
   * Atomic Create or Retrieve Conversation (Protected against simultaneous race conditions)
   */
  static async createOrGetAtomic({
    userId,
    propertyId,
    executiveId,
    leadId = null,
    initialMessage = null,
    initialMessageUuid = null,
    senderType = "user",
  }) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      // 1. Check existing non-archived conversation inside transaction with row locking
      const [existingRows] = await conn.execute(
        `SELECT id, status FROM property_conversations
         WHERE user_id = ? AND property_id = ? AND status != 'archived'
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [userId, propertyId]
      );

      if (existingRows && existingRows.length > 0) {
        const existing = existingRows[0];

        if (existing.status === "active") {
          await conn.commit();
          conn.release();
          const conv = await this.findById(existing.id);
          return { conversation: conv, isNew: false, reopened: false };
        }

        if (existing.status === "closed") {
          // Reopen closed conversation with system notice
          const reopenNotice = "Inquiry reopened by user.";
          const msgUuid = uuidv4();

          await conn.execute(
            `UPDATE property_conversations
             SET status = 'active',
                 last_message_text = ?,
                 last_message_at = NOW(),
                 updated_at = NOW()
             WHERE id = ?`,
            [reopenNotice, existing.id]
          );

          await conn.execute(
            `INSERT INTO property_chat_messages (
               message_uuid, conversation_id, sender_id, sender_type,
               message_type, message_text, is_delivered, is_read, created_at
             ) VALUES (?, ?, ?, 'system', 'system', ?, 1, 1, NOW())`,
            [msgUuid, existing.id, userId, reopenNotice]
          );

          await conn.commit();
          conn.release();
          const conv = await this.findById(existing.id);
          return { conversation: conv, isNew: false, reopened: true };
        }
      }

      // 2. Create new conversation
      const uuid = uuidv4();
      let lastMessageText = null;
      let lastMessageAt = null;
      let unreadExecutiveCount = 0;

      if (initialMessage && initialMessage.trim()) {
        lastMessageText = initialMessage.trim();
        lastMessageAt = new Date();
        unreadExecutiveCount = 1;
      }

      const parsedLeadId = leadId ? parseInt(leadId, 10) || null : null;

      const [insertResult] = await conn.execute(
        `INSERT INTO property_conversations (
           conversation_uuid, user_id, property_id, executive_id, lead_id,
           status, deal_stage, last_message_text, last_message_at,
           unread_user_count, unread_executive_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'active', 'inquiry', ?, ?, 0, ?, NOW(), NOW())`,
        [
          uuid,
          userId,
          propertyId,
          executiveId,
          parsedLeadId,
          lastMessageText,
          lastMessageAt,
          unreadExecutiveCount,
        ]
      );

      const conversationId = insertResult.insertId;

      if (initialMessage && initialMessage.trim()) {
        const msgUuid = initialMessageUuid || uuidv4();
        await conn.execute(
          `INSERT INTO property_chat_messages (
             message_uuid, conversation_id, sender_id, sender_type,
             message_type, message_text, is_delivered, is_read, created_at
           ) VALUES (?, ?, ?, ?, 'text', ?, 1, 0, NOW())`,
          [msgUuid, conversationId, userId, senderType, initialMessage.trim()]
        );
      }

      await conn.commit();
      conn.release();

      const conv = await this.findById(conversationId);
      return { conversation: conv, isNew: true, reopened: false };
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  }

  /**
   * List conversations with role-based scoping and filters
   */
  static async listConversations({
    userId = null,
    executiveId = null,
    propertyId = null,
    status = null,
    targetUserId = null,
    isAdmin = false,
    limit = 50,
    offset = 0,
  }) {
    const conditions = [];
    const params = [];

    if (!isAdmin) {
      if (executiveId) {
        conditions.push("c.executive_id = ?");
        params.push(executiveId);
      } else if (userId) {
        conditions.push("c.user_id = ?");
        params.push(userId);
      }
    } else {
      // Admin filters
      if (executiveId) {
        conditions.push("c.executive_id = ?");
        params.push(executiveId);
      }
      if (targetUserId) {
        conditions.push("c.user_id = ?");
        params.push(targetUserId);
      }
      if (propertyId) {
        conditions.push("c.property_id = ?");
        params.push(propertyId);
      }
    }

    if (status) {
      conditions.push("c.status = ?");
      params.push(status);
    } else {
      conditions.push("c.status != 'archived'");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const [rows] = await db.execute(
      `SELECT c.*,
              COALESCE(NULLIF(CONCAT_WS(' ', p.unit_type, p.property_subtype_name, 'in', p.society_name), ''), p.society_name, 'Property') AS property_title,
              p.slug AS property_slug,
              p.final_price AS property_price,
              p.city_name AS property_city,
              p.location_name AS property_location,
              p.society_name AS property_society,
              p.property_type_name,
              p.property_subtype_name,
              p.unit_type,
              p.photos AS property_photos,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name,
              u.email AS user_email,
              u.phone AS user_phone,
              u.role AS user_role,
              COALESCE(u.avatar, NULL) AS user_avatar,
              e.salutation AS executive_salutation,
              e.first_name AS executive_first_name,
              e.last_name AS executive_last_name,
              e.email AS executive_email,
              e.phone AS executive_phone,
              e.role AS executive_role,
              COALESCE(e.avatar, NULL) AS executive_avatar
       FROM property_conversations c
       LEFT JOIN my_properties p ON c.property_id = p.id
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN users e ON c.executive_id = e.id
       ${whereClause}
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
       LIMIT ${parsedLimit} OFFSET ${parsedOffset}`,
      params
    );

    return rows.map((row) => {
      row.property_photos = this.safeJsonParse(row.property_photos, []);
      row.ai_summary_json = this.safeJsonParse(row.ai_summary_json, null);
      return row;
    });
  }

  /**
   * Get messages for a conversation
   */
  static async getMessages(conversationId, { limit = 50, beforeId = null } = {}) {
    const conditions = ["m.conversation_id = ?"];
    const params = [conversationId];

    if (beforeId) {
      conditions.push("m.id < ?");
      params.push(beforeId);
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

    const [rows] = await db.execute(
      `SELECT m.*,
              u.first_name AS sender_first_name,
              u.last_name AS sender_last_name,
              u.role AS sender_role,
              u.avatar AS sender_avatar
       FROM property_chat_messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY m.id DESC
       LIMIT ${parsedLimit}`,
      params
    );

    const ordered = rows.reverse();
    return ordered.map((row) => {
      row.metadata_json = this.safeJsonParse(row.metadata_json, null);
      return row;
    });
  }

  /**
   * Find message by message_uuid (Idempotency check)
   */
  static async findMessageByUuid(messageUuid) {
    const [rows] = await db.execute(
      `SELECT m.*,
              u.first_name AS sender_first_name,
              u.last_name AS sender_last_name,
              u.role AS sender_role,
              u.avatar AS sender_avatar
       FROM property_chat_messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.message_uuid = ?
       LIMIT 1`,
      [messageUuid]
    );

    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    row.metadata_json = this.safeJsonParse(row.metadata_json, null);
    return row;
  }

  /**
   * Create message with idempotency and update unread / last_message in a transaction
   */
  static async createMessage({
    conversationId,
    senderId,
    senderType = "user",
    messageType = "text",
    messageText,
    metadataJson = null,
    messageUuid = null,
  }) {
    const uuid = messageUuid || uuidv4();

    // Idempotency check: Return existing message if UUID already saved
    const existing = await this.findMessageByUuid(uuid);
    if (existing) {
      return { message: existing, isDuplicate: true };
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [insertResult] = await conn.execute(
        `INSERT INTO property_chat_messages (
           message_uuid, conversation_id, sender_id, sender_type,
           message_type, message_text, metadata_json, is_delivered, is_read, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, NOW())`,
        [
          uuid,
          conversationId,
          senderId,
          senderType,
          messageType,
          messageText.trim(),
          metadataJson ? JSON.stringify(metadataJson) : null,
        ]
      );

      const messageId = insertResult.insertId;

      // Update unread count based on sender type
      let unreadUpdateClause = "";
      if (senderType === "user") {
        unreadUpdateClause = ", unread_executive_count = unread_executive_count + 1";
      } else if (senderType === "executive" || senderType === "admin") {
        unreadUpdateClause = ", unread_user_count = unread_user_count + 1";
      }

      await conn.execute(
        `UPDATE property_conversations
         SET last_message_text = ?,
             last_message_at = NOW(),
             updated_at = NOW()
             ${unreadUpdateClause}
         WHERE id = ?`,
        [messageText.trim(), conversationId]
      );

      await conn.commit();
      conn.release();

      const [msgRows] = await db.execute(
        `SELECT m.*,
                u.first_name AS sender_first_name,
                u.last_name AS sender_last_name,
                u.role AS sender_role,
                u.avatar AS sender_avatar
         FROM property_chat_messages m
         LEFT JOIN users u ON m.sender_id = u.id
         WHERE m.id = ?
         LIMIT 1`,
        [messageId]
      );

      const msg = msgRows[0];
      msg.metadata_json = this.safeJsonParse(msg.metadata_json, null);
      return { message: msg, isDuplicate: false };
    } catch (err) {
      await conn.rollback();
      conn.release();

      if (err.code === "ER_DUP_ENTRY") {
        const raceExisting = await this.findMessageByUuid(uuid);
        if (raceExisting) {
          return { message: raceExisting, isDuplicate: true };
        }
      }
      throw err;
    }
  }

  /**
   * Mark messages in conversation as read and reset corresponding unread count
   */
  static async markMessagesAsRead(conversationId, readerId, readerRole = "user") {
    const lower = String(readerRole || "").toLowerCase();
    const isExecutiveOrAdmin =
      lower.includes("exec") ||
      lower.includes("agent") ||
      lower.includes("manager") ||
      lower.includes("leader") ||
      lower.includes("admin") ||
      lower.includes("sales") ||
      lower.includes("presales") ||
      lower.includes("marketing");

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      let updateMsgQuery = "";
      let resetUnreadQuery = "";

      if (isExecutiveOrAdmin) {
        // Executive reads messages sent by user
        updateMsgQuery = `UPDATE property_chat_messages
                          SET is_read = 1, read_at = NOW()
                          WHERE conversation_id = ? AND sender_type = 'user' AND is_read = 0`;
        resetUnreadQuery = `UPDATE property_conversations
                            SET unread_executive_count = 0, updated_at = NOW()
                            WHERE id = ?`;
      } else {
        // User reads messages sent by executive, admin, or system
        updateMsgQuery = `UPDATE property_chat_messages
                          SET is_read = 1, read_at = NOW()
                          WHERE conversation_id = ? AND sender_type IN ('executive', 'admin', 'system') AND is_read = 0`;
        resetUnreadQuery = `UPDATE property_conversations
                            SET unread_user_count = 0, updated_at = NOW()
                            WHERE id = ?`;
      }

      const [msgResult] = await conn.execute(updateMsgQuery, [conversationId]);
      await conn.execute(resetUnreadQuery, [conversationId]);

      await conn.commit();
      conn.release();

      return { affectedRows: msgResult.affectedRows };
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  }

  /**
   * Reassign executive with a system timeline message
   */
  static async reassignExecutive(conversationId, newExecutiveId, reassignedByUserId, newExecutiveName) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const systemMsgText = `Conversation reassigned to ${newExecutiveName || "Executive"}.`;
      const msgUuid = uuidv4();

      await conn.execute(
        `UPDATE property_conversations
         SET executive_id = ?,
             last_message_text = ?,
             last_message_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [newExecutiveId, systemMsgText, conversationId]
      );

      await conn.execute(
        `INSERT INTO property_chat_messages (
           message_uuid, conversation_id, sender_id, sender_type,
           message_type, message_text, is_delivered, is_read, created_at
         ) VALUES (?, ?, ?, 'system', 'system', ?, 1, 1, NOW())`,
        [msgUuid, conversationId, reassignedByUserId, systemMsgText]
      );

      await conn.commit();
      conn.release();

      return await this.findById(conversationId);
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  }
}

module.exports = ChatModel;
