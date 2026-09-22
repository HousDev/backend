const db = require("../config/database");

class SessionHeartbeat {
  static async create(hbData) {
    const query = `
      INSERT INTO session_heartbeats (
        session_id, employee_id, state, idle_seconds, created_at
      ) VALUES (?, ?, ?, ?, NOW())
    `;
    const values = [
      hbData.session_id,
      hbData.employee_id,
      hbData.state || "ACTIVE",
      hbData.idle_seconds || 0,
    ];

    try {
      const [result] = await db.query(query, values);
      return { id: result.insertId, ...hbData };
    } catch (err) {
      console.error("Error creating session heartbeat:", err);
      throw err;
    }
  }
}

module.exports = SessionHeartbeat;
