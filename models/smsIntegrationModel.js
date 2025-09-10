const db = require("../config/database");

class SMSIntegration {
  // ✅ Find config by user
  static async findSMSConfigByUser(userId) {
    const [rows] = await db.query(
      "SELECT * FROM sms_integrations WHERE created_by=? LIMIT 1",
      [userId]
    );
    return rows[0];
  }

  // ✅ Insert / Update config
  static async saveOrUpdateSMSConfig(
    userId,
    provider,
    apiKey,
    token,
    smsNumber,
    smsFrom
  ) {
    const [rows] = await db.query(
      "SELECT id FROM sms_integrations WHERE created_by=? LIMIT 1",
      [userId]
    );

    if (rows.length > 0) {
      await db.query(
        `UPDATE sms_integrations 
         SET provider=?, api_key=?, token=?, sms_number=?, sms_from=?, updated_at=NOW() 
         WHERE created_by=?`,
        [provider, apiKey, token, smsNumber, smsFrom, userId]
      );
    } else {
      await db.query(
        `INSERT INTO sms_integrations 
         (provider, api_key, token, sms_number, sms_from, created_by) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [provider, apiKey, token, smsNumber, smsFrom, userId]
      );
    }
  }

  // ✅ Update last sync
  static async updateLastSync(userId) {
    await db.query(
      "UPDATE sms_integrations SET updated_at=NOW() WHERE created_by=?",
      [userId]
    );
  }

  // ✅ Toggle Active/Inactive
  static async toggleActiveStatus(userId, active) {
    await db.query(
      "UPDATE sms_integrations SET is_active=? WHERE created_by=?",
      [active ? 1 : 0, userId]
    );
  }
}

module.exports = SMSIntegration;
