const db = require("../config/database");

const Message = {
 create: async (data) => {
  const { contact_id, direction, text, whatsapp_msg_id, media_url, media_type, file_name } = data;
  const status = direction === "in" ? "read" : "sent";

  const [result] = await db.query(
    `INSERT INTO messages_wa 
     (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, media_url, media_type, file_name) 
     VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
    [contact_id, direction, text, whatsapp_msg_id, status, status === "read" ? 1 : 0, 
     media_url || null, media_type || null, file_name || null],
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
      media_url: row.media_url || null,      // ← ADD
  media_type: row.media_type || null,    // ← ADD
  file_name: row.file_name || null,  
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
