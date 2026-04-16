// const db = require("../config/database");

// const Template = {
//   findAll: async () => {
//     const [rows] = await db.query(
//       "SELECT * FROM templates_wa ORDER BY created_at DESC",
//     );
//     return rows;
//   },
//   create: async (data) => {
//     const {
//       name,
//       label,
//       category,
//       language,
//       body,
//       variables,
//       status,
//       meta_id,
//     } = data;
//     const [result] = await db.query(
//       "INSERT INTO templates_wa (name, label, category, language, body, variables, status, meta_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
//       [
//         name,
//         label,
//         category,
//         language,
//         body,
//         JSON.stringify(variables || []),
//         status || "pending",
//         meta_id || null,
//       ],
//     );
//     return result.insertId;
//   },
//   updateStatus: async (id, status, rejection_reason = null) => {
//     await db.query(
//       "UPDATE templates_wa SET status = ?, rejection_reason = ? WHERE id = ?",
//       [status, rejection_reason, id],
//     );
//   },
//   findApproved: async (name) => {
//     const [rows] = await db.query(
//       'SELECT * FROM templates_wa WHERE name = ? AND status = "approved"',
//       [name],
//     );
//     return rows[0];
//   },
// };

// module.exports = Template;

const db = require("../config/database");

const Template = {
  findAll: async () => {
    const [rows] = await db.query(
      "SELECT * FROM templates_wa ORDER BY created_at DESC",
    );
    return rows;
  },

  findById: async (id) => {
    const [rows] = await db.query("SELECT * FROM templates_wa WHERE id = ?", [
      id,
    ]);
    return rows[0];
  },

  create: async (data) => {
    const {
      name,
      label,
      category,
      language,
      body,
      variables,
      status,
      meta_id,
    } = data;

    const [result] = await db.query(
      "INSERT INTO templates_wa (name, label, category, language, body, variables, status, meta_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        name,
        label,
        category,
        language,
        body,
        JSON.stringify(variables || []),
        status || "pending",
        meta_id || null,
      ],
    );

    return result.insertId;
  },

  updateStatus: async (id, status, rejection_reason = null) => {
    await db.query(
      "UPDATE templates_wa SET status = ?, rejection_reason = ? WHERE id = ?",
      [status, rejection_reason, id],
    );
  },

  findApproved: async (name) => {
    const [rows] = await db.query(
      'SELECT * FROM templates_wa WHERE name = ? AND status = "approved"',
      [name],
    );
    return rows[0];
  },
};

module.exports = Template;