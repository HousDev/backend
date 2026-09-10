const db = require("../config/database");

// Master table allowlist for security
const ALLOWED_TABLES = [
  "fu_entities",
  "fu_follow_up_types",
  "fu_stages",
  "fu_statuses",
  "fu_outcomes",
  "fu_reasons",
  "fu_next_actions",
  "fu_priorities",
  "fu_sequences",
  "fu_rules",
  "fu_follow_ups",
  "fu_automation_jobs",
  "fu_teams",
  "fu_team_members",
];

const FollowUpMaster = {
  // Helper to safely check if a table exists
  tableExists: async (tableName) => {
    if (!ALLOWED_TABLES.includes(tableName)) return false;
    try {
      const [rows] = await db.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
        [tableName]
      );
      return rows[0]?.cnt > 0;
    } catch {
      return false;
    }
  },

  // Fetch all master data across all tables
  getAllMasterData: async () => {
    const result = {
      entities: [],
      followUpTypes: [],
      stages: [],
      statuses: [],
      outcomes: [],
      reasons: [],
      nextActions: [],
      priorities: [],
      rules: [],
      sequences: [],
      automationJobs: [],
      teams: [],
      teamMembers: [],
    };

    const tableMapping = {
      fu_entities: "entities",
      fu_follow_up_types: "followUpTypes",
      fu_stages: "stages",
      fu_statuses: "statuses",
      fu_outcomes: "outcomes",
      fu_reasons: "reasons",
      fu_next_actions: "nextActions",
      fu_priorities: "priorities",
      fu_rules: "rules",
      fu_sequences: "sequences",
      fu_automation_jobs: "automationJobs",
      fu_teams: "teams",
      fu_team_members: "teamMembers",
    };

    for (const [table, key] of Object.entries(tableMapping)) {
      try {
        const exists = await FollowUpMaster.tableExists(table);
        if (exists) {
          const orderBy =
            table === "fu_sequences"
              ? "ORDER BY sequence_name ASC, step ASC"
              : table === "fu_automation_jobs" || table === "fu_follow_ups"
              ? "ORDER BY created_at DESC"
              : "ORDER BY display_order ASC, id ASC";
          const [rows] = await db.query(`SELECT * FROM \`${table}\` ${orderBy}`);
          result[key] = rows;
        }
      } catch (err) {
        console.error(`Error loading table ${table}:`, err.message);
      }
    }

    return result;
  },

  // Get table column names from information_schema
  getTableColumns: async (tableName) => {
    try {
      const [rows] = await db.query(
        `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
        [tableName]
      );
      return rows.map((r) => r.COLUMN_NAME);
    } catch {
      return [];
    }
  },

  // Generic find all for a table
  findAll: async (tableName) => {
    if (!ALLOWED_TABLES.includes(tableName)) {
      throw new Error(`Table ${tableName} is not permitted.`);
    }
    const [rows] = await db.query(`SELECT * FROM \`${tableName}\``);
    return rows;
  },

  // Generic find by ID
  findById: async (tableName, id) => {
    if (!ALLOWED_TABLES.includes(tableName)) {
      throw new Error(`Table ${tableName} is not permitted.`);
    }
    const [rows] = await db.query(`SELECT * FROM \`${tableName}\` WHERE id = ?`, [id]);
    return rows[0] || null;
  },

  // Generic insert or update (upsert) with automatic column filtering
  upsert: async (tableName, data) => {
    if (!ALLOWED_TABLES.includes(tableName)) {
      throw new Error(`Table ${tableName} is not permitted.`);
    }
    const cols = await FollowUpMaster.getTableColumns(tableName);
    const filteredData = {};
    for (const [k, v] of Object.entries(data)) {
      if (cols.length === 0 || cols.includes(k)) {
        if (typeof v === "object" && v !== null && !(v instanceof Date)) {
          filteredData[k] = JSON.stringify(v);
        } else {
          filteredData[k] = v;
        }
      }
    }

    // Auto-generate ID if table has id column and it is missing
    if (cols.includes("id") && !filteredData.id) {
      if (data.id) {
        filteredData.id = data.id;
      } else if (tableName === "fu_rules") {
        filteredData.id = data.rule_id || data.name || `FUR_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      } else if (tableName === "fu_sequences") {
        filteredData.id = `${data.sequence_name}_STEP_${data.step}`;
      } else if (tableName === "fu_stages" || tableName === "fu_statuses") {
        filteredData.id = `${data.entity_code || 'GEN'}_${data.code || data.name}`;
      } else if (tableName === "fu_outcomes") {
        filteredData.id = `${data.follow_up_type_code || 'ALL'}_${data.code || data.name}`;
      } else if (tableName === "fu_reasons") {
        filteredData.id = `${data.outcome_code ? data.outcome_code + '_' : ''}${data.code || data.name}`;
      } else {
        filteredData.id =
          data.code ||
          data.name ||
          `${tableName.replace("fu_", "")}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }
    }

    // Ensure name is present for tables with name requirement
    if (cols.includes("name") && !filteredData.name) {
      filteredData.name = data.rule_id || data.code || data.id || filteredData.id || "Untitled";
    }

    // Ensure entity_code fallback if table has entity_code column
    if (cols.includes("entity_code") && filteredData.entity_code === undefined) {
      filteredData.entity_code = data.entity_code || "";
    }

    // Ensure icon fallback if table has icon/icon_name
    if (cols.includes("icon") && !filteredData.icon) {
      filteredData.icon = data.icon || data.icon_name || "Phone";
    }
    if (cols.includes("icon_name") && !filteredData.icon_name) {
      filteredData.icon_name = data.icon_name || data.icon || "Phone";
    }

    // Ensure priority_code fallback
    if (cols.includes("priority_code") && !filteredData.priority_code) {
      filteredData.priority_code = data.priority_code || "MEDIUM";
    }

    const keys = Object.keys(filteredData);
    if (keys.length === 0) throw new Error("No valid data provided.");

    const values = Object.values(filteredData);
    const placeholders = keys.map(() => "?").join(", ");
    const updateClauses = keys.map((k) => `\`${k}\` = VALUES(\`${k}\`)`).join(", ");

    const sql = `
      INSERT INTO \`${tableName}\` (${keys.map((k) => `\`${k}\``).join(", ")})
      VALUES (${placeholders})
      ON DUPLICATE KEY UPDATE ${updateClauses}
    `;

    const [result] = await db.query(sql, values);
    return result;
  },

  // Generic update by ID with automatic column filtering
  updateById: async (tableName, id, data) => {
    if (!ALLOWED_TABLES.includes(tableName)) {
      throw new Error(`Table ${tableName} is not permitted.`);
    }
    const cols = await FollowUpMaster.getTableColumns(tableName);
    const filteredData = {};
    for (const [k, v] of Object.entries(data)) {
      if (k !== "id" && (cols.length === 0 || cols.includes(k))) {
        if (typeof v === "object" && v !== null && !(v instanceof Date)) {
          filteredData[k] = JSON.stringify(v);
        } else {
          filteredData[k] = v;
        }
      }
    }
    const keys = Object.keys(filteredData);
    if (keys.length === 0) return { affectedRows: 0 };

    const setClauses = keys.map((k) => `\`${k}\` = ?`).join(", ");
    const values = [...keys.map((k) => filteredData[k]), id];

    const sql = `UPDATE \`${tableName}\` SET ${setClauses} WHERE id = ?`;
    const [result] = await db.query(sql, values);
    return result;
  },

  // Generic delete by ID
  deleteById: async (tableName, id) => {
    if (!ALLOWED_TABLES.includes(tableName)) {
      throw new Error(`Table ${tableName} is not permitted.`);
    }
    const [result] = await db.query(`DELETE FROM \`${tableName}\` WHERE id = ?`, [id]);
    return result;
  },

  // Delete sequence by name
  deleteSequenceByName: async (sequenceName) => {
    const [result] = await db.query(
      `DELETE FROM fu_sequences WHERE sequence_name = ?`,
      [sequenceName]
    );
    return result;
  },

  // Check if a record is duplicate (disabled for full import)
  checkDuplicate: async (tableName, row) => {
    return false;
  },

  // Bulk import tables
  bulkImport: async (backupTables) => {
    const results = { importedTables: 0, importedRows: 0, duplicatesSkipped: 0 };
    for (const [table, rows] of Object.entries(backupTables)) {
      if (!ALLOWED_TABLES.includes(table) || !Array.isArray(rows) || rows.length === 0) {
        continue;
      }
      for (const row of rows) {
        try {
          await FollowUpMaster.upsert(table, row);
          results.importedRows++;
        } catch (err) {
          console.error(`Error importing row into ${table}:`, err.message);
        }
      }
      results.importedTables++;
    }
    return results;
  },
};

module.exports = FollowUpMaster;
