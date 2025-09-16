
// const pool = require('../config/database');

// const ContactModel = {
//   async createContact({ name, email, phone, subject, message, propertyType, budget }) {
//     const sql = `
//       INSERT INTO contact_messages
//         (name, email, phone, subject, message, property_type, budget)
//       VALUES (?, ?, ?, ?, ?, ?, ?)
//     `;
//     const [result] = await pool.execute(sql, [
//       name, email, phone, subject, message, propertyType || null, budget || null
//     ]);
//     return { insertId: result.insertId };
//   },

//   async getContactById(id) {
//     const [rows] = await pool.execute('SELECT * FROM contact_messages WHERE id = ?', [id]);
//     return rows[0] || null;
//   },

//   /**
//    * List contacts with safe numeric limit/offset injection.
//    * Using placeholders for LIMIT/OFFSET can sometimes fail depending on driver/server,
//    * so we validate and inline integers into the query after sanitizing.
//    */
//   async listContacts({ limit = 50, offset = 0 } = {}) {
//     // sanitize and clamp values
//     let l = Number(limit);
//     let o = Number(offset);

//     if (!Number.isFinite(l) || l <= 0) l = 50;
//     if (!Number.isFinite(o) || o < 0) o = 0;

//     // enforce a sensible max limit
//     const MAX_LIMIT = 1000;
//     if (l > MAX_LIMIT) l = MAX_LIMIT;

//     // Now safely inline integers (they are validated numbers so injection risk is mitigated)
//     const sql = `SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT ${l} OFFSET ${o}`;
//     const [rows] = await pool.query(sql); // using query since no placeholders
//     return rows;
//   }
// };

// module.exports = ContactModel;


const pool = require("../config/database");

/**
 * ContactModel - MySQL implementation
 * - createContact
 * - getContactById
 * - listContacts
 * - updateContactById (dynamic SET)
 * - appendReplyToContact (JSON replies)
 */

const ContactModel = {
  async createContact({
    name,
    email,
    phone,
    subject,
    message,
    propertyType,
    budget,
  }) {
    const sql = `
      INSERT INTO contact_messages
        (name, email, phone, subject, message, property_type, budget, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    const [result] = await pool.execute(sql, [
      name,
      email,
      phone,
      subject,
      message,
      propertyType || null,
      budget || null,
    ]);
    return { insertId: result.insertId };
  },

  async getContactById(id) {
    const [rows] = await pool.execute(
      "SELECT * FROM contact_messages WHERE id = ?",
      [id]
    );
    return rows[0] || null;
  },

  async listContacts({ limit = 50, offset = 0 } = {}) {
    let l = Number(limit);
    let o = Number(offset);
    if (!Number.isFinite(l) || l <= 0) l = 50;
    if (!Number.isFinite(o) || o < 0) o = 0;
    const MAX_LIMIT = 1000;
    if (l > MAX_LIMIT) l = MAX_LIMIT;

    const sql = `SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT ${l} OFFSET ${o}`;
    const [rows] = await pool.query(sql);
    return rows;
  },

  /**
   * updateContactById - dynamic SET based on provided object keys.
   * - Accepts column names in snake_case that match DB columns:
   *   e.g. { status: 'replied', assigned_to: 'Amit', is_starred: 1 }
   * - Returns the updated row (or null if not found)
   */
  async updateContactById(id, updateObj = {}) {
    if (!id || !updateObj || Object.keys(updateObj).length === 0) return null;

    const allowedCols = ["status", "assigned_to", "is_starred", "updated_at"];
    const setParts = [];
    const values = [];

    for (const [k, v] of Object.entries(updateObj)) {
      if (!allowedCols.includes(k)) continue;
      setParts.push(`${k} = ?`);
      values.push(v);
    }

    if (setParts.length === 0) return null;

    // ensure updated_at exists
    if (!updateObj.updated_at) {
      setParts.push("updated_at = NOW()");
    }

    const sql = `UPDATE contact_messages SET ${setParts.join(
      ", "
    )} WHERE id = ?`;
    values.push(id);

    const [result] = await pool.execute(sql, values);

    // if no rows affected, return null
    if (result.affectedRows === 0) return null;

    return this.getContactById(id);
  },

  /**
   * appendReplyToContact
   * - Appends a reply JSON object to the replies JSON column.
   * - If replies is NULL or not valid json, it will set a new JSON array with the reply.
   * - Returns the updated contact row.
   */
  async appendReplyToContact(id, replyObj) {
    if (!id || !replyObj) return null;

    // Use JSON functions: if replies is NULL, set it to JSON_ARRAY(replyObj)
    // Otherwise JSON_ARRAY_APPEND(replies, '$', replyObj)
    const sql = `
      UPDATE contact_messages
      SET replies = CASE
        WHEN JSON_VALID(replies) AND JSON_LENGTH(replies) IS NOT NULL
          THEN JSON_ARRAY_APPEND(replies, '$', CAST(? AS JSON))
        ELSE JSON_ARRAY(CAST(? AS JSON))
        END,
        updated_at = NOW()
      WHERE id = ?
    `;

    // replyObj must be a JSON string for CAST(? AS JSON)
    const replyJson = JSON.stringify(replyObj);
    const [result] = await pool.execute(sql, [replyJson, replyJson, id]);

    if (result.affectedRows === 0) return null;
    return this.getContactById(id);
  },
};

module.exports = ContactModel;
