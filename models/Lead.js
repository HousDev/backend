
// const db = require("../config/database");

// class Lead {
//   // ✅ Helper function for mapping row
//   static mapLeadRow(row) {
//     return {
//       ...row,
//       assigned_executive_name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
//     };
//   }

// // ===========================
// // CREATE with duplicate check
// // ===========================
// static async create(leadData) {
//   const {
//     salutation,
//     name,
//     phone,
//     email,
//     lead_type,
//     priority,
//     lead_source,
//     whatsapp_number,
//     state,
//     city,
//     location,
//     status,
//     assigned_executive,
//     created_by,
//     updated_by
//   } = leadData;

//   // 🔹 Email duplicate check
//   if (email) {
//     const [emailExists] = await db.execute(
//       "SELECT id FROM client_leads WHERE email = ?",
//       [email]
//     );
//     if (emailExists.length > 0) {
//       throw new Error("Duplicate email already exists");
//     }
//   }

//   // 🔹 Phone duplicate check
//   if (phone) {
//     const [phoneExists] = await db.execute(
//       "SELECT id FROM client_leads WHERE phone = ?",
//       [phone]
//     );
//     if (phoneExists.length > 0) {
//       throw new Error("Duplicate phone number already exists");
//     }
//   }

//   try {
//     const [result] = await db.execute(
//       `INSERT INTO client_leads (
//         salutation, name, phone, email, lead_type, lead_source,
//         whatsapp_number, state, city, location, status, assigned_executive,
//         created_by, updated_by, priority
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//       [
//         salutation,
//         name,
//         phone,
//         email,
//         lead_type,
//         lead_source,
//         whatsapp_number,
//         state,
//         city,
//         location,
//         status,
//         assigned_executive,
//         created_by,
//         updated_by,
//         priority
//       ]
//     );

//     return this.findById(result.insertId);
//   } catch (err) {
//     if (err.code === "ER_DUP_ENTRY") {
//       throw new Error("Duplicate email or phone already exists");
//     }
//     throw err;
//   }
// }


//   // ===========================
//   // GET ALL
//   // ===========================
//   static async findAll() {
//     const [rows] = await db.execute(
//       `SELECT l.*,
//               ae.first_name AS assigned_first_name, ae.last_name AS assigned_last_name,
//               cu.first_name AS created_first_name, cu.last_name AS created_last_name,
//               uu.first_name AS updated_first_name, uu.last_name AS updated_last_name
//        FROM client_leads l
//        LEFT JOIN users ae ON l.assigned_executive = ae.id
//        LEFT JOIN users cu ON l.created_by = cu.id
//        LEFT JOIN users uu ON l.updated_by = uu.id
//        ORDER BY l.created_at DESC`
//     );

//     return rows.map(row => ({
//       ...row,
//       assigned_executive_name: `${row.assigned_first_name || ""} ${row.assigned_last_name || ""}`.trim(),
//       created_by_name: `${row.created_first_name || ""} ${row.created_last_name || ""}`.trim(),
//       updated_by_name: `${row.updated_first_name || ""} ${row.updated_last_name || ""}`.trim(),
//     }));
//   }

//   // ===========================
//   // GET BY ID
//   // ===========================
//   static async findById(id) {
//     const [rows] = await db.execute(
//       `SELECT l.*,
//               ae.first_name AS assigned_first_name, ae.last_name AS assigned_last_name,
//               cu.first_name AS created_first_name, cu.last_name AS created_last_name,
//               uu.first_name AS updated_first_name, uu.last_name AS updated_last_name
//        FROM client_leads l
//        LEFT JOIN users ae ON l.assigned_executive = ae.id
//        LEFT JOIN users cu ON l.created_by = cu.id
//        LEFT JOIN users uu ON l.updated_by = uu.id
//        WHERE l.id = ?`,
//       [id]
//     );

//     if (!rows.length) return null;

//     const row = rows[0];
//     return {
//       ...row,
//       assigned_executive_name: `${row.assigned_first_name || ""} ${row.assigned_last_name || ""}`.trim(),
//       created_by_name: `${row.created_first_name || ""} ${row.created_last_name || ""}`.trim(),
//       updated_by_name: `${row.updated_first_name || ""} ${row.updated_last_name || ""}`.trim(),
//     };
//   }

// // ===========================
// // UPDATE with duplicate check
// // ===========================
// static async update(id, leadData) {
//   const cleanData = Object.fromEntries(
//     Object.entries(leadData).map(([k, v]) => [k, v === undefined ? null : v])
//   );
//   cleanData.updated_at = new Date();

//   // 🔹 Email duplicate check
//   if (cleanData.email) {
//     const [emailExists] = await db.execute(
//       "SELECT id FROM client_leads WHERE email = ? AND id != ?",
//       [cleanData.email, id]
//     );
//     if (emailExists.length > 0) {
//       throw new Error("Duplicate email already exists");
//     }
//   }

//   // 🔹 Phone duplicate check
//   if (cleanData.phone) {
//     const [phoneExists] = await db.execute(
//       "SELECT id FROM client_leads WHERE phone = ? AND id != ?",
//       [cleanData.phone, id]
//     );
//     if (phoneExists.length > 0) {
//       throw new Error("Duplicate phone number already exists");
//     }
//   }

//   // Build query dynamically
//   const fields = [];
//   const values = [];

//   for (const [key, value] of Object.entries(cleanData)) {
//     if (key === "name" && (value === null || value === "")) {
//       continue; // don't overwrite name if not provided
//     }
//     fields.push(`${key} = ?`);
//     values.push(value);
//   }

//   if (!fields.length) {
//     throw new Error("No valid fields to update");
//   }

//   const sql = `UPDATE client_leads SET ${fields.join(", ")} WHERE id = ?`;
//   values.push(id);

//   try {
//     await db.execute(sql, values);
//     return this.findById(id);
//   } catch (err) {
//     if (err.code === "ER_DUP_ENTRY") {
//       throw new Error("Duplicate email or phone already exists");
//     }
//     throw err;
//   }
// }


//   // ===========================
//   // DELETE
//   // ===========================
//   static async delete(id) {
//     await db.execute("DELETE FROM client_leads WHERE id = ?", [id]);
//     return true;
//   }

//   // ===========================
//   // MASTER DATA
//   // ===========================
//   static async getMasterData(type) {
//     const tableName = `master_${type.replace(" ", "_")}`;
//     const [rows] = await db.execute(
//       `SELECT id, value as label FROM ${tableName} ORDER BY value`
//     );
//     return rows;
//   }

//   static async updateAssignedExecutive(id, assigned_executive) {
//     const [result] = await db.execute(
//       `UPDATE client_leads SET assigned_executive = ? WHERE id = ?`,
//       [assigned_executive, id]
//     );
//     return result.affectedRows > 0;
//   }

//   static async findByIds(ids) {
//     if (!ids || ids.length === 0) return [];

//     const placeholders = ids.map(() => "?").join(",");
//     const [rows] = await db.execute(
//       `SELECT l.*, u.first_name, u.last_name
//        FROM client_leads l
//        LEFT JOIN users u ON l.assigned_executive = u.id
//        WHERE l.id IN (${placeholders})`,
//       ids
//     );

//     return rows.map(this.mapLeadRow);
//   }

//   static async bulkUpdateStatus(ids, status) {
//     if (!ids || ids.length === 0) return [];

//     const placeholders = ids.map(() => "?").join(",");
//     await db.execute(
//       `UPDATE client_leads SET status = ? WHERE id IN (${placeholders})`,
//       [status, ...ids]
//     );

//     return true;
//   }

//   static async bulkDelete(ids) {
//     if (!ids || ids.length === 0) return;

//     const placeholders = ids.map(() => "?").join(",");
//     const sql = `DELETE FROM client_leads WHERE id IN (${placeholders})`;
//     await db.query(sql, ids);

//     return true;
//   }
// }

// module.exports = Lead;




// const db = require("../config/database");

// class Lead {
//   // ✅ Helper function for mapping row
//   static mapLeadRow(row) {
//     return {
//       ...row,
//       assigned_executive_name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
//     };
//   }

// // ===========================
// // CREATE with duplicate check
// // ===========================
// static async create(leadData) {
//   const {
//     salutation,
//     name,
//     phone,
//     email,
//     lead_type,
//     priority,
//     lead_source,
//     whatsapp_number,
//     state,
//     city,
//     location,
//     status,
//     assigned_executive,
//     created_by,
//     updated_by
//   } = leadData;

//   // 🔹 Email duplicate check
//   if (email) {
//     const [emailExists] = await db.execute(
//       "SELECT id FROM client_leads WHERE email = ?",
//       [email]
//     );
//     if (emailExists.length > 0) {
//       throw new Error("Duplicate email already exists");
//     }
//   }

//   // 🔹 Phone duplicate check
//   if (phone) {
//     const [phoneExists] = await db.execute(
//       "SELECT id FROM client_leads WHERE phone = ?",
//       [phone]
//     );
//     if (phoneExists.length > 0) {
//       throw new Error("Duplicate phone number already exists");
//     }
//   }

//   try {
//     const [result] = await db.execute(
//       `INSERT INTO client_leads (
//         salutation, name, phone, email, lead_type, lead_source,
//         whatsapp_number, state, city, location, status, assigned_executive,
//         created_by, updated_by, priority
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//       [
//         salutation,
//         name,
//         phone,
//         email,
//         lead_type,
//         lead_source,
//         whatsapp_number,
//         state,
//         city,
//         location,
//         status,
//         assigned_executive,
//         created_by,
//         updated_by,
//         priority
//       ]
//     );

//     return this.findById(result.insertId);
//   } catch (err) {
//     if (err.code === "ER_DUP_ENTRY") {
//       throw new Error("Duplicate email or phone already exists");
//     }
//     throw err;
//   }
// }

//   // ===========================
//   // GET ALL (Updated to hide transferred leads)
//   // ===========================
//   static async findAll() {
//     const [rows] = await db.execute(
//       `SELECT l.*,
//               ae.first_name AS assigned_first_name, ae.last_name AS assigned_last_name,
//               cu.first_name AS created_first_name, cu.last_name AS created_last_name,
//               uu.first_name AS updated_first_name, uu.last_name AS updated_last_name
//        FROM client_leads l
//        LEFT JOIN users ae ON l.assigned_executive = ae.id
//        LEFT JOIN users cu ON l.created_by = cu.id
//        LEFT JOIN users uu ON l.updated_by = uu.id
//        WHERE (l.transferred_to_buyer != 1 OR l.transferred_to_buyer IS NULL)
//        ORDER BY l.created_at DESC`
//     );

//     return rows.map(row => ({
//       ...row,
//       assigned_executive_name: `${row.assigned_first_name || ""} ${row.assigned_last_name || ""}`.trim(),
//       created_by_name: `${row.created_first_name || ""} ${row.created_last_name || ""}`.trim(),
//       updated_by_name: `${row.updated_first_name || ""} ${row.updated_last_name || ""}`.trim(),
//     }));
//   }

//   // ===========================
//   // GET ALL INCLUDING TRANSFERRED (New method for admin/reports)
//   // ===========================
//   static async findAllIncludingTransferred() {
//     const [rows] = await db.execute(
//       `SELECT l.*,
//               ae.first_name AS assigned_first_name, ae.last_name AS assigned_last_name,
//               cu.first_name AS created_first_name, cu.last_name AS created_last_name,
//               uu.first_name AS updated_first_name, uu.last_name AS updated_last_name
//        FROM client_leads l
//        LEFT JOIN users ae ON l.assigned_executive = ae.id
//        LEFT JOIN users cu ON l.created_by = cu.id
//        LEFT JOIN users uu ON l.updated_by = uu.id
//        ORDER BY l.created_at DESC`
//     );

//     return rows.map(row => ({
//       ...row,
//       assigned_executive_name: `${row.assigned_first_name || ""} ${row.assigned_last_name || ""}`.trim(),
//       created_by_name: `${row.created_first_name || ""} ${row.created_last_name || ""}`.trim(),
//       updated_by_name: `${row.updated_first_name || ""} ${row.updated_last_name || ""}`.trim(),
//     }));
//   }

//   // ===========================
//   // GET ONLY TRANSFERRED LEADS
//   // ===========================
//   static async findTransferredLeads() {
//     const [rows] = await db.execute(
//       `SELECT l.*,
//               ae.first_name AS assigned_first_name, ae.last_name AS assigned_last_name,
//               cu.first_name AS created_first_name, cu.last_name AS created_last_name,
//               uu.first_name AS updated_first_name, uu.last_name AS updated_last_name,
//               tb.first_name AS transferred_by_first_name, tb.last_name AS transferred_by_last_name
//        FROM client_leads l
//        LEFT JOIN users ae ON l.assigned_executive = ae.id
//        LEFT JOIN users cu ON l.created_by = cu.id
//        LEFT JOIN users uu ON l.updated_by = uu.id
//        LEFT JOIN users tb ON l.transferred_to_buyer_by = tb.id
//        WHERE l.transferred_to_buyer = 1
//        ORDER BY l.transferred_to_buyer_at DESC`
//     );

//     return rows.map(row => ({
//       ...row,
//       assigned_executive_name: `${row.assigned_first_name || ""} ${row.assigned_last_name || ""}`.trim(),
//       created_by_name: `${row.created_first_name || ""} ${row.created_last_name || ""}`.trim(),
//       updated_by_name: `${row.updated_first_name || ""} ${row.updated_last_name || ""}`.trim(),
//       transferred_by_name: `${row.transferred_by_first_name || ""} ${row.transferred_by_last_name || ""}`.trim(),
//     }));
//   }

//   // ===========================
//   // GET BY ID
//   // ===========================
//   static async findById(id) {
//     const [rows] = await db.execute(
//       `SELECT l.*,
//               ae.first_name AS assigned_first_name, ae.last_name AS assigned_last_name,
//               cu.first_name AS created_first_name, cu.last_name AS created_last_name,
//               uu.first_name AS updated_first_name, uu.last_name AS updated_last_name
//        FROM client_leads l
//        LEFT JOIN users ae ON l.assigned_executive = ae.id
//        LEFT JOIN users cu ON l.created_by = cu.id
//        LEFT JOIN users uu ON l.updated_by = uu.id
//        WHERE l.id = ?`,
//       [id]
//     );

//     if (!rows.length) return null;

//     const row = rows[0];
//     return {
//       ...row,
//       assigned_executive_name: `${row.assigned_first_name || ""} ${row.assigned_last_name || ""}`.trim(),
//       created_by_name: `${row.created_first_name || ""} ${row.created_last_name || ""}`.trim(),
//       updated_by_name: `${row.updated_first_name || ""} ${row.updated_last_name || ""}`.trim(),
//     };
//   }

// // ===========================
// // UPDATE with duplicate check
// // ===========================
// static async update(id, leadData) {
//   const cleanData = Object.fromEntries(
//     Object.entries(leadData).map(([k, v]) => [k, v === undefined ? null : v])
//   );
//   cleanData.updated_at = new Date();

//   // 🔹 Email duplicate check
//   if (cleanData.email) {
//     const [emailExists] = await db.execute(
//       "SELECT id FROM client_leads WHERE email = ? AND id != ?",
//       [cleanData.email, id]
//     );
//     if (emailExists.length > 0) {
//       throw new Error("Duplicate email already exists");
//     }
//   }

//   // 🔹 Phone duplicate check
//   if (cleanData.phone) {
//     const [phoneExists] = await db.execute(
//       "SELECT id FROM client_leads WHERE phone = ? AND id != ?",
//       [cleanData.phone, id]
//     );
//     if (phoneExists.length > 0) {
//       throw new Error("Duplicate phone number already exists");
//     }
//   }

//   // Build query dynamically
//   const fields = [];
//   const values = [];

//   for (const [key, value] of Object.entries(cleanData)) {
//     if (key === "name" && (value === null || value === "")) {
//       continue; // don't overwrite name if not provided
//     }
//     fields.push(`${key} = ?`);
//     values.push(value);
//   }

//   if (!fields.length) {
//     throw new Error("No valid fields to update");
//   }

//   const sql = `UPDATE client_leads SET ${fields.join(", ")} WHERE id = ?`;
//   values.push(id);

//   try {
//     await db.execute(sql, values);
//     return this.findById(id);
//   } catch (err) {
//     if (err.code === "ER_DUP_ENTRY") {
//       throw new Error("Duplicate email or phone already exists");
//     }
//     throw err;
//   }
// }

//   // ===========================
//   // TRANSFER TO BUYER
//   // ===========================
//   static async transferToBuyer(id, transferredBy) {
//     const [result] = await db.execute(
//       `UPDATE client_leads
//        SET transferred_to_buyer = 1,
//            transferred_to_buyer_at = NOW(),
//            transferred_to_buyer_by = ?
//        WHERE id = ?`,
//       [transferredBy, id]
//     );
//     return result.affectedRows > 0;
//   }

//   // ===========================
//   // BULK TRANSFER TO BUYER
//   // ===========================
//   static async bulkTransferToBuyer(ids, transferredBy) {
//     if (!ids || ids.length === 0) return false;

//     const placeholders = ids.map(() => "?").join(",");
//     const [result] = await db.execute(
//       `UPDATE client_leads
//        SET transferred_to_buyer = 1,
//            transferred_to_buyer_at = NOW(),
//            transferred_to_buyer_by = ?
//        WHERE id IN (${placeholders})`,
//       [transferredBy, ...ids]
//     );
//     return result.affectedRows > 0;
//   }

//   // ===========================
//   // DELETE
//   // ===========================
//   static async delete(id) {
//     await db.execute("DELETE FROM client_leads WHERE id = ?", [id]);
//     return true;
//   }

//   // ===========================
//   // MASTER DATA
//   // ===========================
//   static async getMasterData(type) {
//     const tableName = `master_${type.replace(" ", "_")}`;
//     const [rows] = await db.execute(
//       `SELECT id, value as label FROM ${tableName} ORDER BY value`
//     );
//     return rows;
//   }

//   static async updateAssignedExecutive(id, assigned_executive) {
//     const [result] = await db.execute(
//       `UPDATE client_leads SET assigned_executive = ? WHERE id = ?`,
//       [assigned_executive, id]
//     );
//     return result.affectedRows > 0;
//   }

//   static async findByIds(ids) {
//     if (!ids || ids.length === 0) return [];

//     const placeholders = ids.map(() => "?").join(",");
//     const [rows] = await db.execute(
//       `SELECT l.*, u.first_name, u.last_name
//        FROM client_leads l
//        LEFT JOIN users u ON l.assigned_executive = u.id
//        WHERE l.id IN (${placeholders})
//        AND (l.transferred_to_buyer != 1 OR l.transferred_to_buyer IS NULL)`,
//       ids
//     );

//     return rows.map(this.mapLeadRow);
//   }

//   static async bulkUpdateStatus(ids, status) {
//     if (!ids || ids.length === 0) return [];

//     const placeholders = ids.map(() => "?").join(",");
//     await db.execute(
//       `UPDATE client_leads SET status = ? WHERE id IN (${placeholders})`,
//       [status, ...ids]
//     );

//     return true;
//   }

//   static async bulkDelete(ids) {
//     if (!ids || ids.length === 0) return;

//     const placeholders = ids.map(() => "?").join(",");
//     const sql = `DELETE FROM client_leads WHERE id IN (${placeholders})`;
//     await db.query(sql, ids);

//     return true;
//   }
// }

// module.exports = Lead;



//  static async create(leadData) {
//     const {
//       salutation,
//       name,
//       phone,
//       email,
//       lead_type,
//       priority,
//       lead_source,
//       whatsapp_number,
//       state,
//       city,
//       location,
//       status,
//       assigned_executive,
//       created_by,
//       updated_by,
//     } = leadData;

//     // 🔹 Email duplicate check
//     if (email) {
//       const [emailExists] = await db.execute(
//         "SELECT id FROM client_leads WHERE email = ?",
//         [email]
//       );
//       if (emailExists.length > 0) {
//         throw new Error("Duplicate email already exists");
//       }
//     }

//     // 🔹 Phone duplicate check
//     if (phone) {
//       const [phoneExists] = await db.execute(
//         "SELECT id FROM client_leads WHERE phone = ?",
//         [phone]
//       );
//       if (phoneExists.length > 0) {
//         throw new Error("Duplicate phone number already exists");
//       }
//     }

//     try {
//       const [result] = await db.execute(
//         `INSERT INTO client_leads (
//           salutation, name, phone, email, lead_type, lead_source,
//           whatsapp_number, state, city, location, status, assigned_executive,
//           created_by, updated_by, priority
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//         [
//           salutation,
//           name,
//           phone,
//           email,
//           lead_type,
//           lead_source,
//           whatsapp_number,
//           state,
//           city,
//           location,
//           status,
//           assigned_executive,
//           created_by,
//           updated_by,
//           priority,
//         ]
//       );

//       return this.findById(result.insertId);
//     } catch (err) {
//       if (err.code === "ER_DUP_ENTRY") {
//         throw new Error("Duplicate email or phone already exists");
//       }
//       throw err;
//     }
//   }




const db = require("../config/database");

class Lead {
  // ✅ Helper function for mapping row
  static mapLeadRow(row) {
    return {
      ...row,
      assigned_executive_name: `${row.first_name || ""} ${
        row.last_name || ""
      }`.trim(),
    };
  }

  // ===========================
  // CREATE with duplicate check
  // ===========================
  // ===========================
  static async create(leadData) {
    // ✅ Sanitize: convert all "" to null
    for (const key in leadData) {
      if (leadData[key] === "") {
        leadData[key] = null;
      }
    }

    const {
      salutation,
      name,
      phone,
      email,
      lead_type,
      priority,
      lead_source,
      whatsapp_number,
      state,
      city,
      location,
      status,
      assigned_executive,
      created_by,
      updated_by,
    } = leadData;

    // 🔹 Email duplicate check
    if (email) {
      const [emailExists] = await db.execute(
        "SELECT id FROM client_leads WHERE email = ?",
        [email]
      );
      if (emailExists.length > 0) {
        throw new Error("Duplicate email already exists");
      }
    }

    // 🔹 Phone duplicate check
    if (phone) {
      const [phoneExists] = await db.execute(
        "SELECT id FROM client_leads WHERE phone = ?",
        [phone]
      );
      if (phoneExists.length > 0) {
        throw new Error("Duplicate phone number already exists");
      }
    }

    try {
      const [result] = await db.execute(
        `INSERT INTO client_leads (
        salutation, name, phone, email, lead_type, lead_source,
        whatsapp_number, state, city, location, status, assigned_executive,
        created_by, updated_by, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          salutation,
          name,
          phone,
          email,
          lead_type,
          lead_source,
          whatsapp_number,
          state,
          city,
          location,
          status,
          assigned_executive, // now null if ""
          created_by,
          updated_by,
          priority, // now null if ""
        ]
      );

      return this.findById(result.insertId);
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        throw new Error("Duplicate email or phone already exists");
      }
      throw err;
    }
  }

  // ===========================
  // GET ALL (Updated to hide transferred leads to buyer OR seller)
  // ===========================
  static async findAll() {
    const [rows] = await db.execute(
      `SELECT l.*, 
              ae.first_name AS assigned_first_name, ae.last_name AS assigned_last_name,
              cu.first_name AS created_first_name, cu.last_name AS created_last_name,
              uu.first_name AS updated_first_name, uu.last_name AS updated_last_name
       FROM client_leads l
       LEFT JOIN users ae ON l.assigned_executive = ae.id
       LEFT JOIN users cu ON l.created_by = cu.id
       LEFT JOIN users uu ON l.updated_by = uu.id
       WHERE (l.transferred_to_buyer != 1 OR l.transferred_to_buyer IS NULL)
         AND (l.transferred_to_seller != 1 OR l.transferred_to_seller IS NULL)
       ORDER BY l.created_at DESC`
    );

    return rows.map((row) => ({
      ...row,
      assigned_executive_name: `${row.assigned_first_name || ""} ${
        row.assigned_last_name || ""
      }`.trim(),
      created_by_name: `${row.created_first_name || ""} ${
        row.created_last_name || ""
      }`.trim(),
      updated_by_name: `${row.updated_first_name || ""} ${
        row.updated_last_name || ""
      }`.trim(),
    }));
  }

  // ===========================
  // GET ALL INCLUDING TRANSFERRED (New method for admin/reports)
  // ===========================
  static async findAllIncludingTransferred() {
    const [rows] = await db.execute(
      `SELECT l.*, 
              ae.first_name AS assigned_first_name, ae.last_name AS assigned_last_name,
              cu.first_name AS created_first_name, cu.last_name AS created_last_name,
              uu.first_name AS updated_first_name, uu.last_name AS updated_last_name
       FROM client_leads l
       LEFT JOIN users ae ON l.assigned_executive = ae.id
       LEFT JOIN users cu ON l.created_by = cu.id
       LEFT JOIN users uu ON l.updated_by = uu.id
       ORDER BY l.created_at DESC`
    );

    return rows.map((row) => ({
      ...row,
      assigned_executive_name: `${row.assigned_first_name || ""} ${
        row.assigned_last_name || ""
      }`.trim(),
      created_by_name: `${row.created_first_name || ""} ${
        row.created_last_name || ""
      }`.trim(),
      updated_by_name: `${row.updated_first_name || ""} ${
        row.updated_last_name || ""
      }`.trim(),
    }));
  }

  // ===========================
  // GET ONLY TRANSFERRED TO BUYER
  // (existing method kept)
  // ===========================
  static async findTransferredLeads() {
    const [rows] = await db.execute(
      `SELECT l.*, 
              ae.first_name AS assigned_first_name, ae.last_name AS assigned_last_name,
              cu.first_name AS created_first_name, cu.last_name AS created_last_name,
              uu.first_name AS updated_first_name, uu.last_name AS updated_last_name,
              tb.first_name AS transferred_by_first_name, tb.last_name AS transferred_by_last_name
       FROM client_leads l
       LEFT JOIN users ae ON l.assigned_executive = ae.id
       LEFT JOIN users cu ON l.created_by = cu.id
       LEFT JOIN users uu ON l.updated_by = uu.id
       LEFT JOIN users tb ON l.transferred_to_buyer_by = tb.id
       WHERE l.transferred_to_buyer = 1
       ORDER BY l.transferred_to_buyer_at DESC`
    );

    return rows.map((row) => ({
      ...row,
      assigned_executive_name: `${row.assigned_first_name || ""} ${
        row.assigned_last_name || ""
      }`.trim(),
      created_by_name: `${row.created_first_name || ""} ${
        row.created_last_name || ""
      }`.trim(),
      updated_by_name: `${row.updated_first_name || ""} ${
        row.updated_last_name || ""
      }`.trim(),
      transferred_by_name: `${row.transferred_by_first_name || ""} ${
        row.transferred_by_last_name || ""
      }`.trim(),
    }));
  }

  // ===========================
  // GET ONLY TRANSFERRED TO SELLER
  // (NEW)
  // ===========================
  static async findTransferredToSeller() {
    const [rows] = await db.execute(
      `SELECT l.*, 
              ae.first_name AS assigned_first_name, ae.last_name AS assigned_last_name,
              cu.first_name AS created_first_name, cu.last_name AS created_last_name,
              uu.first_name AS updated_first_name, uu.last_name AS updated_last_name,
              tb.first_name AS transferred_by_first_name, tb.last_name AS transferred_by_last_name
       FROM client_leads l
       LEFT JOIN users ae ON l.assigned_executive = ae.id
       LEFT JOIN users cu ON l.created_by = cu.id
       LEFT JOIN users uu ON l.updated_by = uu.id
       LEFT JOIN users tb ON l.transferred_to_seller_by = tb.id
       WHERE l.transferred_to_seller = 1
       ORDER BY l.transferred_to_seller_at DESC`
    );

    return rows.map((row) => ({
      ...row,
      assigned_executive_name: `${row.assigned_first_name || ""} ${
        row.assigned_last_name || ""
      }`.trim(),
      created_by_name: `${row.created_first_name || ""} ${
        row.created_last_name || ""
      }`.trim(),
      updated_by_name: `${row.updated_first_name || ""} ${
        row.updated_last_name || ""
      }`.trim(),
      transferred_by_name: `${row.transferred_by_first_name || ""} ${
        row.transferred_by_last_name || ""
      }`.trim(),
    }));
  }

  // ===========================
  // GET BY ID
  // ===========================
  static async findById(id) {
    const [rows] = await db.execute(
      `SELECT l.*, 
              ae.first_name AS assigned_first_name, ae.last_name AS assigned_last_name,
              cu.first_name AS created_first_name, cu.last_name AS created_last_name,
              uu.first_name AS updated_first_name, uu.last_name AS updated_last_name
       FROM client_leads l
       LEFT JOIN users ae ON l.assigned_executive = ae.id
       LEFT JOIN users cu ON l.created_by = cu.id
       LEFT JOIN users uu ON l.updated_by = uu.id
       WHERE l.id = ?`,
      [id]
    );

    if (!rows.length) return null;

    const row = rows[0];
    return {
      ...row,
      assigned_executive_name: `${row.assigned_first_name || ""} ${
        row.assigned_last_name || ""
      }`.trim(),
      created_by_name: `${row.created_first_name || ""} ${
        row.created_last_name || ""
      }`.trim(),
      updated_by_name: `${row.updated_first_name || ""} ${
        row.updated_last_name || ""
      }`.trim(),
    };
  }

  // ===========================
  // UPDATE with duplicate check
  // ===========================
  static async update(id, leadData) {
    const cleanData = Object.fromEntries(
      Object.entries(leadData).map(([k, v]) => [k, v === undefined ? null : v])
    );
    cleanData.updated_at = new Date();

    // 🔹 Email duplicate check
    if (cleanData.email) {
      const [emailExists] = await db.execute(
        "SELECT id FROM client_leads WHERE email = ? AND id != ?",
        [cleanData.email, id]
      );
      if (emailExists.length > 0) {
        throw new Error("Duplicate email already exists");
      }
    }

    // 🔹 Phone duplicate check
    if (cleanData.phone) {
      const [phoneExists] = await db.execute(
        "SELECT id FROM client_leads WHERE phone = ? AND id != ?",
        [cleanData.phone, id]
      );
      if (phoneExists.length > 0) {
        throw new Error("Duplicate phone number already exists");
      }
    }

    // Build query dynamically
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(cleanData)) {
      if (key === "name" && (value === null || value === "")) {
        continue; // don't overwrite name if not provided
      }
      fields.push(`${key} = ?`);
      values.push(value);
    }

    if (!fields.length) {
      throw new Error("No valid fields to update");
    }

    const sql = `UPDATE client_leads SET ${fields.join(", ")} WHERE id = ?`;
    values.push(id);

    try {
      await db.execute(sql, values);
      return this.findById(id);
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        throw new Error("Duplicate email or phone already exists");
      }
      throw err;
    }
  }

  // ===========================
  // TRANSFER TO BUYER
  // ===========================
  static async transferToBuyer(id, transferredBy) {
    const [result] = await db.execute(
      `UPDATE client_leads 
       SET transferred_to_buyer = 1, 
           transferred_to_buyer_at = NOW(), 
           transferred_to_buyer_by = ?
       WHERE id = ?`,
      [transferredBy, id]
    );
    return result.affectedRows > 0;
  }

  // ===========================
  // BULK TRANSFER TO BUYER
  // ===========================
  static async bulkTransferToBuyer(ids, transferredBy) {
    if (!ids || ids.length === 0) return false;

    const placeholders = ids.map(() => "?").join(",");
    const [result] = await db.execute(
      `UPDATE client_leads 
       SET transferred_to_buyer = 1, 
           transferred_to_buyer_at = NOW(), 
           transferred_to_buyer_by = ?
       WHERE id IN (${placeholders})`,
      [transferredBy, ...ids]
    );
    return result.affectedRows > 0;
  }

  // ===========================
  // TRANSFER TO SELLER
  // (NEW)
  // ===========================
  static async transferToSeller(id, transferredBy) {
    const [result] = await db.execute(
      `UPDATE client_leads 
       SET transferred_to_seller = 1, 
           transferred_to_seller_at = NOW(), 
           transferred_to_seller_by = ?
       WHERE id = ?`,
      [transferredBy, id]
    );
    return result.affectedRows > 0;
  }

  // ===========================
  // BULK TRANSFER TO SELLER
  // (NEW)
  // ===========================
  static async bulkTransferToSeller(ids, transferredBy) {
    if (!ids || ids.length === 0) return false;

    const placeholders = ids.map(() => "?").join(",");
    const [result] = await db.execute(
      `UPDATE client_leads 
       SET transferred_to_seller = 1, 
           transferred_to_seller_at = NOW(), 
           transferred_to_seller_by = ?
       WHERE id IN (${placeholders})`,
      [transferredBy, ...ids]
    );
    return result.affectedRows > 0;
  }

  // ===========================
  // DELETE
  // ===========================
  static async delete(id) {
    await db.execute("DELETE FROM client_leads WHERE id = ?", [id]);
    return true;
  }

  // ===========================
  // MASTER DATA
  // ===========================
  static async getMasterData(type) {
    const tableName = `master_${type.replace(" ", "_")}`;
    const [rows] = await db.execute(
      `SELECT id, value as label FROM ${tableName} ORDER BY value`
    );
    return rows;
  }

  static async updateAssignedExecutive(id, assigned_executive) {
    const [result] = await db.execute(
      `UPDATE client_leads SET assigned_executive = ? WHERE id = ?`,
      [assigned_executive, id]
    );
    return result.affectedRows > 0;
  }

  static async findByIds(ids) {
    if (!ids || ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await db.execute(
      `SELECT l.*, u.first_name, u.last_name
       FROM client_leads l
       LEFT JOIN users u ON l.assigned_executive = u.id
       WHERE l.id IN (${placeholders})
       AND (l.transferred_to_buyer != 1 OR l.transferred_to_buyer IS NULL)
       AND (l.transferred_to_seller != 1 OR l.transferred_to_seller IS NULL)`,
      ids
    );

    return rows.map(this.mapLeadRow);
  }

  static async bulkUpdateStatus(ids, status) {
    if (!ids || ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(",");
    await db.execute(
      `UPDATE client_leads SET status = ? WHERE id IN (${placeholders})`,
      [status, ...ids]
    );

    return true;
  }

  static async bulkDelete(ids) {
    if (!ids || ids.length === 0) return;

    const placeholders = ids.map(() => "?").join(",");
    const sql = `DELETE FROM client_leads WHERE id IN (${placeholders})`;
    await db.query(sql, ids);

    return true;
  }
}

module.exports = Lead;
