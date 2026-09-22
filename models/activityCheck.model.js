const db = require("../config/database");

class ActivityCheck {
  static async create(checkData) {
    const query = `
      INSERT INTO activity_checks (
        session_id, employee_id, started_at, question, expected_answer, result, attempts, created_at
      ) VALUES (?, ?, NOW(), ?, ?, 'PENDING', 0, NOW())
    `;
    const values = [
      checkData.session_id,
      checkData.employee_id,
      checkData.question,
      String(checkData.expected_answer),
    ];

    try {
      const [result] = await db.query(query, values);
      return { id: result.insertId, ...checkData, result: "PENDING" };
    } catch (err) {
      console.error("Error creating activity check:", err);
      throw err;
    }
  }

  static async findById(id) {
    const query = `SELECT * FROM activity_checks WHERE id = ? LIMIT 1`;
    try {
      const [rows] = await db.query(query, [id]);
      return rows.length ? rows[0] : null;
    } catch (err) {
      console.error("Error finding activity check by id:", err);
      throw err;
    }
  }

  static async findLatestPending(sessionId) {
    const query = `
      SELECT * FROM activity_checks 
      WHERE session_id = ? AND result = 'PENDING' 
      ORDER BY id DESC LIMIT 1
    `;
    try {
      const [rows] = await db.query(query, [sessionId]);
      return rows.length ? rows[0] : null;
    } catch (err) {
      console.error("Error finding pending activity check:", err);
      throw err;
    }
  }

  static async updateResult(id, result, attempts, responseTime) {
    const query = `
      UPDATE activity_checks 
      SET result = ?,
          attempts = ?,
          response_time = ?,
          completed_at = NOW()
      WHERE id = ?
    `;
    try {
      const [res] = await db.query(query, [result, attempts, responseTime, id]);
      return res.affectedRows > 0;
    } catch (err) {
      console.error("Error updating activity check result:", err);
      throw err;
    }
  }
}

module.exports = ActivityCheck;
