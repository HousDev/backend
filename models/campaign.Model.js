// const db = require("../config/database");

// const Campaign = {
//   // Get all campaigns with template info
//   findAll: async () => {
//     const [rows] = await db.query(`
//             SELECT c.*,
//                    JSON_OBJECT('id', t.id, 'name', t.name, 'body', t.body, 'category', t.category) as template
//             FROM campaigns c
//             LEFT JOIN templates_wa t ON c.template_id = t.id
//             ORDER BY c.created_at DESC
//         `);
//     console.log("🔍 findAll returned rows:", rows.length); // ✅ ADD THI
//     return rows.map((row) => ({
//       ...row,
//       template: row.template ? JSON.parse(row.template) : null,
//       filters: row.filters ? JSON.parse(row.filters) : {},
//     }));
//   },

//   // Get campaign by ID
//   findById: async (id) => {
//     const [rows] = await db.query(
//       `
//             SELECT c.*,
//                    JSON_OBJECT('id', t.id, 'name', t.name, 'body', t.body, 'category', t.category) as template
//             FROM campaigns c
//             LEFT JOIN templates_wa t ON c.template_id = t.id
//             WHERE c.id = ?
//         `,
//       [id],
//     );
//     if (rows.length === 0) return null;
//     return {
//       ...rows[0],
//       template: rows[0].template ? JSON.parse(rows[0].template) : null,
//       filters: rows[0].filters ? JSON.parse(rows[0].filters) : {},
//     };
//   },

//   // Create new campaign
//   create: async (data) => {
//     const { name, template_id, status, scheduled_at, total_contacts, filters } =
//       data;

//     const [result] = await db.query(
//       `INSERT INTO campaigns
//             (name, template_id, status, scheduled_at, total_contacts, filters)
//             VALUES (?, ?, ?, ?, ?, ?)`,
//       [
//         name,
//         template_id,
//         status || "draft",
//         scheduled_at || null,
//         total_contacts || 0,
//         JSON.stringify(filters || {}),
//       ],
//     );
//     return result.insertId;
//   },

//   // Update campaign
//   update: async (id, data) => {
//     const fields = [];
//     const values = [];

//     const allowedFields = [
//       "name",
//       "template_id",
//       "status",
//       "scheduled_at",
//       "total_contacts",
//       "sent_count",
//       "delivered_count",
//       "read_count",
//       "failed_count",
//       "filters",
//     ];

//     for (const [key, value] of Object.entries(data)) {
//       if (allowedFields.includes(key) && value !== undefined) {
//         if (key === "filters") {
//           fields.push(`${key} = ?`);
//           values.push(JSON.stringify(value));
//         } else {
//           fields.push(`${key} = ?`);
//           values.push(value);
//         }
//       }
//     }

//     if (fields.length === 0) return;

//     values.push(id);
//     await db.query(
//       `UPDATE campaigns SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
//       values,
//     );
//     return Campaign.findById(id);
//   },

//   // Delete campaign
//   delete: async (id) => {
//     await db.query("DELETE FROM campaigns WHERE id = ?", [id]);
//     return true;
//   },

//   // Update campaign stats
//   updateStats: async (id, sent, delivered, read, failed) => {
//     await db.query(
//       `UPDATE campaigns SET
//                 sent_count = sent_count + ?,
//                 delivered_count = delivered_count + ?,
//                 read_count = read_count + ?,
//                 failed_count = failed_count + ?
//             WHERE id = ?`,
//       [sent || 0, delivered || 0, read || 0, failed || 0, id],
//     );
//     return Campaign.findById(id);
//   },
// };

// module.exports = Campaign;
const db = require("../config/database");

const Campaign = {
  // Get all campaigns with template info
  findAll: async () => {
    const [rows] = await db.query(`
      SELECT c.*, 
             JSON_OBJECT('id', t.id, 'name', t.name, 'body', t.body, 'category', t.category) as template
      FROM campaigns c
      LEFT JOIN templates_wa t ON c.template_id = t.id
      ORDER BY c.created_at DESC
    `);

    console.log("🔍 findAll returned rows:", rows.length);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      template_id: row.template_id,
      status: row.status,
      total_contacts: row.total_contacts,
      sent_count: row.sent_count,
      delivered_count: row.delivered_count,
      read_count: row.read_count,
      failed_count: row.failed_count,
      scheduled_at: row.scheduled_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      // ✅ FIX: No JSON.parse needed - MySQL already returns object
      filters: row.filters || {},
      template: row.template || null,
    }));
  },

  // Get campaign by ID
  findById: async (id) => {
    const [rows] = await db.query(
      `SELECT c.*, 
              JSON_OBJECT('id', t.id, 'name', t.name, 'body', t.body, 'category', t.category) as template
       FROM campaigns c
       LEFT JOIN templates_wa t ON c.template_id = t.id
       WHERE c.id = ?`,
      [id],
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      template_id: row.template_id,
      status: row.status,
      total_contacts: row.total_contacts,
      sent_count: row.sent_count,
      delivered_count: row.delivered_count,
      read_count: row.read_count,
      failed_count: row.failed_count,
      scheduled_at: row.scheduled_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      // ✅ FIX: No JSON.parse needed
      filters: row.filters || {},
      template: row.template || null,
    };
  },

  // Create new campaign
  create: async (data) => {
    const { name, template_id, status, scheduled_at, total_contacts, filters } =
      data;

    const [result] = await db.query(
      `INSERT INTO campaigns 
       (name, template_id, status, scheduled_at, total_contacts, filters) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        template_id,
        status || "draft",
        scheduled_at || null,
        total_contacts || 0,
        JSON.stringify(filters || {}),
      ],
    );
    return result.insertId;
  },

  // Update campaign
  update: async (id, data) => {
    const fields = [];
    const values = [];

    const allowedFields = [
      "name",
      "template_id",
      "status",
      "scheduled_at",
      "total_contacts",
      "sent_count",
      "delivered_count",
      "read_count",
      "failed_count",
      "filters",
    ];

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key) && value !== undefined) {
        if (key === "filters") {
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
      `UPDATE campaigns SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
      values,
    );
    return Campaign.findById(id);
  },

  // Delete campaign
  delete: async (id) => {
    await db.query("DELETE FROM campaigns WHERE id = ?", [id]);
    return true;
  },

  // Update campaign stats
  updateStats: async (id, sent, delivered, read, failed) => {
    await db.query(
      `UPDATE campaigns SET 
        sent_count = sent_count + ?,
        delivered_count = delivered_count + ?,
        read_count = read_count + ?,
        failed_count = failed_count + ?
      WHERE id = ?`,
      [sent || 0, delivered || 0, read || 0, failed || 0, id],
    );
    return Campaign.findById(id);
  },
};

module.exports = Campaign;