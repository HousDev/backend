// const pool = require("../config/database");
// const { v4: uuidv4 } = require("uuid");
// const MasterModel = {
//   // Master Types
//   getAllMasterTypes: async (tabId) => {
//     const [rows] = await pool.query(
//       "SELECT * FROM master_types WHERE tab_id = ? ORDER BY name",
//       [tabId]
//     );
//     return rows;
//   },

//   getMasterTypeById: async (id) => {
//     const [rows] = await pool.query("SELECT * FROM master_types WHERE id = ?", [
//       id,
//     ]);
//     return rows[0];
//   },
//   createMasterType: async (tabId, name, status) => {
//   const id = uuidv4(); // Generate unique ID
//   const [result] = await pool.query(
//     "INSERT INTO master_types (id, tab_id, name, status) VALUES (?, ?, ?, ?)",
//     [id, tabId, name, status || "Active"]
//   );
//   return id;
// },

//   updateMasterType: async (id, name, status) => {
//     const [result] = await pool.query(
//       "UPDATE master_types SET name = ?, status = ? WHERE id = ?",
//       [name, status, id]
//     );
//     return result.affectedRows;
//   },

//   deleteMasterType: async (id) => {
//     const [result] = await pool.query("DELETE FROM master_types WHERE id = ?", [
//       id,
//     ]);
//     return result.affectedRows;
//   },

//   // Master Values
//   getValuesByMasterType: async (masterTypeId) => {
//     const [rows] = await pool.query(
//       "SELECT * FROM master_values WHERE master_type_id = ? ORDER BY value",
//       [masterTypeId]
//     );
//     return rows;
//   },

// // createMasterValue method:

//  createMasterValue: async (masterTypeId, value, status) => {
//     const id = uuidv4(); // generate unique ID
//     const [result] = await pool.query(
//       "INSERT INTO master_values (id, master_type_id, value, status) VALUES (?, ?, ?, ?)",
//       [id, masterTypeId, value, status || "Active"]
//     );
//     return id;
//   },

//   updateMasterValue: async (id, value, status) => {
//     const [result] = await pool.query(
//       "UPDATE master_values SET value = ?, status = ? WHERE id = ?",
//       [value, status, id]
//     );
//     return result.affectedRows;
//   },

//   deleteMasterValue: async (id) => {
//     const [result] = await pool.query(
//       "DELETE FROM master_values WHERE id = ?",
//       [id]
//     );
//     return result.affectedRows;
//   },

//   // Bulk operations
//   importMasterTypes: async (tabId, data) => {
//     const values = data.map((item) => [

//      uuidv4(),

//       tabId,
//       item.name,
//       item.status || "Active",
//     ]);
//     const [result] = await pool.query(
//       "INSERT INTO master_types (id, tab_id, name, status) VALUES ?",
//       [values]
//     );
//     return result.affectedRows;
//   },

//   importMasterValues: async (masterTypeId, data) => {
//     const values = data.map((item) => [
//       uuidv4(),
//       masterTypeId,
//       item.value,
//       item.status || "Active",
//     ]);
//     const [result] = await pool.query(
//       "INSERT INTO master_values (id, master_type_id, value, status) VALUES ?",
//       [values]
//     );
//     return result.affectedRows;
//   },
// };

// module.exports = MasterModel;

const pool = require("../config/database");
const { v4: uuidv4 } = require("uuid");

const MasterModel = {
  // ==================== MASTER TYPES ====================

  getAllMasterTypes: async (tabId) => {
    const [rows] = await pool.query(
      "SELECT * FROM master_types WHERE tab_id = ? ORDER BY name",
      [tabId],
    );
    return rows;
  },

  getMasterTypeById: async (id) => {
    const [rows] = await pool.query("SELECT * FROM master_types WHERE id = ?", [
      id,
    ]);
    return rows[0];
  },

  createMasterType: async (tabId, name, status) => {
    const id = uuidv4();
    const [result] = await pool.query(
      "INSERT INTO master_types (id, tab_id, name, status) VALUES (?, ?, ?, ?)",
      [id, tabId, name, status || "Active"],
    );
    return id;
  },

  updateMasterType: async (id, name, status) => {
    const [result] = await pool.query(
      "UPDATE master_types SET name = ?, status = ? WHERE id = ?",
      [name, status, id],
    );
    return result.affectedRows;
  },

  deleteMasterType: async (id) => {
    const [result] = await pool.query("DELETE FROM master_types WHERE id = ?", [
      id,
    ]);
    return result.affectedRows;
  },

  // 🔥 DUPLICATE CHECK FOR MASTER TYPES
  checkDuplicateMasterType: async (tabId, name, excludeId = null) => {
let query = `SELECT * FROM master_types WHERE tab_id = ? AND LOWER(name) = LOWER(?)`;
    let params = [tabId, name];

    if (excludeId) {
      query += ` AND id != ?`;
      params.push(excludeId);
    }

    const [rows] = await pool.query(query, params);
    return rows[0];
  },

  // ==================== MASTER VALUES ====================

  getValuesByMasterType: async (masterTypeId) => {
    const [rows] = await pool.query(
      "SELECT * FROM master_values WHERE master_type_id = ? ORDER BY value",
      [masterTypeId],
    );
    return rows;
  },

  getMasterValueById: async (id) => {
    const [rows] = await pool.query(
      "SELECT * FROM master_values WHERE id = ?",
      [id],
    );
    return rows[0];
  },

  createMasterValue: async (masterTypeId, value, status) => {
    const id = uuidv4();
    const [result] = await pool.query(
      "INSERT INTO master_values (id, master_type_id, value, status) VALUES (?, ?, ?, ?)",
      [id, masterTypeId, value, status || "Active"],
    );
    return id;
  },

  updateMasterValue: async (id, value, status) => {
    const [result] = await pool.query(
      "UPDATE master_values SET value = ?, status = ? WHERE id = ?",
      [value, status, id],
    );
    return result.affectedRows;
  },

  deleteMasterValue: async (id) => {
    const [result] = await pool.query(
      "DELETE FROM master_values WHERE id = ?",
      [id],
    );
    return result.affectedRows;
  },

  // 🔥 DUPLICATE CHECK FOR MASTER VALUES
  checkDuplicateMasterValue: async (masterTypeId, value, excludeId = null) => {
let query = `SELECT * FROM master_values WHERE master_type_id = ? AND LOWER(value) = LOWER(?)`;
    let params = [masterTypeId, value];

    if (excludeId) {
      query += ` AND id != ?`;
      params.push(excludeId);
    }

    const [rows] = await pool.query(query, params);
    return rows[0];
  },

  // ==================== BULK OPERATIONS ====================

 // AFTER - xlsx + CSV dono support
// importMasterTypes: async (req, res) => {
//   try {
//     const { tabId } = req.params;

//     if (!req.file) {
//       return res.status(400).json({ error: "No file uploaded" });
//     }

//     const fileExt = req.file.originalname.split('.').pop().toLowerCase();
//     let results = [];

//     if (fileExt === 'xlsx' || fileExt === 'xls') {
//       // Parse Excel
//       const workbook = XLSX.readFile(req.file.path);
//       const sheetName = workbook.SheetNames[0];
//       const worksheet = workbook.Sheets[sheetName];
//       const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

//       results = jsonData.map(row => ({
//         name: String(row['Name'] || row['name'] || row['NAME'] || '').trim(),
//         status: String(row['Status'] || row['status'] || row['STATUS'] || 'Active').trim(),
//       })).filter(r => r.name);

//       fs.unlinkSync(req.file.path);
//     } else {
//       // Parse CSV
//       await new Promise((resolve, reject) => {
//         fs.createReadStream(req.file.path)
//           .pipe(csv({
//             mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_'),
//           }))
//           .on("data", (data) => results.push(data))
//           .on("end", resolve)
//           .on("error", reject);
//       });
//       fs.unlinkSync(req.file.path);
//     }

//     const uniqueResults = [];
//     const existingNames = new Set();
//     let duplicateCount = 0;

//     for (const item of results) {
//       const itemName = item.name || item.Name || item.NAME;
//       if (!itemName) continue;

//       const existing = await MasterModel.checkDuplicateMasterType(tabId, itemName);
//       if (!existing && !existingNames.has(itemName.trim().toLowerCase())) {
//         existingNames.add(itemName.trim().toLowerCase());
//         uniqueResults.push({ ...item, name: itemName.trim() });
//       } else {
//         duplicateCount++;
//       }
//     }

//     if (uniqueResults.length === 0) {
//       return res.json({
//         success: true,
//         message: `No new master types to import (${duplicateCount} duplicates skipped)`,
//         imported: 0,
//         skipped: duplicateCount,
//       });
//     }

//     await MasterModel.importMasterTypes(tabId, uniqueResults);
//     res.json({
//       success: true,
//       message: `${uniqueResults.length} master types imported successfully (${duplicateCount} duplicates skipped)`,
//       imported: uniqueResults.length,
//       skipped: duplicateCount,
//     });

//   } catch (error) {
//     if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
//     res.status(500).json({ error: error.message });
//   }
// },

importMasterTypes: async (tabId, data) => {
    const values = data.map((item) => [
      uuidv4(),
      tabId,
      item.name,
      item.status || "Active",
    ]);
    const [result] = await pool.query(
      "INSERT INTO master_types (id, tab_id, name, status) VALUES ?",
      [values],
    );
    return result.affectedRows;
  },

  importMasterValues: async (masterTypeId, data) => {
    const values = data.map((item) => [
      uuidv4(),
      masterTypeId,
      item.value,
      item.status || "Active",
    ]);
    const [result] = await pool.query(
      "INSERT INTO master_values (id, master_type_id, value, status) VALUES ?",
      [values],
    );
    return result.affectedRows;
  },
};

module.exports = MasterModel;