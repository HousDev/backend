const pool = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const MasterModel = {
  // Master Types
  getAllMasterTypes: async (tabId) => {
    const [rows] = await pool.query(
      "SELECT * FROM master_types WHERE tab_id = ? ORDER BY name",
      [tabId]
    );
    return rows;
  },

  getMasterTypeById: async (id) => {
    const [rows] = await pool.query("SELECT * FROM master_types WHERE id = ?", [
      id,
    ]);
    return rows[0];
  },

//   createMasterType: async (tabId, name, status) => {
//   const [result] = await pool.query(
//     "INSERT INTO master_types (tab_id, name, status) VALUES (?, ?, ?)",
//     [tabId, name, status]
//   );
//   return result.insertId;
  // },
  
  createMasterType: async (tabId, name, status) => {
  const id = uuidv4(); // Generate unique ID
  const [result] = await pool.query(
    "INSERT INTO master_types (id, tab_id, name, status) VALUES (?, ?, ?, ?)",
    [id, tabId, name, status || "Active"]
  );
  return id;
},


  updateMasterType: async (id, name, status) => {
    const [result] = await pool.query(
      "UPDATE master_types SET name = ?, status = ? WHERE id = ?",
      [name, status, id]
    );
    return result.affectedRows;
  },

  deleteMasterType: async (id) => {
    const [result] = await pool.query("DELETE FROM master_types WHERE id = ?", [
      id,
    ]);
    return result.affectedRows;
  },

  // Master Values
  getValuesByMasterType: async (masterTypeId) => {
    const [rows] = await pool.query(
      "SELECT * FROM master_values WHERE master_type_id = ? ORDER BY value",
      [masterTypeId]
    );
    return rows;
  },

// createMasterValue method:

 createMasterValue: async (masterTypeId, value, status) => {
    const id = uuidv4(); // generate unique ID
    const [result] = await pool.query(
      "INSERT INTO master_values (id, master_type_id, value, status) VALUES (?, ?, ?, ?)",
      [id, masterTypeId, value, status || "Active"]
    );
    return id;
  },



  updateMasterValue: async (id, value, status) => {
    const [result] = await pool.query(
      "UPDATE master_values SET value = ?, status = ? WHERE id = ?",
      [value, status, id]
    );
    return result.affectedRows;
  },

  deleteMasterValue: async (id) => {
    const [result] = await pool.query(
      "DELETE FROM master_values WHERE id = ?",
      [id]
    );
    return result.affectedRows;
  },

  // Bulk operations
  importMasterTypes: async (tabId, data) => {
    const values = data.map((item) => [

     uuidv4(),

      tabId,
      item.name,
      item.status || "Active",
    ]);
    const [result] = await pool.query(
      "INSERT INTO master_types (id, tab_id, name, status) VALUES ?",
      [values]
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
      [values]
    );
    return result.affectedRows;
  },
};

module.exports = MasterModel;
