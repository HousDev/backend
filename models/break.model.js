const db = require("../config/database");

class BreakModel {
  static async create(breakData) {
    const query = `
      INSERT INTO breaks (
        break_id, session_id, employee_id, break_type, started_at,
        allocated_duration, actual_duration, status, details, created_at
      ) VALUES (?, ?, ?, ?, NOW(), ?, 0, 'ACTIVE', ?, NOW())
    `;
    const values = [
      breakData.break_id,
      breakData.session_id,
      breakData.employee_id,
      breakData.break_type,
      breakData.allocated_duration || 0,
      breakData.details || "",
    ];

    try {
      const [result] = await db.query(query, values);
      return { id: result.insertId, ...breakData };
    } catch (err) {
      console.error("Error creating break model:", err);
      throw err;
    }
  }

  static async findActiveBySession(sessionId) {
    const query = `
      SELECT * FROM breaks 
      WHERE session_id = ? AND status = 'ACTIVE' 
      ORDER BY id DESC LIMIT 1
    `;
    try {
      const [rows] = await db.query(query, [sessionId]);
      return rows.length ? rows[0] : null;
    } catch (err) {
      console.error("Error finding active break:", err);
      throw err;
    }
  }

  static async endBreak(breakId, actualDurationSeconds, status = "COMPLETED", efficiency = "100%") {
    const query = `
      UPDATE breaks 
      SET ended_at = NOW(),
          actual_duration = ?,
          status = ?,
          efficiency = ?
      WHERE break_id = ?
    `;
    try {
      const [res] = await db.query(query, [actualDurationSeconds, status, efficiency, breakId]);
      return res.affectedRows > 0;
    } catch (err) {
      console.error("Error ending break:", err);
      throw err;
    }
  }

  static async findHistoryBySession(sessionId) {
    const query = `
      SELECT * FROM breaks 
      WHERE session_id = ? 
      ORDER BY id ASC
    `;
    try {
      const [rows] = await db.query(query, [sessionId]);
      return rows;
    } catch (err) {
      console.error("Error finding break history:", err);
      throw err;
    }
  }

  static async findHistoryByEmployee(employeeId, fromDate, toDate) {
    const query = `
      SELECT * FROM breaks
      WHERE employee_id = ?
        AND DATE(started_at) >= ?
        AND DATE(started_at) <= ?
      ORDER BY started_at DESC, id DESC
    `;
    try {
      const [rows] = await db.query(query, [employeeId, fromDate, toDate]);
      return rows;
    } catch (err) {
      console.error("Error finding employee break history:", err);
      throw err;
    }
  }
}

module.exports = BreakModel;
