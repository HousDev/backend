// models/OtpSendLog.js
const db = require("../config/database"); // mysql2/promise pool

class OtpSendLog {
  /**
   * @param {Object} row
   * @param {string} row.mobile
   * @param {object|null} row.payload
   * @param {number|null} row.response_status
   * @param {object|null} row.response_json
   * @param {string|null} row.error_message
   */
  static async create({
    mobile,
    payload = null,
    response_status = null,
    response_json = null,
    error_message = null,
  }) {
    const sql = `
      INSERT INTO otp_send_logs
      (mobile, payload_json, response_status, response_json, error_message)
      VALUES (?, ?, ?, ?, ?)
    `;
    const params = [
      mobile,
      payload ? JSON.stringify(payload) : null,
      response_status,
      response_json ? JSON.stringify(response_json) : null,
      error_message,
    ];
    const [result] = await db.execute(sql, params);
    return result.insertId;
  }
}

module.exports = OtpSendLog;
