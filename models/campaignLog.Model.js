const db = require("../config/database");

const CampaignLog = {
  // Get logs by campaign ID
  findByCampaignId: async (campaignId) => {
    const [rows] = await db.query(
      `
            SELECT cl.*, 
                   JSON_OBJECT('id', c.id, 'name', c.name, 'phone', c.phone) as contact
            FROM campaign_logs cl
            LEFT JOIN contacts_wa c ON cl.contact_id = c.id
            WHERE cl.campaign_id = ?
            ORDER BY cl.created_at DESC
        `,
      [campaignId],
    );
    return rows.map((row) => ({
      ...row,
      contact: row.contact ? JSON.parse(row.contact) : null,
    }));
  },

  // Create log entry
  create: async (
    campaignId,
    contactId,
    status = "pending",
    errorMessage = null,
  ) => {
    const [result] = await db.query(
      `INSERT INTO campaign_logs (campaign_id, contact_id, status, error_message) 
             VALUES (?, ?, ?, ?)`,
      [campaignId, contactId, status, errorMessage],
    );
    return result.insertId;
  },

  // Update log status
  updateStatus: async (id, status, metadata = {}) => {
    const fields = ["status = ?"];
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

    values.push(id);
    await db.query(
      `UPDATE campaign_logs SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
  },

  // Bulk create logs
  bulkCreate: async (campaignId, contactIds) => {
    if (!contactIds.length) return;
    const values = contactIds
      .map((id) => `(${campaignId}, ${id}, 'pending')`)
      .join(",");
    await db.query(
      `INSERT INTO campaign_logs (campaign_id, contact_id, status) VALUES ${values}`,
      [],
    );
  },
};

module.exports = CampaignLog;
