// const pool = require("../config/database");
// const { v4: uuidv4 } = require("uuid");

// const SocietyModel = {
//   createSociety: async (data) => {
//     const id = uuidv4();
//     const [result] = await pool.query(
//       `INSERT INTO societies
//         (id, society_name, locality, city, pincode, amenities, status, created_at)
//        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
//       [
//         id,
//         data.societyName,
//         data.locality,
//         data.city,
//         data.pincode,
//         JSON.stringify(data.amenities || []),
//         data.status || "Active",
//       ],
//     );
//     return id;
//   },

//   // 🔥 UPDATED: Check duplicate by Society Name + Locality + Pincode ONLY (City ignored)
//   checkDuplicate: async (societyName, locality, pincode) => {
//     const [rows] = await pool.query(
//       `SELECT * FROM societies
//        WHERE society_name = ?
//        AND locality = ?
//        AND pincode = ?`,
//       [societyName, locality, pincode],
//     );
//     return rows[0];
//   },

//   // 🔥 UPDATED: Check duplicate for update (exclude current ID) - without city
//   checkDuplicateForUpdate: async (id, societyName, locality, pincode) => {
//     const [rows] = await pool.query(
//       `SELECT * FROM societies
//        WHERE society_name = ?
//        AND locality = ?
//        AND pincode = ?
//        AND id != ?`,
//       [societyName, locality, pincode, id],
//     );
//     return rows[0];
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
//         amenities = ?,
//         status = ?
//       WHERE id = ?`,
//       [
//         data.societyName,
//         data.locality,
//         data.city,
//         data.pincode,
//         JSON.stringify(data.amenities || []),
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
  // 🔥 UPDATED: Create society with image_urls
  createSociety: async (data) => {
    const id = uuidv4();
    const [result] = await pool.query(
      `INSERT INTO societies 
        (id, society_name, locality, city, pincode, amenities, image_urls, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        data.societyName,
        data.locality,
        data.city,
        data.pincode,
        JSON.stringify(data.amenities || []),
        JSON.stringify(data.imageUrls || []),
        data.status || "Active",
      ],
    );
    return id;
  },

  // 🔥 Check duplicate by Society Name + Locality + Pincode ONLY
  checkDuplicate: async (societyName, locality, pincode) => {
    const [rows] = await pool.query(
      `SELECT * FROM societies 
       WHERE society_name = ? 
       AND locality = ? 
       AND pincode = ?`,
      [societyName, locality, pincode],
    );
    return rows[0];
  },

  // 🔥 Check duplicate for update (exclude current ID)
  checkDuplicateForUpdate: async (id, societyName, locality, pincode) => {
    const [rows] = await pool.query(
      `SELECT * FROM societies 
       WHERE society_name = ? 
       AND locality = ? 
       AND pincode = ?
       AND id != ?`,
      [societyName, locality, pincode, id],
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

  // 🔥 UPDATED: Update society with image_urls
  updateSociety: async (id, data) => {
    const [result] = await pool.query(
      `UPDATE societies SET 
        society_name = ?, 
        locality = ?, 
        city = ?, 
        pincode = ?, 
        amenities = ?, 
        image_urls = ?,
        status = ?
      WHERE id = ?`,
      [
        data.societyName,
        data.locality,
        data.city,
        data.pincode,
        JSON.stringify(data.amenities || []),
        JSON.stringify(data.imageUrls || []),
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

  // 🖼️ IMAGE METHODS
  updateSocietyImages: async (id, imageUrls) => {
    const [result] = await pool.query(
      `UPDATE societies SET image_urls = ? WHERE id = ?`,
      [JSON.stringify(imageUrls || []), id],
    );
    return result.affectedRows;
  },

  getSocietyImages: async (id) => {
    const [rows] = await pool.query(
      "SELECT id, image_urls FROM societies WHERE id = ?",
      [id],
    );
    return rows[0];
  },
};

module.exports = SocietyModel;