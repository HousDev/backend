// backend/models/LoginLog.js
const db = require('../config/database');

class LoginLog {
  static async createLog(logData) {
    const query = `
      INSERT INTO login_logs 
      (user_id, username, email, role, session_id, ip_address, device_id, source, latitude, longitude, address, login_time, last_activity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const values = [
      logData.user_id || null,
      logData.username || null,
      logData.email || '',
      logData.role || 'agent',
      logData.session_id || null,
      logData.ip_address || null,
      logData.device_id || null,
      logData.source || null,
      logData.latitude || null,
      logData.longitude || null,
      logData.address || null,
    ];
    const [result] = await db.query(query, values);
    return result.insertId;
  }

  static async updateAddress(logId, address) {
    const query = `UPDATE login_logs SET address = ? WHERE id = ?`;
    await db.query(query, [address, logId]);
  }

  static async updateLogout(sessionId) {
    if (!sessionId) return;
    const query = `
      UPDATE login_logs 
      SET logout_time = NOW(),
          session_duration = GREATEST(TIMESTAMPDIFF(SECOND, login_time, NOW()), 10)
      WHERE session_id = ? AND logout_time IS NULL
    `;
    await db.query(query, [sessionId]);
  }

  static async updateLogoutByUser(userId) {
    if (!userId) return;
    const query = `
      UPDATE login_logs 
      SET logout_time = NOW(),
          session_duration = GREATEST(TIMESTAMPDIFF(SECOND, login_time, NOW()), 10)
      WHERE user_id = ? AND logout_time IS NULL
    `;
    await db.query(query, [userId]);
  }

  static async closePreviousSessions(userId, email) {
    const query = `
      UPDATE login_logs 
      SET logout_time = COALESCE(last_activity, NOW()),
          session_duration = GREATEST(TIMESTAMPDIFF(SECOND, login_time, COALESCE(last_activity, NOW())), 10)
      WHERE (user_id = ? OR (email IS NOT NULL AND email = ? AND email != '')) AND logout_time IS NULL
    `;
    await db.query(query, [userId || 0, email || '']);
  }

  static async updateLastActivity(sessionId) {
    if (!sessionId) return;
    const query = `UPDATE login_logs SET last_activity = NOW() WHERE session_id = ? AND logout_time IS NULL`;
    await db.query(query, [sessionId]);
  }

  static async getAllLogs(filters = {}) {
    let query = `
      SELECT 
        l.*,
        COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.username, l.username, l.email) AS name
      FROM login_logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.role && filters.role !== 'all') {
      const r = filters.role.toLowerCase().trim();
      if (r === 'active') {
        query += ` AND l.logout_time IS NULL`;
      } else if (r === 'admin' || r === 'staff') {
        query += ` AND LOWER(l.role) NOT IN ('buyer', 'seller', 'tenant', 'owner', 'client')`;
      } else if (r === 'buyer' || r === 'client' || r === 'tenant') {
        query += ` AND LOWER(l.role) IN ('buyer', 'seller', 'tenant', 'owner', 'client')`;
      } else {
        query += ` AND LOWER(l.role) = ?`;
        params.push(r);
      }
    }

    if (filters.search) {
      query += ` AND (l.email LIKE ? OR l.username LIKE ? OR l.session_id LIKE ? OR l.source LIKE ? OR l.address LIKE ? OR l.ip_address LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)`;
      const s = `%${filters.search.trim()}%`;
      params.push(s, s, s, s, s, s, s, s);
    }

    if (filters.startDate && filters.endDate && !filters.ignoreDate) {
      query += ` AND DATE(l.login_time) BETWEEN ? AND ?`;
      params.push(filters.startDate, filters.endDate);
    }

    query += ` ORDER BY l.login_time DESC LIMIT 500`;

    const [rows] = await db.query(query, params);
    return rows;
  }

  static async getStats() {
    const [rows] = await db.query(`
      SELECT 
        COUNT(*) AS total_logins,
        SUM(CASE WHEN LOWER(role) IN ('buyer', 'seller', 'tenant', 'owner', 'client') THEN 1 ELSE 0 END) AS tenant_logins,
        SUM(CASE WHEN LOWER(role) NOT IN ('buyer', 'seller', 'tenant', 'owner', 'client') THEN 1 ELSE 0 END) AS admin_logins,
        SUM(CASE WHEN logout_time IS NULL THEN 1 ELSE 0 END) AS active_sessions
      FROM login_logs
    `);
    return rows[0] || { total_logins: 0, tenant_logins: 0, admin_logins: 0, active_sessions: 0 };
  }
}

module.exports = LoginLog;
