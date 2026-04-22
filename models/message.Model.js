// const db = require("../config/database");

// const Message = {
//   create: async (data) => {
//     const { contact_id, direction, text, whatsapp_msg_id } = data;
//     const [result] = await db.query(
//       "INSERT INTO messages_wa  (contact_id, direction, text, whatsapp_msg_id) VALUES (?, ?, ?, ?)",
//       [contact_id, direction, text, whatsapp_msg_id],
//     );
//     return result.insertId;
//   },
//   findByContact: async (contact_id) => {
//     const [rows] = await db.query(
//       "SELECT * FROM messages_wa  WHERE contact_id = ? ORDER BY time_sent",
//       [contact_id],
//     );
//     return rows;
//   },
//   updateLastMessage: async (contact_id, text) => {
//     await db.query(
//       "UPDATE contacts_wa  SET last_message = ?, last_contact_time = NOW() WHERE id = ?",
//       [text, contact_id],
//     );
//   },
// };

// module.exports = Message;
const db = require("../config/database");

const Message = {
  create: async (data) => {
    const { contact_id, direction, text, whatsapp_msg_id } = data;

    const status = direction === "in" ? "read" : "sent";

    const [result] = await db.query(
      `INSERT INTO messages_wa 
     (contact_id, direction, text, whatsapp_msg_id, status, is_read) 
     VALUES (?, ?, ?, ?, ?, ?)`,
      [
        contact_id,
        direction,
        text,
        whatsapp_msg_id,
        status,
        status === "read" ? 1 : 0,
      ],
    );

    return result.insertId;
  },

  findByContact: async (contact_id) => {
    const [rows] = await db.query(
      "SELECT * FROM messages_wa WHERE contact_id = ? ORDER BY time_sent ASC",
      [contact_id],
    );
    // Format messages for frontend compatibility
    return rows.map((row) => ({
      id: row.id,
      conversation_id: `conv_${row.contact_id}`,
      direction: row.direction === "out" ? "out" : "in",
      body: row.text,
      text: row.text,
      timestamp: row.time_sent,
      status: row.status || (row.is_read ? "read" : "sent"),
      sender: row.direction === "out" ? { name: "You" } : null,
    }));
  },

  updateLastMessage: async (contact_id, text) => {
    await db.query(
      "UPDATE contacts_wa SET last_message = ?, last_contact_time = NOW() WHERE id = ?",
      [text, contact_id],
    );
  },
};

module.exports = Message;
