const pool = require("../config/database");
const { v4: uuidv4 } = require("uuid");

const ConnectedRemarkModel = {
  // Create
  createRemark: async (data) => {
    const id = uuidv4();
    const [result] = await pool.query(
      `INSERT INTO connected_remarks 
        (id, tab_id, type1, value1, type2, value2, remarks, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.tabId,
        data.type1,
        data.value1,
        data.type2,
        data.value2,
        JSON.stringify(data.remarks),
        data.status,
      ]
    );
    return id;
  },

  // Read All
  getAllRemarks: async () => {
    const [rows] = await pool.query("SELECT * FROM connected_remarks ORDER BY created_at DESC");
    return rows;
  },

  // Read By ID
  getRemarkById: async (id) => {
    const [rows] = await pool.query("SELECT * FROM connected_remarks WHERE id = ?", [id]);
    return rows[0];
  },

  // Update
  updateRemark: async (id, data) => {
    const [result] = await pool.query(
      `UPDATE connected_remarks SET 
        tab_id = ?, 
        type1 = ?, 
        value1 = ?, 
        type2 = ?, 
        value2 = ?, 
        remarks = ?, 
        status = ?
      WHERE id = ?`,
      [
        data.tabId,
        data.type1,
        data.value1,
        data.type2,
        data.value2,
        JSON.stringify(data.remarks),
        data.status,
        id,
      ]
    );
    return result.affectedRows;
  },

  // Delete
  deleteRemark: async (id) => {
    const [result] = await pool.query("DELETE FROM connected_remarks WHERE id = ?", [id]);
    return result.affectedRows;
  },
};

module.exports = ConnectedRemarkModel;
