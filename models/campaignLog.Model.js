// models/campaignLog.Model.js - Update the findByCampaignId method

const db = require("../config/database");

const CampaignLog = {
  // Get logs by campaign ID - Fixed version without missing columns
  findByCampaignId: async (campaignId) => {
    try {
      const [rows] = await db.query(
        `
        SELECT 
          cl.id,
          cl.campaign_id,
          cl.contact_id,
          cl.status,
          cl.error_message,
          cl.whatsapp_msg_id,
          cl.sent_at,
          cl.delivered_at,
          cl.read_at,
          cl.created_at,
          cl.updated_at,
          c.id as contact_db_id,
          c.name as contact_name,
          c.phone as contact_phone,
          c.stage as contact_stage
        FROM campaign_logs cl
        LEFT JOIN contacts_wa c ON cl.contact_id = c.id
        WHERE cl.campaign_id = ?
        ORDER BY cl.created_at DESC
        `,
        [campaignId]
      );

      return rows.map((row) => ({
        id: row.id,
        campaign_id: row.campaign_id,
        contact_id: row.contact_id,
        status: row.status,
        error_message: row.error_message,
        whatsapp_msg_id: row.whatsapp_msg_id,
        sent_at: row.sent_at,
        delivered_at: row.delivered_at,
        read_at: row.read_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        contact: row.contact_db_id
          ? {
              id: row.contact_db_id,
              name: row.contact_name || "Unknown",
              phone: row.contact_phone || "Unknown",
              stage: row.contact_stage || "New",
            }
          : null,
      }));
    } catch (error) {
      console.error("Error in findByCampaignId:", error);
      throw error;
    }
  },

  // Add this missing method
  findByContactAndCampaign: async (campaignId, contactId) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM campaign_logs WHERE campaign_id = ? AND contact_id = ? ORDER BY id DESC LIMIT 1`,
        [campaignId, contactId]
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error in findByContactAndCampaign:", error);
      throw error;
    }
  },

  // Get log by message ID (for webhook updates)
  findByMessageId: async (messageId) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM campaign_logs WHERE whatsapp_msg_id = ?`,
        [messageId]
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error in findByMessageId:", error);
      throw error;
    }
  },

  // Create log entry
  create: async (
    campaignId,
    contactId,
    status = "pending",
    errorMessage = null,
    whatsappMsgId = null
  ) => {
    try {
      const [result] = await db.query(
        `INSERT INTO campaign_logs (campaign_id, contact_id, status, error_message, whatsapp_msg_id, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [campaignId, contactId, status, errorMessage, whatsappMsgId]
      );
      return result.insertId;
    } catch (error) {
      console.error("Error in create:", error);
      throw error;
    }
  },

  // Update log status
  updateStatus: async (id, status, metadata = {}) => {
    try {
      const fields = ["status = ?", "updated_at = NOW()"];
      const values = [status];

      if (status === "sent") {
        fields.push("sent_at = NOW()");
      } else if (status === "delivered") {
        fields.push("delivered_at = NOW()");
      } else if (status === "read") {
        fields.push("read_at = NOW()");
      }

      if (metadata.error_message) {
        fields.push("error_message = ?");
        values.push(metadata.error_message);
      }

      if (metadata.whatsapp_msg_id) {
        fields.push("whatsapp_msg_id = ?");
        values.push(metadata.whatsapp_msg_id);
      }

      values.push(id);
      await db.query(
        `UPDATE campaign_logs SET ${fields.join(", ")} WHERE id = ?`,
        values
      );
    } catch (error) {
      console.error("Error in updateStatus:", error);
      throw error;
    }
  },

  // Update status by message ID (for webhook)
  updateStatusByMsgId: async (whatsappMsgId, status, metadata = {}) => {
    try {
      const fields = ["status = ?", "updated_at = NOW()"];
      const values = [status];

      if (status === "sent") {
        fields.push("sent_at = NOW()");
      } else if (status === "delivered") {
        fields.push("delivered_at = NOW()");
      } else if (status === "read") {
        fields.push("read_at = NOW()");
      }

      if (metadata.error_message) {
        fields.push("error_message = ?");
        values.push(metadata.error_message);
      }

      values.push(whatsappMsgId);
      await db.query(
        `UPDATE campaign_logs SET ${fields.join(", ")} WHERE whatsapp_msg_id = ?`,
        values
      );
    } catch (error) {
      console.error("Error in updateStatusByMsgId:", error);
      throw error;
    }
  },

  // Bulk create logs
  bulkCreate: async (campaignId, contactIds) => {
    try {
      if (!contactIds || !contactIds.length) return;

      for (const contactId of contactIds) {
        await CampaignLog.create(campaignId, contactId, "pending");
      }
    } catch (error) {
      console.error("Error in bulkCreate:", error);
      throw error;
    }
  },

  // Get campaign stats summary
  getStats: async (campaignId) => {
    try {
      const [rows] = await db.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM campaign_logs 
        WHERE campaign_id = ?`,
        [campaignId]
      );
      return rows[0] || { total: 0, sent: 0, delivered: 0, read_count: 0, failed: 0 };
    } catch (error) {
      console.error("Error in getStats:", error);
      throw error;
    }
  },

  // Resend failed message
  resendMessage: async (logId, campaignId) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM campaign_logs WHERE id = ? AND campaign_id = ?`,
        [logId, campaignId]
      );

      if (rows.length === 0) {
        throw new Error("Log entry not found");
      }

      const log = rows[0];

      await db.query(
        `UPDATE campaign_logs SET status = 'pending', error_message = NULL, updated_at = NOW() WHERE id = ?`,
        [logId]
      );

      return log;
    } catch (error) {
      console.error("Error in resendMessage:", error);
      throw error;
    }
  },

  // Resend all failed messages for a campaign
  resendAllFailed: async (campaignId) => {
    try {
      const [result] = await db.query(
        `UPDATE campaign_logs 
         SET status = 'pending', error_message = NULL, updated_at = NOW() 
         WHERE campaign_id = ? AND status = 'failed'`,
        [campaignId]
      );
      return result.affectedRows;
    } catch (error) {
      console.error("Error in resendAllFailed:", error);
      throw error;
    }
  },
};

module.exports = CampaignLog;