const db = require("../config/database");

const Message = {
  create: async (data) => {
    const { contact_id, direction, text, whatsapp_msg_id } = data;
    const [result] = await db.query(
      "INSERT INTO messages_wa  (contact_id, direction, text, whatsapp_msg_id) VALUES (?, ?, ?, ?)",
      [contact_id, direction, text, whatsapp_msg_id],
    );
    return result.insertId;
  },
  findByContact: async (contact_id) => {
    const [rows] = await db.query(
      "SELECT * FROM messages_wa  WHERE contact_id = ? ORDER BY time_sent",
      [contact_id],
    );
    return rows;
  },
  updateLastMessage: async (contact_id, text) => {
    await db.query(
      "UPDATE contacts_wa  SET last_message = ?, last_contact_time = NOW() WHERE id = ?",
      [text, contact_id],
    );
  },
};

module.exports = Message;
