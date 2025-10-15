// models/EmailIntegration.js
const db = require("../config/database");

class EmailIntegration {
  // ✅ Find email config by user
  static async findEmailConfigByUser(userId) {
    const [rows] = await db.query(
      "SELECT * FROM email_integrations WHERE created_by=? LIMIT 1",
      [userId]
    );
    return rows[0];
  }

  // ✅ Insert / Update email config
  static async saveOrUpdateEmailConfig(
    userId,
    provider,
    driver,
    host,
    port,
    security,
    username,
    password,
    fromAddress,
    fromName
  ) {
    const [rows] = await db.query(
      "SELECT id FROM email_integrations WHERE created_by=? LIMIT 1",
      [userId]
    );

    if (rows.length > 0) {
      // update existing
      await db.query(
        `UPDATE email_integrations 
         SET provider=?, driver=?, host=?, port=?, security=?, username=?, password=?, 
             from_address=?, from_name=?, updated_at=NOW()
         WHERE created_by=?`,
        [
          provider,
          driver,
          host,
          port,
          security,
          username,
          password,
          fromAddress,
          fromName,
          userId,
        ]
      );
    } else {
      // insert new
      await db.query(
        `INSERT INTO email_integrations 
         (provider, driver, host, port, security, username, password, from_address, from_name, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          provider,
          driver,
          host,
          port,
          security,
          username,
          password,
          fromAddress,
          fromName,
          userId,
        ]
      );
    }
  }

  // ✅ Update last sync (optional)
  static async updateLastSync(userId) {
    await db.query(
      "UPDATE email_integrations SET updated_at=NOW() WHERE created_by=?",
      [userId]
    );
  }

  // ✅ Toggle Active/Inactive
  static async toggleActiveStatus(userId, active) {
    await db.query(
      "UPDATE email_integrations SET is_active=? WHERE created_by=?",
      [active ? 1 : 0, userId]
    );
  }
}

module.exports = EmailIntegration;
