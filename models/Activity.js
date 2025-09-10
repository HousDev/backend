const db = require("../config/database");

function safeParseJSON(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

class Activity {
  constructor(activity) {
    this.type = activity.type;
    this.description = activity.description;
    this.lead_id = activity.lead_id;
    this.property_id = activity.property_id;
    this.user_id = activity.user_id;
    this.scheduled_date = activity.scheduled_date;
    this.completed_date = activity.completed_date;
    this.status = activity.status || "pending";
    this.notes = activity.notes;
    this.metadata = activity.metadata || {};
  }

  static async create(newActivity) {
    const query = `
      INSERT INTO activities (
        type, description, lead_id, property_id, user_id, 
        scheduled_date, completed_date, status, notes, metadata, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const values = [
      newActivity.type,
      newActivity.description,
      newActivity.lead_id,
      newActivity.property_id,
      newActivity.user_id,
      newActivity.scheduled_date,
      newActivity.completed_date,
      newActivity.status,
      newActivity.notes,
      JSON.stringify(newActivity.metadata || {}),
    ];

    try {
      const [result] = await db.query(query, values);
      return { id: result.insertId, ...newActivity };
    } catch (err) {
      console.error("Error creating activity:", err);
      throw err;
    }
  }

  static async findById(activityId) {
    const query = `
      SELECT a.*, 
             CONCAT(u.first_name, ' ', u.last_name) as user_name,
             CONCAT(l.first_name, ' ', l.last_name) as lead_name,
             p.title as property_title
      FROM activities a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN leads l ON a.lead_id = l.id
      LEFT JOIN properties p ON a.property_id = p.id
      WHERE a.id = ?
    `;

    try {
      const [rows] = await db.query(query, [activityId]);
      if (!rows.length) return null;
      const activity = rows[0];
      activity.metadata = safeParseJSON(activity.metadata);
      return activity;
    } catch (err) {
      console.error("Error finding activity:", err);
      throw err;
    }
  }

  static async getAll(filters = {}) {
    let query = `
      SELECT a.*, 
             CONCAT(u.first_name, ' ', u.last_name) as user_name,
             CONCAT(l.first_name, ' ', l.last_name) as lead_name,
             p.title as property_title
      FROM activities a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN leads l ON a.lead_id = l.id
      LEFT JOIN properties p ON a.property_id = p.id
      WHERE 1=1
    `;

    const params = [];

    if (filters.type) {
      query += " AND a.type = ?";
      params.push(filters.type);
    }
    if (filters.status) {
      query += " AND a.status = ?";
      params.push(filters.status);
    }
    if (filters.user_id) {
      query += " AND a.user_id = ?";
      params.push(filters.user_id);
    }
    if (filters.lead_id) {
      query += " AND a.lead_id = ?";
      params.push(filters.lead_id);
    }
    if (filters.property_id) {
      query += " AND a.property_id = ?";
      params.push(filters.property_id);
    }
    if (filters.date_from) {
      query += " AND DATE(a.scheduled_date) >= ?";
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      query += " AND DATE(a.scheduled_date) <= ?";
      params.push(filters.date_to);
    }

    query += " ORDER BY a.scheduled_date DESC, a.created_at DESC";

    if (filters.limit) {
      query += " LIMIT ?";
      params.push(parseInt(filters.limit));
    }

    try {
      const [rows] = await db.query(query, params);
      return rows.map((row) => {
        row.metadata = safeParseJSON(row.metadata);
        return row;
      });
    } catch (err) {
      console.error("Error fetching activities:", err);
      throw err;
    }
  }

  static async updateById(id, activity) {
    const allowedFields = [
      "type",
      "description",
      "lead_id",
      "property_id",
      "user_id",
      "scheduled_date",
      "completed_date",
      "status",
      "notes",
      "metadata",
    ];

    const fields = [];
    const values = [];

    for (const field of allowedFields) {
      if (field in activity) {
        fields.push(`${field} = ?`);
        values.push(
          field === "metadata"
            ? JSON.stringify(activity[field])
            : activity[field]
        );
      }
    }

    if (!fields.length) {
      throw new Error("No fields to update");
    }

    const query = `
      UPDATE activities SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = ?
    `;

    values.push(id);

    try {
      const [result] = await db.query(query, values);
      if (result.affectedRows === 0) return { kind: "not_found" };
      return { id, ...activity };
    } catch (err) {
      console.error("Error updating activity:", err);
      throw err;
    }
  }

  static async remove(id) {
    try {
      const [result] = await db.query("DELETE FROM activities WHERE id = ?", [
        id,
      ]);
      if (result.affectedRows === 0) return { kind: "not_found" };
      return result;
    } catch (err) {
      console.error("Error deleting activity:", err);
      throw err;
    }
  }

  static async getUpcomingActivities(userId, days = 7) {
    let query = `
      SELECT a.*, 
             CONCAT(u.first_name, ' ', u.last_name) as user_name,
             CONCAT(l.first_name, ' ', l.last_name) as lead_name,
             p.title as property_title
      FROM activities a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN leads l ON a.lead_id = l.id
      LEFT JOIN properties p ON a.property_id = p.id
      WHERE a.status = 'pending'
        AND a.scheduled_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)
    `;

    const params = [days];

    if (userId) {
      query += " AND a.user_id = ?";
      params.push(userId);
    }

    query += " ORDER BY a.scheduled_date ASC";

    try {
      const [rows] = await db.query(query, params);
      return rows.map((row) => {
        row.metadata = safeParseJSON(row.metadata);
        return row;
      });
    } catch (err) {
      console.error("Error fetching upcoming activities:", err);
      throw err;
    }
  }

  static async getActivitiesStats(userId = null) {
    let query = `
      SELECT 
        COUNT(*) as total_activities,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_activities,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_activities,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_activities,
        COUNT(CASE WHEN DATE(scheduled_date) = CURDATE() AND status = 'pending' THEN 1 END) as today_activities,
        COUNT(CASE WHEN DATE(scheduled_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) AND status = 'pending' THEN 1 END) as upcoming_week_activities
      FROM activities
    `;

    const params = [];
    if (userId) {
      query += " WHERE user_id = ?";
      params.push(userId);
    }

    try {
      const [rows] = await db.query(query, params);
      return rows[0];
    } catch (err) {
      console.error("Error fetching activities stats:", err);
      throw err;
    }
  }
}

module.exports = Activity;
