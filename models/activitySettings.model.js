const db = require("../config/database");

class ActivitySettings {
  static async getSettings(tenantId = null) {
    const query = `SELECT * FROM activity_settings LIMIT 1`;
    try {
      const [rows] = await db.query(query);
      if (rows.length > 0) {
        return rows[0];
      }
      // Return sensible defaults if no row exists yet
      return {
        tracking_enabled: 1,
        idle_threshold_seconds: 120,
        verification_enabled: 1,
        verification_interval_seconds: 120,
        verification_timeout_seconds: 60,
        max_attempts: 2,
        heartbeat_interval_seconds: 30,
        track_mouse: 1,
        track_keyboard: 1,
        track_scroll: 1,
      };
    } catch (err) {
      console.warn("Could not query activity_settings table, fallback to defaults:", err.message);
      return {
        tracking_enabled: 1,
        idle_threshold_seconds: 120,
        verification_enabled: 1,
        verification_interval_seconds: 120,
        verification_timeout_seconds: 60,
        max_attempts: 2,
        heartbeat_interval_seconds: 30,
        track_mouse: 1,
        track_keyboard: 1,
        track_scroll: 1,
      };
    }
  }

  static async updateSettings(settingsData) {
    const query = `
      INSERT INTO activity_settings (
        id, tracking_enabled, idle_threshold_seconds, verification_enabled,
        verification_interval_seconds, verification_timeout_seconds, max_attempts,
        heartbeat_interval_seconds, track_mouse, track_keyboard, track_scroll, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        tracking_enabled = VALUES(tracking_enabled),
        idle_threshold_seconds = VALUES(idle_threshold_seconds),
        verification_enabled = VALUES(verification_enabled),
        verification_interval_seconds = VALUES(verification_interval_seconds),
        verification_timeout_seconds = VALUES(verification_timeout_seconds),
        max_attempts = VALUES(max_attempts),
        heartbeat_interval_seconds = VALUES(heartbeat_interval_seconds),
        track_mouse = VALUES(track_mouse),
        track_keyboard = VALUES(track_keyboard),
        track_scroll = VALUES(track_scroll),
        updated_at = NOW()
    `;
    const values = [
      settingsData.tracking_enabled ?? 1,
      settingsData.idle_threshold_seconds ?? 300,
      settingsData.verification_enabled ?? 1,
      settingsData.verification_interval_seconds ?? 300,
      settingsData.verification_timeout_seconds ?? 60,
      settingsData.max_attempts ?? 2,
      settingsData.heartbeat_interval_seconds ?? 30,
      settingsData.track_mouse ?? 1,
      settingsData.track_keyboard ?? 1,
      settingsData.track_scroll ?? 1,
    ];

    try {
      await db.query(query, values);
      return true;
    } catch (err) {
      console.error("Error updating activity settings:", err);
      throw err;
    }
  }
}

module.exports = ActivitySettings;
