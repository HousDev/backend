// models/RazorpayIntegrationModal.js
const db = require("../config/database");

class RazorpayIntegrationModal {
  // ✅ Find config by user
  static async findConfigByUser(userId) {
    const [rows] = await db.query(
      "SELECT * FROM razorpay_integrations WHERE created_by=? LIMIT 1",
      [userId]
    );
    return rows[0];
  }

  // ✅ Insert / Update config with webhook_secret
static async saveOrUpdateConfig(userId, keyId, keySecret, webhookSecret = null, webhookUrl = null) {
  const [rows] = await db.query(
    "SELECT id FROM razorpay_integrations WHERE created_by=? LIMIT 1",
    [userId]
  );

  if (rows.length > 0) {
    await db.query(
      `UPDATE razorpay_integrations 
       SET key_id=?, key_secret=?, webhook_secret=?, webhook_url=?, updated_at=NOW() 
       WHERE created_by=?`,
      [keyId, keySecret, webhookSecret, webhookUrl, userId]
    );
  } else {
    await db.query(
      `INSERT INTO razorpay_integrations 
       (key_id, key_secret, webhook_secret, webhook_url, created_by) 
       VALUES (?, ?, ?, ?, ?)`,
      [keyId, keySecret, webhookSecret, webhookUrl, userId]
    );
  }
}


  // ✅ Toggle Active/Inactive
  static async toggleActiveStatus(userId, active) {
    await db.query(
      "UPDATE razorpay_integrations SET is_active=? WHERE created_by=?",
      [active ? 1 : 0, userId]
    );
  }




}

module.exports = RazorpayIntegrationModal;
