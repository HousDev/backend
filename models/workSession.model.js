const db = require("../config/database");

class WorkSession {
  static async create(sessionData) {
    const query = `
      INSERT INTO work_sessions (
        session_id, employee_id, started_at, status, current_state,
        active_duration, idle_duration, break_duration, last_activity_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, NOW(), NOW())
    `;
    const values = [
      sessionData.session_id,
      sessionData.employee_id,
      sessionData.started_at || new Date(),
      sessionData.status || "RUNNING",
      sessionData.current_state || "ACTIVE",
      sessionData.last_activity_at || new Date(),
    ];

    try {
      const [result] = await db.query(query, values);
      return { id: result.insertId, ...sessionData };
    } catch (err) {
      console.error("Error creating work session:", err);
      throw err;
    }
  }

  static async findBySessionId(sessionId) {
    const query = `SELECT * FROM work_sessions WHERE session_id = ? LIMIT 1`;
    try {
      const [rows] = await db.query(query, [sessionId]);
      return rows.length ? rows[0] : null;
    } catch (err) {
      console.error("Error finding work session by sessionId:", err);
      throw err;
    }
  }

  static async findActiveByEmployeeId(employeeId) {
    const query = `
      SELECT * FROM work_sessions 
      WHERE employee_id = ? AND status != 'COMPLETED' 
      ORDER BY id DESC LIMIT 1
    `;
    try {
      const [rows] = await db.query(query, [employeeId]);
      if (rows.length) {
        const session = rows[0];
        const startedAt = new Date(session.started_at);
        const today = new Date();
        
        if (
          startedAt.getDate() !== today.getDate() ||
          startedAt.getMonth() !== today.getMonth() ||
          startedAt.getFullYear() !== today.getFullYear()
        ) {
          console.log(`[WorkSession] Auto-closing old session ${session.session_id} from previous day`);
          await this.endSession(session.session_id, {
            active_duration: session.active_duration,
            idle_duration: session.idle_duration,
            break_duration: session.break_duration,
          });
          return null;
        }
        return session;
      }
      return null;
    } catch (err) {
      console.error("Error finding active work session by employeeId:", err);
      throw err;
    }
  }

  static async updateState(sessionId, currentState, status = null) {
    let query = `UPDATE work_sessions SET current_state = ?, updated_at = NOW()`;
    const values = [currentState];

    if (status) {
      query += `, status = ?`;
      values.push(status);
    }

    query += ` WHERE session_id = ?`;
    values.push(sessionId);

    try {
      const [result] = await db.query(query, values);
      return result.affectedRows > 0;
    } catch (err) {
      console.error("Error updating work session state:", err);
      throw err;
    }
  }

  static async updateHeartbeat(sessionId, idleSeconds, currentState, durations = {}) {
    let query = `
      UPDATE work_sessions 
      SET last_activity_at = CASE WHEN ? = 0 THEN NOW() ELSE last_activity_at END,
          current_state = ?,
          updated_at = NOW()
    `;
    const params = [idleSeconds, currentState];

    if (durations.activeDuration !== undefined && durations.activeDuration !== null) {
      query += `, active_duration = ?`;
      params.push(Number(durations.activeDuration));
    }
    if (durations.idleDuration !== undefined && durations.idleDuration !== null) {
      query += `, idle_duration = ?`;
      params.push(Number(durations.idleDuration));
    }
    if (durations.breakDuration !== undefined && durations.breakDuration !== null) {
      query += `, break_duration = ?`;
      params.push(Number(durations.breakDuration));
    }

    query += ` WHERE session_id = ?`;
    params.push(sessionId);

    try {
      const [result] = await db.query(query, params);
      return result.affectedRows > 0;
    } catch (err) {
      console.error("Error updating work session heartbeat:", err);
      throw err;
    }
  }

  static async updateDurations(sessionId, activeSeconds, idleSeconds, breakSeconds) {
    const query = `
      UPDATE work_sessions 
      SET active_duration = active_duration + ?,
          idle_duration = idle_duration + ?,
          break_duration = break_duration + ?,
          updated_at = NOW()
      WHERE session_id = ?
    `;
    try {
      const [result] = await db.query(query, [activeSeconds, idleSeconds, breakSeconds, sessionId]);
      return result.affectedRows > 0;
    } catch (err) {
      console.error("Error updating work session durations:", err);
      throw err;
    }
  }

  static async endSession(sessionId, finalDurations) {
    const query = `
      UPDATE work_sessions 
      SET ended_at = NOW(),
          status = 'COMPLETED',
          current_state = 'COMPLETED',
          active_duration = COALESCE(?, active_duration),
          idle_duration = COALESCE(?, idle_duration),
          break_duration = COALESCE(?, break_duration),
          updated_at = NOW()
      WHERE session_id = ?
    `;
    const values = [
      finalDurations.active_duration,
      finalDurations.idle_duration,
      finalDurations.break_duration,
      sessionId,
    ];
    try {
      const [result] = await db.query(query, values);
      return result.affectedRows > 0;
    } catch (err) {
      console.error("Error ending work session:", err);
      throw err;
    }
  }
}

module.exports = WorkSession;
