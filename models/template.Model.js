// const db = require("../config/database");

// const Template = {
//   findAll: async () => {
//     const [rows] = await db.query(
//       "SELECT * FROM templates_wa ORDER BY created_at DESC",
//     );
//     return rows;
//   },

//   findById: async (id) => {
//     const [rows] = await db.query("SELECT * FROM templates_wa WHERE id = ?", [
//       id,
//     ]);
//     return rows[0];
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
  // Get all templates
  findAll: async () => {
    const [rows] = await db.query(
      "SELECT * FROM templates_wa ORDER BY created_at DESC",
    );
    // Map status to uppercase for frontend
    return rows.map((row) => ({
      ...row,
      status: row.status ? row.status.toUpperCase() : "PENDING",
    }));
  },

  // Get template by ID
  findById: async (id) => {
    const [rows] = await db.query("SELECT * FROM templates_wa WHERE id = ?", [
      id,
    ]);
    if (rows.length === 0) return null;
    return {
      ...rows[0],
      status: rows[0].status ? rows[0].status.toUpperCase() : "PENDING",
    };
  },

  // Create new template
  create: async (data) => {
    const {
      name,
      category,
      language,
      body,
      variables,
      header_type,
      header_text,
      footer,
      buttons,
    } = data;

    const [result] = await db.query(
      `INSERT INTO templates_wa 
      (name, label, category, language, body, variables, header_type, header_text, footer, buttons, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        name, // label same as name
        category || "UTILITY",
        language || "en",
        body,
        JSON.stringify(variables || []),
        header_type || null,
        header_text || null,
        footer || null,
        buttons ? JSON.stringify(buttons) : null,
        "PENDING",
      ],
    );
    return result.insertId;
  },

  // Update template
  update: async (id, data) => {
    const fields = [];
    const values = [];

    const allowedFields = [
      "name",
      "category",
      "language",
      "body",
      "variables",
      "header_type",
      "header_text",
      "footer",
      "buttons",
      "status",
    ];

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key) && value !== undefined) {
        if (key === "variables" || key === "buttons") {
          fields.push(`${key} = ?`);
          values.push(JSON.stringify(value));
        } else {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }
    }

    if (fields.length === 0) return;

    values.push(id);
    await db.query(
      `UPDATE templates_wa SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
      values,
    );
    return Template.findById(id);
  },

  // Delete template
  delete: async (id) => {
    await db.query("DELETE FROM templates_wa WHERE id = ?", [id]);
    return true;
  },

  // Update template status
  updateStatus: async (id, status, rejection_reason = null) => {
    const upperStatus = status ? status.toUpperCase() : "PENDING";
    await db.query(
      "UPDATE templates_wa SET status = ?, rejection_reason = ? WHERE id = ?",
      [upperStatus.toLowerCase(), rejection_reason, id],
    );
    return Template.findById(id);
  },

  // Submit template to Meta (update status to PENDING)
  submitToMeta: async (id) => {
    await db.query(
      "UPDATE templates_wa SET status = 'pending', updated_at = NOW() WHERE id = ?",
      [id],
    );
    return Template.findById(id);
  },

  // Find approved template by name
  findApproved: async (name) => {
    const [rows] = await db.query(
      'SELECT * FROM templates_wa WHERE name = ? AND status = "approved"',
      [name],
    );
    if (rows.length === 0) return null;
    return {
      ...rows[0],
      status: rows[0].status ? rows[0].status.toUpperCase() : "PENDING",
    };
  },
};

module.exports = Template;