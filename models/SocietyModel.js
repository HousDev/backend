// const pool = require("../config/database");
// const { v4: uuidv4 } = require("uuid");

// const SocietyModel = {
//   createSociety: async (data) => {
//     const id = uuidv4();
//     const [result] = await pool.query(
//       `INSERT INTO societies
//         (id, society_name, locality, city, pincode, status, created_at)
//        VALUES (?, ?, ?, ?, ?, ?, NOW())`,
//       [
//         id,
//         data.societyName,
//         data.locality,
//         data.city,
//         data.pincode,
//         data.status || "Active",
//       ],
//     );
//     return id;
//   },

//   getAllSocieties: async () => {
//     const [rows] = await pool.query(
//       "SELECT * FROM societies ORDER BY created_at DESC",
//     );
//     return rows;
//   },

//   getSocietyById: async (id) => {
//     const [rows] = await pool.query("SELECT * FROM societies WHERE id = ?", [
//       id,
//     ]);
//     return rows[0];
//   },

//   updateSociety: async (id, data) => {
//     const [result] = await pool.query(
//       `UPDATE societies SET
//         society_name = ?,
//         locality = ?,
//         city = ?,
//         pincode = ?,
//         status = ?
//       WHERE id = ?`,
//       [
//         data.societyName,
//         data.locality,
//         data.city,
//         data.pincode,
//         data.status || "Active",
//         id,
//       ],
//     );
//     return result.affectedRows;
//   },

//   deleteSociety: async (id) => {
//     const [result] = await pool.query("DELETE FROM societies WHERE id = ?", [
//       id,
//     ]);
//     return result.affectedRows;
//   },

//   searchSocieties: async (searchTerm) => {
//     const [rows] = await pool.query(
//       `SELECT * FROM societies
//        WHERE society_name LIKE ?
//        OR locality LIKE ?
//        OR city LIKE ?
//        OR pincode LIKE ?
//        ORDER BY created_at DESC`,
//       [
//         `%${searchTerm}%`,
//         `%${searchTerm}%`,
//         `%${searchTerm}%`,
//         `%${searchTerm}%`,
//       ],
//     );
//     return rows;
//   },

//   getSocietiesByPincode: async (pincode) => {
//     const [rows] = await pool.query(
//       "SELECT * FROM societies WHERE pincode = ? ORDER BY society_name",
//       [pincode],
//     );
//     return rows;
//   },

//   getSocietiesByCity: async (city) => {
//     const [rows] = await pool.query(
//       "SELECT * FROM societies WHERE city = ? ORDER BY society_name",
//       [city],
//     );
//     return rows;
//   },
// };

// module.exports = SocietyModel;

const pool = require("../config/database");
const { v4: uuidv4 } = require("uuid");

const SocietyModel = {
  createSociety: async (data) => {
    const id = uuidv4();
    const [result] = await pool.query(
      `INSERT INTO societies 
        (id, society_name, locality, city, pincode, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        data.societyName,
        data.locality,
        data.city,
        data.pincode,
        data.status || "Active",
      ],
    );
    return id;
  },

  // 🔥 NEW: Check duplicate society by all fields
  checkDuplicate: async (societyName, locality, city, pincode) => {
    const [rows] = await pool.query(
      `SELECT * FROM societies 
       WHERE society_name = ? 
       AND locality = ? 
       AND city = ? 
       AND pincode = ?`,
      [societyName, locality, city, pincode],
    );
    return rows[0];
  },

  // 🔥 NEW: Check duplicate for update (exclude current ID)
  checkDuplicateForUpdate: async (id, societyName, locality, city, pincode) => {
    const [rows] = await pool.query(
      `SELECT * FROM societies 
       WHERE society_name = ? 
       AND locality = ? 
       AND city = ? 
       AND pincode = ?
       AND id != ?`,
      [societyName, locality, city, pincode, id],
    );
    return rows[0];
  },

  getAllSocieties: async () => {
    const [rows] = await pool.query(
      "SELECT * FROM societies ORDER BY created_at DESC",
    );
    return rows;
  },

  getSocietyById: async (id) => {
    const [rows] = await pool.query("SELECT * FROM societies WHERE id = ?", [
      id,
    ]);
    return rows[0];
  },

  updateSociety: async (id, data) => {
    const [result] = await pool.query(
      `UPDATE societies SET 
        society_name = ?, 
        locality = ?, 
        city = ?, 
        pincode = ?, 
        status = ?
      WHERE id = ?`,
      [
        data.societyName,
        data.locality,
        data.city,
        data.pincode,
        data.status || "Active",
        id,
      ],
    );
    return result.affectedRows;
  },

  deleteSociety: async (id) => {
    const [result] = await pool.query("DELETE FROM societies WHERE id = ?", [
      id,
    ]);
    return result.affectedRows;
  },

  searchSocieties: async (searchTerm) => {
    const [rows] = await pool.query(
      `SELECT * FROM societies 
       WHERE society_name LIKE ? 
       OR locality LIKE ? 
       OR city LIKE ? 
       OR pincode LIKE ?
       ORDER BY created_at DESC`,
      [
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
      ],
    );
    return rows;
  },

  getSocietiesByPincode: async (pincode) => {
    const [rows] = await pool.query(
      "SELECT * FROM societies WHERE pincode = ? ORDER BY society_name",
      [pincode],
    );
    return rows;
  },

  getSocietiesByCity: async (city) => {
    const [rows] = await pool.query(
      "SELECT * FROM societies WHERE city = ? ORDER BY society_name",
      [city],
    );
    return rows;
  },
};

module.exports = SocietyModel;