// const db = require("../config/database");

// const Template = {
//   findAll: async () => {
//     const [rows] = await db.query(
//       `SELECT * FROM templates_wa ORDER BY created_at DESC`,
//     );
//     return rows.map((row) => {
//       // Safely parse JSON fields
//       let buttons = null;
//       if (row.buttons) {
//         try {
//           buttons =
//             typeof row.buttons === "string"
//               ? JSON.parse(row.buttons)
//               : row.buttons;
//         } catch (e) {
//           buttons = null;
//         }
//       }

//       let variables = null;
//       if (row.variables) {
//         try {
//           variables =
//             typeof row.variables === "string"
//               ? JSON.parse(row.variables)
//               : row.variables;
//         } catch (e) {
//           variables = null;
//         }
//       }

//       let carousel_cards = null;
//       if (row.carousel_cards) {
//         try {
//           carousel_cards =
//             typeof row.carousel_cards === "string"
//               ? JSON.parse(row.carousel_cards)
//               : row.carousel_cards;
//         } catch (e) {
//           carousel_cards = null;
//         }
//       }

//       return {
//         ...row,
//         buttons,
//         variables,
//         carousel_cards,
//       };
//     });
//   },

//   findById: async (id) => {
//     const [rows] = await db.query("SELECT * FROM templates_wa WHERE id = ?", [
//       id,
//     ]);
//     if (rows.length === 0) return null;
//     const row = rows[0];

//     let buttons = null;
//     if (row.buttons) {
//       try {
//         buttons =
//           typeof row.buttons === "string"
//             ? JSON.parse(row.buttons)
//             : row.buttons;
//       } catch (e) {
//         buttons = null;
//       }
//     }

//     let variables = null;
//     if (row.variables) {
//       try {
//         variables =
//           typeof row.variables === "string"
//             ? JSON.parse(row.variables)
//             : row.variables;
//       } catch (e) {
//         variables = null;
//       }
//     }

//     let carousel_cards = null;
//     if (row.carousel_cards) {
//       try {
//         carousel_cards =
//           typeof row.carousel_cards === "string"
//             ? JSON.parse(row.carousel_cards)
//             : row.carousel_cards;
//       } catch (e) {
//         carousel_cards = null;
//       }
//     }

//     return {
//       ...row,
//       buttons,
//       variables,
//       carousel_cards,
//     };
//   },

//   create: async (data) => {
//     const {
//       name,
//       category,
//       template_type,
//       language,
//       status,
//       header_type,
//       header_text,
//       header_media_url,
//       body,
//       footer,
//       buttons,
//       variables,
//       location_name,
//       location_address,
//       location_lat,
//       location_lng,
//       carousel_cards,
//       lto_has_expiry,
//       lto_expiration_time_ms,
//       lto_coupon_code,
//     } = data;

//     const values = [
//       name,
//       name,
//       category,
//       template_type || "TEXT",
//       language || "en",
//       status || "DRAFT",
//       header_type || null,
//       header_text || null,
//       header_media_url || null,
//       body,
//       footer || null,
//       buttons ? JSON.stringify(buttons) : null,
//       variables ? JSON.stringify(variables) : null,
//       location_name || null,
//       location_address || null,
//       location_lat || null,
//       location_lng || null,
//       carousel_cards ? JSON.stringify(carousel_cards) : null,
//       lto_has_expiry ? 1 : 0,
//       lto_expiration_time_ms || null,
//       lto_coupon_code || null,
//     ];

//     const [result] = await db.query(
//       `
//             INSERT INTO templates_wa
//             (name, label, category, template_type, language, status,
//              header_type, header_text, header_media_url,
//              body, footer, buttons, variables,
//              location_name, location_address, location_lat, location_lng,
//              carousel_cards, lto_has_expiry, lto_expiration_time_ms, lto_coupon_code,
//              created_at, updated_at)
//             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
//         `,
//       values,
//     );

//     return result.insertId;
//   },

//   update: async (id, data) => {
//     const fields = [];
//     const values = [];

//     for (const [key, value] of Object.entries(data)) {
//       if (
//         value !== undefined &&
//         key !== "id" &&
//         key !== "created_at" &&
//         key !== "label"
//       ) {
//         if (
//           key === "buttons" ||
//           key === "variables" ||
//           key === "carousel_cards"
//         ) {
//           fields.push(`${key} = ?`);
//           values.push(JSON.stringify(value));
//         } else if (key === "lto_has_expiry") {
//           fields.push(`${key} = ?`);
//           values.push(value ? 1 : 0);
//         } else {
//           fields.push(`${key} = ?`);
//           values.push(value);
//         }
//       }
//     }

//     if (fields.length === 0) return;

//     values.push(id);
//     await db.query(
//       `UPDATE templates_wa SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
//       values,
//     );
//     return Template.findById(id);
//   },

//   delete: async (id) => {
//     await db.query("DELETE FROM templates_wa WHERE id = ?", [id]);
//     return true;
//   },

//   updateStatus: async (id, status, rejection_reason = null, meta_id = null) => {
//     await db.query(
//       `UPDATE templates_wa SET status = ?, rejection_reason = ?, meta_id = ?, updated_at = NOW() WHERE id = ?`,
//       [status, rejection_reason, meta_id, id],
//     );
//     return Template.findById(id);
//   },

//   findPending: async () => {
//     const [rows] = await db.query(
//       `SELECT * FROM templates_wa WHERE status IN ('PENDING', 'IN_APPEAL')`,
//     );
//     return rows;
//   },
// };

// module.exports = Template;

// const db = require("../config/database");

// const Template = {
//   findAll: async () => {
//     try {
//       const [rows] = await db.query(
//         `SELECT * FROM templates_wa ORDER BY created_at DESC`,
//       );
//       return rows.map((row) => Template._parseRow(row));
//     } catch (error) {
//       console.error("Error in findAll:", error);
//       throw error;
//     }
//   },

//   findById: async (id) => {
//     try {
//       const [rows] = await db.query("SELECT * FROM templates_wa WHERE id = ?", [
//         id,
//       ]);
//       if (rows.length === 0) return null;
//       return Template._parseRow(rows[0]);
//     } catch (error) {
//       console.error("Error in findById:", error);
//       throw error;
//     }
//   },

//   // Helper method to parse JSON fields
//   _parseRow: (row) => {
//     let buttons = null;
//     if (row.buttons) {
//       try {
//         buttons =
//           typeof row.buttons === "string"
//             ? JSON.parse(row.buttons)
//             : row.buttons;
//       } catch (e) {
//         console.error("Error parsing buttons:", e);
//         buttons = null;
//       }
//     }

//     let variables = null;
//     if (row.variables) {
//       try {
//         variables =
//           typeof row.variables === "string"
//             ? JSON.parse(row.variables)
//             : row.variables;
//       } catch (e) {
//         console.error("Error parsing variables:", e);
//         variables = null;
//       }
//     }

//     let carousel_cards = null;
//     if (row.carousel_cards) {
//       try {
//         carousel_cards =
//           typeof row.carousel_cards === "string"
//             ? JSON.parse(row.carousel_cards)
//             : row.carousel_cards;
//       } catch (e) {
//         console.error("Error parsing carousel_cards:", e);
//         carousel_cards = null;
//       }
//     }

//     return {
//       ...row,
//       buttons,
//       variables,
//       carousel_cards,
//     };
//   },

//   create: async (data) => {
//     try {
//       const {
//         name,
//         category,
//         template_type,
//         language,
//         status,
//         header_type,
//         header_text,
//         header_media_url,
//         body,
//         footer,
//         buttons,
//         variables,
//         location_name,
//         location_address,
//         location_lat,
//         location_lng,
//         carousel_cards,
//         lto_has_expiry,
//         lto_expiration_time_ms,
//         lto_coupon_code,
//       } = data;

//       const [result] = await db.query(
//         `INSERT INTO templates_wa
//         (name, label, category, template_type, language, status,
//          header_type, header_text, header_media_url,
//          body, footer, buttons, variables,
//          location_name, location_address, location_lat, location_lng,
//          carousel_cards, lto_has_expiry, lto_expiration_time_ms, lto_coupon_code,
//          created_at, updated_at)
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
//         [
//           name,
//           name,
//           category || "UTILITY",
//           template_type || "TEXT",
//           language || "en",
//           status || "DRAFT",
//           header_type || null,
//           header_text || null,
//           header_media_url || null,
//           body,
//           footer || null,
//           buttons ? JSON.stringify(buttons) : null,
//           variables ? JSON.stringify(variables) : null,
//           location_name || null,
//           location_address || null,
//           location_lat || null,
//           location_lng || null,
//           carousel_cards ? JSON.stringify(carousel_cards) : null,
//           lto_has_expiry ? 1 : 0,
//           lto_expiration_time_ms || null,
//           lto_coupon_code || null,
//         ],
//       );

//       return result.insertId;
//     } catch (error) {
//       console.error("Error in create:", error);
//       throw error;
//     }
//   },

//   update: async (id, data) => {
//     try {
//       const fields = [];
//       const values = [];

//       for (const [key, value] of Object.entries(data)) {
//         if (
//           value !== undefined &&
//           key !== "id" &&
//           key !== "created_at" &&
//           key !== "label"
//         ) {
//           if (
//             key === "buttons" ||
//             key === "variables" ||
//             key === "carousel_cards"
//           ) {
//             fields.push(`${key} = ?`);
//             values.push(JSON.stringify(value));
//           } else if (key === "lto_has_expiry") {
//             fields.push(`${key} = ?`);
//             values.push(value ? 1 : 0);
//           } else {
//             fields.push(`${key} = ?`);
//             values.push(value);
//           }
//         }
//       }

//       if (fields.length === 0) return null;

//       values.push(id);
//       await db.query(
//         `UPDATE templates_wa SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
//         values,
//       );
//       return Template.findById(id);
//     } catch (error) {
//       console.error("Error in update:", error);
//       throw error;
//     }
//   },

//   delete: async (id) => {
//     try {
//       await db.query("DELETE FROM templates_wa WHERE id = ?", [id]);
//       return true;
//     } catch (error) {
//       console.error("Error in delete:", error);
//       throw error;
//     }
//   },

//   updateStatus: async (id, status, rejection_reason = null, meta_id = null) => {
//     try {
//       await db.query(
//         `UPDATE templates_wa
//          SET status = ?, rejection_reason = ?, meta_id = ?, updated_at = NOW()
//          WHERE id = ?`,
//         [status, rejection_reason, meta_id, id],
//       );
//       return Template.findById(id);
//     } catch (error) {
//       console.error("Error in updateStatus:", error);
//       throw error;
//     }
//   },

//   findPending: async () => {
//     try {
//       const [rows] = await db.query(
//         `SELECT * FROM templates_wa WHERE status IN ('PENDING', 'IN_APPEAL', 'DRAFT', 'REJECTED')`,
//       );
//       return rows.map((row) => Template._parseRow(row));
//     } catch (error) {
//       console.error("Error in findPending:", error);
//       throw error;
//     }
//   },

//   // Find by status
//   findByStatus: async (statuses) => {
//     try {
//       const placeholders = statuses.map(() => "?").join(", ");
//       const [rows] = await db.query(
//         `SELECT * FROM templates_wa WHERE status IN (${placeholders})`,
//         statuses,
//       );
//       return rows.map((row) => Template._parseRow(row));
//     } catch (error) {
//       console.error("Error in findByStatus:", error);
//       throw error;
//     }
//   },

//   // Find by category
//   findByCategory: async (category) => {
//     try {
//       const [rows] = await db.query(
//         `SELECT * FROM templates_wa WHERE category = ? ORDER BY created_at DESC`,
//         [category],
//       );
//       return rows.map((row) => Template._parseRow(row));
//     } catch (error) {
//       console.error("Error in findByCategory:", error);
//       throw error;
//     }
//   },

//   // Search templates
//   search: async (query) => {
//     try {
//       const [rows] = await db.query(
//         `SELECT * FROM templates_wa
//          WHERE name LIKE ? OR body LIKE ?
//          ORDER BY created_at DESC`,
//         [`%${query}%`, `%${query}%`],
//       );
//       return rows.map((row) => Template._parseRow(row));
//     } catch (error) {
//       console.error("Error in search:", error);
//       throw error;
//     }
//   },
// };

// module.exports = Template;

const db = require("../config/database");

const Template = {
  findAll: async () => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM templates_wa ORDER BY created_at DESC`,
      );
      return rows.map((row) => Template._parseRow(row));
    } catch (error) {
      console.error("Error in findAll:", error);
      throw error;
    }
  },

  findById: async (id) => {
    try {
      const [rows] = await db.query("SELECT * FROM templates_wa WHERE id = ?", [
        id,
      ]);
      if (rows.length === 0) return null;
      return Template._parseRow(rows[0]);
    } catch (error) {
      console.error("Error in findById:", error);
      throw error;
    }
  },

  findByName: async (name) => {
    try {
      const [rows] = await db.query(
        "SELECT * FROM templates_wa WHERE name = ?",
        [name],
      );
      if (rows.length === 0) return null;
      return Template._parseRow(rows[0]);
    } catch (error) {
      console.error("Error in findByName:", error);
      throw error;
    }
  },

  findByMetaId: async (metaId) => {
    try {
      const [rows] = await db.query(
        "SELECT * FROM templates_wa WHERE meta_id = ? OR meta_template_id = ?",
        [metaId, metaId],
      );
      if (rows.length === 0) return null;
      return Template._parseRow(rows[0]);
    } catch (error) {
      console.error("Error in findByMetaId:", error);
      throw error;
    }
  },

  // Helper method to parse JSON fields
  _parseRow: (row) => {
    let buttons = null;
    if (row.buttons) {
      try {
        buttons =
          typeof row.buttons === "string"
            ? JSON.parse(row.buttons)
            : row.buttons;
      } catch (e) {
        console.error("Error parsing buttons:", e);
        buttons = null;
      }
    }

    let variables = null;
    if (row.variables) {
      try {
        variables =
          typeof row.variables === "string"
            ? JSON.parse(row.variables)
            : row.variables;
      } catch (e) {
        console.error("Error parsing variables:", e);
        variables = null;
      }
    }

    let carousel_cards = null;
    if (row.carousel_cards) {
      try {
        carousel_cards =
          typeof row.carousel_cards === "string"
            ? JSON.parse(row.carousel_cards)
            : row.carousel_cards;
      } catch (e) {
        console.error("Error parsing carousel_cards:", e);
        carousel_cards = null;
      }
    }

    return {
      id: row.id,
      name: row.name,
      label: row.label,
      category: row.category,
      template_type: row.template_type,
      language: row.language,
      body: row.body,
      footer: row.footer,
      buttons,
      variables,
      header_type: row.header_type,
      header_text: row.header_text,
      header_media_url: row.header_media_url,
      status: row.status,
      rejection_reason: row.rejection_reason,
      meta_id: row.meta_id,
      usage_count: row.usage_count,
      last_used: row.last_used,
      created_at: row.created_at,
      updated_at: row.updated_at,
      location_name: row.location_name,
      location_address: row.location_address,
      location_lat: row.location_lat,
      location_lng: row.location_lng,
      carousel_cards,
      lto_has_expiry: row.lto_has_expiry === 1,
      lto_expiration_time_ms: row.lto_expiration_time_ms,
      lto_coupon_code: row.lto_coupon_code,
      meta_template_id: row.meta_template_id,
    };
  },

  create: async (data) => {
    try {
      const {
        name,
        label,
        category,
        template_type,
        language,
        status,
        header_type,
        header_text,
        header_media_url,
        body,
        footer,
        buttons,
        variables,
        location_name,
        location_address,
        location_lat,
        location_lng,
        carousel_cards,
        lto_has_expiry,
        lto_expiration_time_ms,
        lto_coupon_code,
        meta_template_id,
      } = data;

      const [result] = await db.query(
        `INSERT INTO templates_wa 
        (name, label, category, template_type, language, status,
         header_type, header_text, header_media_url,
         body, footer, buttons, variables,
         location_name, location_address, location_lat, location_lng,
         carousel_cards, lto_has_expiry, lto_expiration_time_ms, lto_coupon_code,
         meta_template_id, usage_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
        [
          name,
          label || name,
          category || "UTILITY",
          template_type || "TEXT",
          language || "en",
          status || "DRAFT",
          header_type || null,
          header_text || null,
          header_media_url || null,
          body,
          footer || null,
          buttons ? JSON.stringify(buttons) : null,
          variables ? JSON.stringify(variables) : null,
          location_name || null,
          location_address || null,
          location_lat || null,
          location_lng || null,
          carousel_cards ? JSON.stringify(carousel_cards) : null,
          lto_has_expiry ? 1 : 0,
          lto_expiration_time_ms || null,
          lto_coupon_code || null,
          meta_template_id || null,
        ],
      );

      return result.insertId;
    } catch (error) {
      console.error("Error in create:", error);
      throw error;
    }
  },

  update: async (id, data) => {
    try {
      const fields = [];
      const values = [];

      const allowedFields = [
        "name",
        "label",
        "category",
        "template_type",
        "language",
        "status",
        "header_type",
        "header_text",
        "header_media_url",
        "body",
        "footer",
        "buttons",
        "variables",
        "location_name",
        "location_address",
        "location_lat",
        "location_lng",
        "carousel_cards",
        "lto_has_expiry",
        "lto_expiration_time_ms",
        "lto_coupon_code",
        "meta_template_id",
        "rejection_reason",
        "meta_id",
      ];

      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && allowedFields.includes(key)) {
          if (
            key === "buttons" ||
            key === "variables" ||
            key === "carousel_cards"
          ) {
            fields.push(`${key} = ?`);
            values.push(JSON.stringify(value));
          } else if (key === "lto_has_expiry") {
            fields.push(`${key} = ?`);
            values.push(value ? 1 : 0);
          } else {
            fields.push(`${key} = ?`);
            values.push(value);
          }
        }
      }

      if (fields.length === 0) return null;

      values.push(id);
      await db.query(
        `UPDATE templates_wa SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
        values,
      );
      return Template.findById(id);
    } catch (error) {
      console.error("Error in update:", error);
      throw error;
    }
  },

  delete: async (id) => {
    try {
      await db.query("DELETE FROM templates_wa WHERE id = ?", [id]);
      return true;
    } catch (error) {
      console.error("Error in delete:", error);
      throw error;
    }
  },

  updateStatus: async (
    id,
    status,
    rejection_reason = null,
    meta_id = null,
    meta_template_id = null,
  ) => {
    try {
      await db.query(
        `UPDATE templates_wa 
         SET status = ?, rejection_reason = ?, meta_id = ?, meta_template_id = ?, updated_at = NOW() 
         WHERE id = ?`,
        [status, rejection_reason, meta_id, meta_template_id, id],
      );
      return Template.findById(id);
    } catch (error) {
      console.error("Error in updateStatus:", error);
      throw error;
    }
  },

  findPending: async () => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM templates_wa WHERE status IN ('PENDING', 'IN_APPEAL') ORDER BY created_at DESC`,
      );
      return rows.map((row) => Template._parseRow(row));
    } catch (error) {
      console.error("Error in findPending:", error);
      throw error;
    }
  },

  findByStatus: async (statuses) => {
    try {
      const placeholders = statuses.map(() => "?").join(", ");
      const [rows] = await db.query(
        `SELECT * FROM templates_wa WHERE status IN (${placeholders}) ORDER BY created_at DESC`,
        statuses,
      );
      return rows.map((row) => Template._parseRow(row));
    } catch (error) {
      console.error("Error in findByStatus:", error);
      throw error;
    }
  },

  findByCategory: async (category) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM templates_wa WHERE category = ? ORDER BY created_at DESC`,
        [category],
      );
      return rows.map((row) => Template._parseRow(row));
    } catch (error) {
      console.error("Error in findByCategory:", error);
      throw error;
    }
  },

  findApproved: async () => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM templates_wa WHERE status = 'APPROVED' ORDER BY created_at DESC`,
      );
      return rows.map((row) => Template._parseRow(row));
    } catch (error) {
      console.error("Error in findApproved:", error);
      throw error;
    }
  },

  search: async (query) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM templates_wa 
         WHERE name LIKE ? OR label LIKE ? OR body LIKE ? 
         ORDER BY created_at DESC`,
        [`%${query}%`, `%${query}%`, `%${query}%`],
      );
      return rows.map((row) => Template._parseRow(row));
    } catch (error) {
      console.error("Error in search:", error);
      throw error;
    }
  },

  getUsageStats: async (id) => {
    try {
      const [rows] = await db.query(
        `SELECT 
          COUNT(*) as total_used,
          SUM(sent_count) as total_sent,
          SUM(delivered_count) as total_delivered,
          SUM(read_count) as total_read,
          SUM(failed_count) as total_failed
         FROM campaigns 
         WHERE template_id = ?`,
        [id],
      );
      return (
        rows[0] || {
          total_used: 0,
          total_sent: 0,
          total_delivered: 0,
          total_read: 0,
          total_failed: 0,
        }
      );
    } catch (error) {
      console.error("Error in getUsageStats:", error);
      throw error;
    }
  },

  incrementUsage: async (id) => {
    try {
      await db.query(
        `UPDATE templates_wa SET usage_count = usage_count + 1, last_used = NOW() WHERE id = ?`,
        [id],
      );
    } catch (error) {
      console.error("Error in incrementUsage:", error);
      throw error;
    }
  },

  // Get all templates with pagination
  getPaginated: async (limit = 20, offset = 0, filters = {}) => {
    try {
      let query = `SELECT * FROM templates_wa WHERE 1=1`;
      const params = [];

      if (filters.status) {
        query += ` AND status = ?`;
        params.push(filters.status);
      }

      if (filters.category) {
        query += ` AND category = ?`;
        params.push(filters.category);
      }

      if (filters.search) {
        query += ` AND (name LIKE ? OR label LIKE ? OR body LIKE ?)`;
        params.push(
          `%${filters.search}%`,
          `%${filters.search}%`,
          `%${filters.search}%`,
        );
      }

      query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const [rows] = await db.query(query, params);
      return rows.map((row) => Template._parseRow(row));
    } catch (error) {
      console.error("Error in getPaginated:", error);
      throw error;
    }
  },

  // Get total count for pagination
  getCount: async (filters = {}) => {
    try {
      let query = `SELECT COUNT(*) as total FROM templates_wa WHERE 1=1`;
      const params = [];

      if (filters.status) {
        query += ` AND status = ?`;
        params.push(filters.status);
      }

      if (filters.category) {
        query += ` AND category = ?`;
        params.push(filters.category);
      }

      if (filters.search) {
        query += ` AND (name LIKE ? OR label LIKE ? OR body LIKE ?)`;
        params.push(
          `%${filters.search}%`,
          `%${filters.search}%`,
          `%${filters.search}%`,
        );
      }

      const [rows] = await db.query(query, params);
      return rows[0].total;
    } catch (error) {
      console.error("Error in getCount:", error);
      throw error;
    }
  },
};

module.exports = Template;