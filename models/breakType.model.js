const db = require("../config/database");

const DEFAULT_BREAK_TYPES = [
  {
    id: 1,
    break_key: "tea",
    name: "Tea Break",
    icon: "Coffee",
    duration: 15,
    productivity: 0.1,
    daily_limit: 2,
    requires_client: 0,
    requires_location: 0,
    requires_notes: 0,
    is_active: 1,
    display_order: 1,
  },
  {
    id: 2,
    break_key: "lunch",
    name: "Lunch Break",
    icon: "Utensils",
    duration: 60,
    productivity: 0,
    daily_limit: 1,
    requires_client: 0,
    requires_location: 0,
    requires_notes: 0,
    is_active: 1,
    display_order: 2,
  },
  {
    id: 3,
    break_key: "personal",
    name: "Personal Break",
    icon: "User",
    duration: 20,
    productivity: 0,
    daily_limit: 2,
    requires_client: 0,
    requires_location: 0,
    requires_notes: 1,
    is_active: 1,
    display_order: 3,
  },
  {
    id: 4,
    break_key: "documentation",
    name: "Documentation",
    icon: "FileText",
    duration: 20,
    productivity: 0.7,
    daily_limit: 0, // 0 = unlimited
    requires_client: 1,
    requires_location: 0,
    requires_notes: 1,
    is_active: 1,
    display_order: 4,
  },
  {
    id: 5,
    break_key: "market_research",
    name: "Market Research",
    icon: "TrendingUp",
    duration: 30,
    productivity: 0.7,
    daily_limit: 0, // unlimited
    requires_client: 0,
    requires_location: 0,
    requires_notes: 1,
    is_active: 1,
    display_order: 5,
  },
  {
    id: 6,
    break_key: "meeting",
    name: "New Client Meeting",
    icon: "Users",
    duration: 45,
    productivity: 0.8,
    daily_limit: 0, // unlimited
    requires_client: 1,
    requires_location: 0,
    requires_notes: 0,
    is_active: 1,
    display_order: 6,
  },
  {
    id: 7,
    break_key: "site_visit",
    name: "Buyer Site Visit",
    icon: "MapPinned",
    duration: 120,
    productivity: 1.0,
    daily_limit: 0, // unlimited
    requires_client: 1,
    requires_location: 1,
    requires_notes: 0,
    is_active: 1,
    display_order: 7,
  },
  {
    id: 8,
    break_key: "property_visit",
    name: "Seller Property Visit",
    icon: "Building",
    duration: 90,
    productivity: 0.9,
    daily_limit: 0, // unlimited
    requires_client: 1,
    requires_location: 1,
    requires_notes: 0,
    is_active: 1,
    display_order: 8,
  },
];

class BreakTypeModel {
  static async getAll(activeOnly = false) {
    try {
      let query = `SELECT * FROM break_types`;
      if (activeOnly) {
        query += ` WHERE is_active = 1`;
      }
      query += ` ORDER BY display_order ASC, id ASC`;
      const [rows] = await db.query(query);
      if (rows && rows.length > 0) {
        return rows;
      }
      return DEFAULT_BREAK_TYPES.filter((b) => !activeOnly || b.is_active === 1);
    } catch (err) {
      console.warn("break_types table fallback to memory defaults:", err.message);
      return DEFAULT_BREAK_TYPES.filter((b) => !activeOnly || b.is_active === 1);
    }
  }

  static async findByKey(breakKey) {
    try {
      const [rows] = await db.query(`SELECT * FROM break_types WHERE break_key = ? LIMIT 1`, [breakKey]);
      if (rows && rows.length > 0) {
        return rows[0];
      }
    } catch (err) {
      // Fallback
    }
    return DEFAULT_BREAK_TYPES.find((b) => b.break_key === breakKey) || null;
  }

  static async create(typeData) {
    const query = `
      INSERT INTO break_types (
        break_key, name, icon, duration, productivity, daily_limit,
        requires_client, requires_location, requires_notes, is_active, display_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    const breakKey = (typeData.break_key || typeData.name.toLowerCase().replace(/[^a-z0-9_]/g, "_")).slice(0, 50);
    const values = [
      breakKey,
      typeData.name,
      typeData.icon || "Coffee",
      Number(typeData.duration) || 15,
      Number(typeData.productivity) || 0,
      Number(typeData.daily_limit) || 0,
      typeData.requires_client ? 1 : 0,
      typeData.requires_location ? 1 : 0,
      typeData.requires_notes ? 1 : 0,
      typeData.is_active !== undefined ? (typeData.is_active ? 1 : 0) : 1,
      Number(typeData.display_order) || 0,
    ];

    try {
      const [result] = await db.query(query, values);
      return { id: result.insertId, break_key: breakKey, ...typeData };
    } catch (err) {
      console.error("Error creating break_type:", err);
      throw err;
    }
  }

  static async update(id, typeData) {
    const query = `
      UPDATE break_types
      SET name = COALESCE(?, name),
          icon = COALESCE(?, icon),
          duration = COALESCE(?, duration),
          productivity = COALESCE(?, productivity),
          daily_limit = COALESCE(?, daily_limit),
          requires_client = COALESCE(?, requires_client),
          requires_location = COALESCE(?, requires_location),
          requires_notes = COALESCE(?, requires_notes),
          is_active = COALESCE(?, is_active),
          display_order = COALESCE(?, display_order),
          updated_at = NOW()
      WHERE id = ?
    `;
    const values = [
      typeData.name,
      typeData.icon,
      typeData.duration !== undefined ? Number(typeData.duration) : null,
      typeData.productivity !== undefined ? Number(typeData.productivity) : null,
      typeData.daily_limit !== undefined ? Number(typeData.daily_limit) : null,
      typeData.requires_client !== undefined ? (typeData.requires_client ? 1 : 0) : null,
      typeData.requires_location !== undefined ? (typeData.requires_location ? 1 : 0) : null,
      typeData.requires_notes !== undefined ? (typeData.requires_notes ? 1 : 0) : null,
      typeData.is_active !== undefined ? (typeData.is_active ? 1 : 0) : null,
      typeData.display_order !== undefined ? Number(typeData.display_order) : null,
      id,
    ];

    try {
      const [res] = await db.query(query, values);
      return res.affectedRows > 0;
    } catch (err) {
      console.error("Error updating break_type:", err);
      throw err;
    }
  }

  static async delete(id) {
    try {
      const [res] = await db.query(`DELETE FROM break_types WHERE id = ?`, [id]);
      return res.affectedRows > 0;
    } catch (err) {
      console.error("Error deleting break_type:", err);
      throw err;
    }
  }

  // Count how many times an employee has taken each break today
  static async getEmployeeBreakCountsToday(employeeId, dateStr = null) {
    const targetDate = dateStr || new Date().toISOString().split("T")[0];
    const counts = new Map();

    try {
      const query = `
        SELECT break_type, COUNT(*) as count_today
        FROM breaks
        WHERE employee_id = ?
          AND (
            DATE(started_at) = ?
            OR DATE(CONVERT_TZ(started_at, '+00:00', '+05:30')) = ?
            OR started_at LIKE CONCAT(?, '%')
          )
        GROUP BY break_type
      `;
      const [rows] = await db.query(query, [employeeId, targetDate, targetDate, targetDate]);
      for (const r of rows) {
        counts.set(String(r.break_type).toLowerCase(), Number(r.count_today || 0));
      }
    } catch (err) {
      console.warn("Could not query today breaks count:", err.message);
    }
    return counts;
  }
}

module.exports = { BreakTypeModel, DEFAULT_BREAK_TYPES };
