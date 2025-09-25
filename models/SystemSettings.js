// const db = require("../config/database"); // mysql2/promise pool

// class SystemSettings {
//   constructor(settings) {
//     this.company_name = settings.company_name;
//     this.company_logo = settings.company_logo || null;
//     this.company_favicon = settings.company_favicon || null;
//     this.primary_color = settings.primary_color || "#3B82F6";
//     this.secondary_color = settings.secondary_color || "#10B981";
//     this.currency = settings.currency || "INR";
//     this.date_format = settings.date_format || "MM/DD/YYYY";
//     this.time_format = settings.time_format || "12h";
//     this.default_language = settings.default_language || "en";
//     this.max_file_size = settings.max_file_size || 10485760;
//     this.backup_frequency = settings.backup_frequency || "daily";
//     this.auto_assign_leads = settings.auto_assign_leads || false;
//     this.lead_scoring_enabled = settings.lead_scoring_enabled || false;
//     this.property_auto_approval = settings.property_auto_approval || false;
//   }

//   static async getSettings() {
//     const [rows] = await db.query("SELECT * FROM system_settings LIMIT 1");
//     return rows.length ? rows[0] : null;
//   }

//   static async create(newSettings) {
//     const query = `
//       INSERT INTO system_settings (
//         company_name, company_logo, company_favicon,
//         primary_color, secondary_color, currency,
//         date_format, time_format, default_language,
//         max_file_size, backup_frequency,
//         auto_assign_leads, lead_scoring_enabled, property_auto_approval,
//         created_at, updated_at
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
//     `;

//     const values = [
//       newSettings.company_name,
//       newSettings.company_logo || null,
//       newSettings.company_favicon || null,
//       newSettings.primary_color || "#3B82F6",
//       newSettings.secondary_color || "#10B981",
//       newSettings.currency || "INR",
//       newSettings.date_format || "MM/DD/YYYY",
//       newSettings.time_format || "12h",
//       newSettings.default_language || "en",
//       newSettings.max_file_size || 10485760,
//       newSettings.backup_frequency || "daily",
//       newSettings.auto_assign_leads ? 1 : 0,
//       newSettings.lead_scoring_enabled ? 1 : 0,
//       newSettings.property_auto_approval ? 1 : 0,
//     ];

//     const [result] = await db.query(query, values);
//     return { id: result.insertId, ...newSettings };
//   }

//   static async update(id, settings) {
//     const allowedFields = [
//       "company_name",
//       "company_logo",
//       "company_favicon",
//       "primary_color",
//       "secondary_color",
//       "currency",
//       "date_format",
//       "time_format",
//       "default_language",
//       "max_file_size",
//       "backup_frequency",
//       "auto_assign_leads",
//       "lead_scoring_enabled",
//       "property_auto_approval",
//     ];

//     const fields = [];
//     const values = [];

//     allowedFields.forEach((field) => {
//       if (settings[field] !== undefined) {
//         fields.push(`${field} = ?`);
//         values.push(settings[field]);
//       }
//     });

//     if (fields.length === 0) return { kind: "no_changes" };

//     fields.push("updated_at = NOW()");
//     values.push(id);

//     const query = `UPDATE system_settings SET ${fields.join(
//       ", "
//     )} WHERE id = ?`;
//     const [result] = await db.query(query, values);

//     if (result.affectedRows === 0) return { kind: "not_found" };
//     return { id, ...settings };
//   }

//   static async save(settings) {
//     const existing = await this.getSettings();
//     if (!existing) {
//       return await this.create(settings);
//     }
//     return await this.update(existing.id, settings);
//   }
// }

// module.exports = SystemSettings;


const db = require("../config/database"); // mysql2/promise pool

class SystemSettings {
  constructor(settings) {
    this.company_name = settings.company_name;
    this.company_logo = settings.company_logo || null;
    this.footer_logo = settings.footer_logo || null; // ✅ added
    this.company_favicon = settings.company_favicon || null;
    this.primary_color = settings.primary_color || "#3B82F6";
    this.secondary_color = settings.secondary_color || "#10B981";
    this.currency = settings.currency || "INR";
    this.date_format = settings.date_format || "MM/DD/YYYY";
    this.time_format = settings.time_format || "12h";
    this.default_language = settings.default_language || "en";
    this.max_file_size = settings.max_file_size || 10485760;
    this.backup_frequency = settings.backup_frequency || "daily";
    this.auto_assign_leads = settings.auto_assign_leads || false;
    this.lead_scoring_enabled = settings.lead_scoring_enabled || false;
    this.property_auto_approval = settings.property_auto_approval || false;
  }

  static async getSettings() {
    const [rows] = await db.query("SELECT * FROM system_settings LIMIT 1");
    return rows.length ? rows[0] : null;
  }

  static async create(newSettings) {
    const query = `
      INSERT INTO system_settings (
        company_name, company_logo, footer_logo, company_favicon,
        primary_color, secondary_color, currency,
        date_format, time_format, default_language,
        max_file_size, backup_frequency,
        auto_assign_leads, lead_scoring_enabled, property_auto_approval,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const values = [
      newSettings.company_name,
      newSettings.company_logo || null,
      newSettings.footer_logo || null, // ✅ added
      newSettings.company_favicon || null,
      newSettings.primary_color || "#3B82F6",
      newSettings.secondary_color || "#10B981",
      newSettings.currency || "INR",
      newSettings.date_format || "MM/DD/YYYY",
      newSettings.time_format || "12h",
      newSettings.default_language || "en",
      newSettings.max_file_size || 10485760,
      newSettings.backup_frequency || "daily",
      newSettings.auto_assign_leads ? 1 : 0,
      newSettings.lead_scoring_enabled ? 1 : 0,
      newSettings.property_auto_approval ? 1 : 0,
    ];

    const [result] = await db.query(query, values);
    return { id: result.insertId, ...newSettings };
  }

  static async update(id, settings) {
    const allowedFields = [
      "company_name",
      "company_logo",
      "footer_logo", // ✅ added
      "company_favicon",
      "primary_color",
      "secondary_color",
      "currency",
      "date_format",
      "time_format",
      "default_language",
      "max_file_size",
      "backup_frequency",
      "auto_assign_leads",
      "lead_scoring_enabled",
      "property_auto_approval",
    ];

    const fields = [];
    const values = [];

    allowedFields.forEach((field) => {
      if (settings[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(settings[field]);
      }
    });

    if (fields.length === 0) return { kind: "no_changes" };

    fields.push("updated_at = NOW()");
    values.push(id);

    const query = `UPDATE system_settings SET ${fields.join(
      ", "
    )} WHERE id = ?`;
    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) return { kind: "not_found" };
    return { id, ...settings };
  }

  static async save(settings) {
    const existing = await this.getSettings();
    if (!existing) {
      return await this.create(settings);
    }
    return await this.update(existing.id, settings);
  }
}

module.exports = SystemSettings;
