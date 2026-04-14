// models/integration.model.js
const db = require("../config/database");

class Integration {
  /**
   * Get all integrations grouped by tab
   * @returns {Promise<Object>} Object with tab as key and config + is_active
   */
  static async getAllGrouped() {
    const [rows] = await db.execute(
      `SELECT tab, setting_key, value, is_active 
       FROM integrations 
       ORDER BY tab, setting_key`
    );

    // Group by tab
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.tab]) {
        grouped[row.tab] = {
          tab: row.tab,
          is_active: row.is_active === 1,
          config: {},
        };
      }
      grouped[row.tab].config[row.setting_key] = row.value;
    }

    // Ensure all tabs exist with defaults
    const allTabs = ["email", "sms", "whatsapp", "razorpay", "stripe", "chatgpt"];
    for (const tab of allTabs) {
      if (!grouped[tab]) {
        grouped[tab] = {
          tab: tab,
          is_active: false,
          config: {},
        };
      }
    }

    return grouped;
  }

  /**
   * Get single tab configuration
   * @param {string} tab - The tab name
   * @returns {Promise<Object|null>} Tab data or null
   */
  static async getByTab(tab) {
    const [rows] = await db.execute(
      `SELECT setting_key, value, is_active 
       FROM integrations 
       WHERE tab = ?`,
      [tab]
    );

    if (rows.length === 0) {
      return null;
    }

    const config = {};
    let is_active = false;

    for (const row of rows) {
      config[row.setting_key] = row.value;
      is_active = row.is_active === 1;
    }

    return {
      tab,
      is_active,
      config,
    };
  }

  /**
   * Save/upsert configuration for a tab
   * @param {string} tab - Tab name
   * @param {Object} config - Key-value pairs
   * @returns {Promise<Object>} Updated tab data
   */
  static async saveConfig(tab, config) {
    // First, get current is_active state
    const [current] = await db.execute(
      `SELECT is_active FROM integrations WHERE tab = ? LIMIT 1`,
      [tab]
    );
    const currentIsActive = current.length > 0 ? current[0].is_active === 1 : false;

    // Delete existing config for this tab
    await db.execute(
      `DELETE FROM integrations WHERE tab = ?`,
      [tab]
    );

    // Insert new config
    if (config && Object.keys(config).length > 0) {
      const entries = Object.entries(config);
      const placeholders = entries.map(() => "(?, ?, ?, ?)").join(", ");
      const values = [];
      
      for (const [key, value] of entries) {
        values.push(tab, key, value, currentIsActive ? 1 : 0);
      }
      
      await db.execute(
        `INSERT INTO integrations (tab, setting_key, value, is_active) 
         VALUES ${placeholders}`,
        values
      );
    }

    return {
      tab,
      is_active: currentIsActive,
      config,
    };
  }

  /**
   * Toggle active status for a tab
   * @param {string} tab - Tab name
   * @param {boolean} is_active - Active status
   * @returns {Promise<Object>} Updated tab data
   */
  static async toggleActive(tab, is_active) {
    const activeValue = is_active ? 1 : 0;
    
    await db.execute(
      `UPDATE integrations SET is_active = ? WHERE tab = ?`,
      [activeValue, tab]
    );

    // Get the updated config
    return this.getByTab(tab);
  }

  /**
   * Clear all configuration for a tab
   * @param {string} tab - Tab name
   * @returns {Promise<void>}
   */
  static async clearConfig(tab) {
    await db.execute(
      `DELETE FROM integrations WHERE tab = ?`,
      [tab]
    );
  }

  /**
   * Get specific setting value
   * @param {string} tab - Tab name
   * @param {string} key - Setting key
   * @returns {Promise<string|null>} Setting value or null
   */
  static async getSetting(tab, key) {
    const [rows] = await db.execute(
      `SELECT value FROM integrations WHERE tab = ? AND setting_key = ?`,
      [tab, key]
    );
    return rows.length > 0 ? rows[0].value : null;
  }

  /**
   * Validate required settings for a tab
   * @param {string} tab - Tab name
   * @param {Array<string>} requiredKeys - Required setting keys
   * @returns {Promise<boolean>} Whether all required settings exist
   */
  static async validateConfig(tab, requiredKeys) {
    const config = await this.getByTab(tab);
    if (!config) return false;
    
    for (const key of requiredKeys) {
      if (!config.config[key] || config.config[key].trim() === "") {
        return false;
      }
    }
    return true;
  }
}

module.exports = Integration;