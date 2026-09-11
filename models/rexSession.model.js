// backend/models/rexSession.model.js
const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");

// In-memory fallback map if table is pending DDL execution
const memorySessionStore = new Map();

class RexSessionModel {
  static safeJsonParse(str, defaultValue = null) {
    if (!str) return defaultValue;
    if (typeof str === "object") return str;
    try {
      return JSON.parse(str);
    } catch {
      return defaultValue;
    }
  }

  /**
   * Find or create REX agent session
   */
  static async findOrCreateSession({ sessionUuid = null, userId = null, guestUuid = null }) {
    const finalSessionUuid = sessionUuid || uuidv4();

    try {
      const [rows] = await db.execute(
        `SELECT * FROM rex_agent_sessions WHERE session_uuid = ? LIMIT 1`,
        [finalSessionUuid]
      );

      if (rows && rows.length > 0) {
        const session = rows[0];
        session.extracted_profile = this.safeJsonParse(session.extracted_profile, {});
        session.extracted_requirements = this.safeJsonParse(session.extracted_requirements, { locations: [] });
        session.message_history = this.safeJsonParse(session.message_history, []);

        // Link userId if user subsequently logged in
        if (userId && !session.user_id) {
          await db.execute(
            `UPDATE rex_agent_sessions SET user_id = ?, updated_at = NOW() WHERE id = ?`,
            [userId, session.id]
          ).catch(() => {});
          session.user_id = userId;
        }

        return session;
      }

      // Check if existing session for guest_uuid or user_id exists recently (last 24h)
      if (userId || guestUuid) {
        const whereClause = userId ? "user_id = ?" : "guest_uuid = ?";
        const param = userId || guestUuid;

        const [recentRows] = await db.execute(
          `SELECT * FROM rex_agent_sessions WHERE ${whereClause} ORDER BY updated_at DESC LIMIT 1`,
          [param]
        );

        if (recentRows && recentRows.length > 0) {
          const session = recentRows[0];
          session.extracted_profile = this.safeJsonParse(session.extracted_profile, {});
          session.extracted_requirements = this.safeJsonParse(session.extracted_requirements, { locations: [] });
          session.message_history = this.safeJsonParse(session.message_history, []);
          return session;
        }
      }

      // Create new session row
      const initialHistory = [];
      const [insertResult] = await db.execute(
        `INSERT INTO rex_agent_sessions (
           session_uuid, user_id, guest_uuid, current_intent,
           extracted_profile, extracted_requirements, message_history,
           is_qualified, created_at, updated_at
         ) VALUES (?, ?, ?, 'general', '{}', '{"locations":[]}', '[]', 0, NOW(), NOW())`,
        [finalSessionUuid, userId || null, guestUuid || null]
      );

      return {
        id: insertResult.insertId,
        session_uuid: finalSessionUuid,
        user_id: userId || null,
        guest_uuid: guestUuid || null,
        current_intent: "general",
        extracted_profile: {},
        extracted_requirements: { locations: [] },
        message_history: initialHistory,
        is_qualified: 0,
        lead_id: null,
      };
    } catch (err) {
      // Graceful in-memory fallback
      if (err.code === "ER_NO_SUCH_TABLE") {
        if (!memorySessionStore.has(finalSessionUuid)) {
          memorySessionStore.set(finalSessionUuid, {
            id: Date.now(),
            session_uuid: finalSessionUuid,
            user_id: userId || null,
            guest_uuid: guestUuid || null,
            current_intent: "general",
            extracted_profile: {},
            extracted_requirements: { locations: [] },
            message_history: [],
            is_qualified: 0,
            lead_id: null,
          });
        }
        return memorySessionStore.get(finalSessionUuid);
      }
      throw err;
    }
  }

  /**
   * Update session state, profile, requirements, and append messages
   */
  static async updateSession(sessionUuid, {
    currentIntent = "general",
    extractedProfile = null,
    extractedRequirements = null,
    messageHistory = null,
    isQualified = false,
    leadId = null,
  }) {
    try {
      const updates = [
        "current_intent = ?",
        "is_qualified = ?",
        "lead_id = COALESCE(?, lead_id)",
        "updated_at = NOW()",
      ];
      const params = [currentIntent, isQualified ? 1 : 0, leadId || null];

      if (extractedProfile !== null) {
        updates.push("extracted_profile = ?");
        params.push(JSON.stringify(extractedProfile || {}));
      }

      if (extractedRequirements !== null) {
        updates.push("extracted_requirements = ?");
        params.push(JSON.stringify(extractedRequirements || {}));
      }

      if (messageHistory !== null) {
        updates.push("message_history = ?");
        params.push(JSON.stringify(messageHistory || []));
      }

      params.push(sessionUuid);

      await db.execute(
        `UPDATE rex_agent_sessions
         SET ${updates.join(", ")}
         WHERE session_uuid = ?`,
        params
      );
    } catch (err) {
      if (err.code === "ER_NO_SUCH_TABLE") {
        const mem = memorySessionStore.get(sessionUuid) || {};
        mem.current_intent = currentIntent;
        if (extractedProfile !== null) mem.extracted_profile = extractedProfile;
        if (extractedRequirements !== null) mem.extracted_requirements = extractedRequirements;
        if (messageHistory !== null) mem.message_history = messageHistory;
        mem.is_qualified = isQualified ? 1 : 0;
        if (leadId) mem.lead_id = leadId;
        memorySessionStore.set(sessionUuid, mem);
        return;
      }
      throw err;
    }
  }

  /**
   * Get session by UUID
   */
  static async getSession(sessionUuid) {
    try {
      const [rows] = await db.execute(
        `SELECT * FROM rex_agent_sessions WHERE session_uuid = ? LIMIT 1`,
        [sessionUuid]
      );

      if (!rows || rows.length === 0) return null;
      const session = rows[0];
      session.extracted_profile = this.safeJsonParse(session.extracted_profile, {});
      session.extracted_requirements = this.safeJsonParse(session.extracted_requirements, { locations: [] });
      session.message_history = this.safeJsonParse(session.message_history, []);
      return session;
    } catch (err) {
      if (err.code === "ER_NO_SUCH_TABLE") {
        return memorySessionStore.get(sessionUuid) || null;
      }
      throw err;
    }
  }

  /**
   * List paginated sessions for Admin & Executives with metrics and filters
   */
  static async listSessions({ search = "", role = "", isQualified = null, dateRange = "all", location = "", limit = 25, offset = 0 } = {}) {
    try {
      let whereClauses = ["1=1"];
      const params = [];

      if (search && search.trim()) {
        const q = `%${search.trim().toLowerCase()}%`;
        whereClauses.push(`(
          LOWER(s.session_uuid) LIKE ? OR
          LOWER(s.guest_uuid) LIKE ? OR
          LOWER(s.current_intent) LIKE ? OR
          LOWER(s.extracted_profile) LIKE ? OR
          LOWER(s.extracted_requirements) LIKE ? OR
          LOWER(CONCAT_WS(' ', u.first_name, u.last_name)) LIKE ? OR
          LOWER(u.email) LIKE ? OR
          LOWER(u.phone) LIKE ?
        )`);
        params.push(q, q, q, q, q, q, q, q);
      }

      if (role && role.trim() && role.trim() !== "all") {
        whereClauses.push(`(
          LOWER(s.current_intent) = LOWER(?) OR
          LOWER(JSON_UNQUOTE(JSON_EXTRACT(s.extracted_profile, '$.role'))) = LOWER(?)
        )`);
        params.push(role.trim(), role.trim());
      }

      if (isQualified !== null && isQualified !== undefined && isQualified !== "" && isQualified !== "all") {
        whereClauses.push(`s.is_qualified = ?`);
        params.push(Number(isQualified) ? 1 : 0);
      }

      if (location && location.trim()) {
        const locPattern = `%${location.trim().toLowerCase()}%`;
        whereClauses.push(`LOWER(s.extracted_requirements) LIKE ?`);
        params.push(locPattern);
      }

      if (dateRange === "today") {
        whereClauses.push(`DATE(s.updated_at) = CURDATE()`);
      } else if (dateRange === "yesterday") {
        whereClauses.push(`DATE(s.updated_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`);
      } else if (dateRange === "week") {
        whereClauses.push(`s.updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
      } else if (dateRange === "month") {
        whereClauses.push(`s.updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
      }

      const whereSql = whereClauses.join(" AND ");

      const countSql = `
        SELECT COUNT(*) AS total
        FROM rex_agent_sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE ${whereSql}
      `;
      const [countRows] = await db.execute(countSql, params);
      const total = countRows?.[0]?.total ? Number(countRows[0].total) : 0;

      // Calculate rollup metrics
      let metrics = { totalAll: total, totalToday: 0, totalQualified: 0, totalBuyers: 0 };
      try {
        const [metricRows] = await db.execute(`
          SELECT
            COUNT(*) AS totalAll,
            SUM(CASE WHEN DATE(updated_at) = CURDATE() THEN 1 ELSE 0 END) AS totalToday,
            SUM(CASE WHEN is_qualified = 1 THEN 1 ELSE 0 END) AS totalQualified,
            SUM(CASE WHEN LOWER(current_intent) = 'buyer' OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(extracted_profile, '$.role'))) = 'buyer' THEN 1 ELSE 0 END) AS totalBuyers
          FROM rex_agent_sessions
        `);
        if (metricRows && metricRows[0]) {
          metrics = {
            totalAll: Number(metricRows[0].totalAll || 0),
            totalToday: Number(metricRows[0].totalToday || 0),
            totalQualified: Number(metricRows[0].totalQualified || 0),
            totalBuyers: Number(metricRows[0].totalBuyers || 0),
          };
        }
      } catch (metricErr) {
        console.warn("Metrics query fallback:", metricErr.message);
      }

      const dataSql = `
        SELECT
          s.id,
          s.session_uuid,
          s.user_id,
          s.guest_uuid,
          s.current_intent,
          s.extracted_profile,
          s.extracted_requirements,
          s.message_history,
          s.is_qualified,
          s.lead_id,
          s.created_at,
          s.updated_at,
          u.first_name,
          u.last_name,
          u.email AS user_email,
          u.phone AS user_phone,
          u.avatar AS user_avatar
        FROM rex_agent_sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE ${whereSql}
        ORDER BY s.updated_at DESC
        LIMIT ? OFFSET ?
      `;

      const [rows] = await db.execute(dataSql, [...params, String(limit), String(offset)]);

      const sessions = (rows || []).map((row) => ({
        ...row,
        extracted_profile: this.safeJsonParse(row.extracted_profile, {}),
        extracted_requirements: this.safeJsonParse(row.extracted_requirements, { locations: [] }),
        message_history: this.safeJsonParse(row.message_history, []),
        is_qualified: Boolean(row.is_qualified),
      }));

      return {
        sessions,
        total,
        metrics,
        limit,
        offset,
      };
    } catch (err) {
      if (err.code === "ER_NO_SUCH_TABLE") {
        const memArray = Array.from(memorySessionStore.values());
        return {
          sessions: memArray.slice(offset, offset + limit),
          total: memArray.length,
          metrics: { totalAll: memArray.length, totalToday: memArray.length, totalQualified: 0, totalBuyers: 0 },
          limit,
          offset,
        };
      }
      throw err;
    }
  }
}

module.exports = RexSessionModel;

