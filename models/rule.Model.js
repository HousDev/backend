const db = require("../config/database");

const Rule = {
  findAll: async () => {
    const [rows] = await db.query("SELECT * FROM automation_rules");
    return rows;
  },
  updateActive: async (id, is_active) => {
    await db.query("UPDATE automation_rules SET is_active = ? WHERE id = ?", [
      is_active,
      id,
    ]);
  },
  incrementExecCount: async (id) => {
    await db.query(
      "UPDATE automation_rules SET execution_count = execution_count + 1 WHERE id = ?",
      [id],
    );
  },
};

module.exports = Rule;
