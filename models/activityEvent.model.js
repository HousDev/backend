const db = require("../config/database");

class ActivityEvent {
  static async create(eventData) {
    const query = `
      INSERT INTO activity_events (
        session_id, employee_id, event_type, timestamp, metadata
      ) VALUES (?, ?, ?, ?, ?)
    `;
    const values = [
      eventData.session_id,
      eventData.employee_id,
      eventData.event_type,
      eventData.timestamp || new Date(),
      JSON.stringify(eventData.metadata || {}),
    ];

    try {
      const [result] = await db.query(query, values);
      return { id: result.insertId, ...eventData };
    } catch (err) {
      console.error("Error creating activity event:", err);
      throw err;
    }
  }

  static async findBySessionId(sessionId, limit = 50) {
    const query = `
      SELECT * FROM activity_events 
      WHERE session_id = ? 
      ORDER BY id DESC LIMIT ?
    `;
    try {
      const [rows] = await db.query(query, [sessionId, limit]);
      return rows.map((row) => ({
        ...row,
        metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
      }));
    } catch (err) {
      console.error("Error finding activity events:", err);
      throw err;
    }
  }
}

module.exports = ActivityEvent;
