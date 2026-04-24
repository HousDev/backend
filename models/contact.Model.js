// module.exports = Contact;
const db = require("../config/database");

const Contact = {
 findAll: async () => {
  const [rows] = await db.query(
    "SELECT * FROM contacts_wa ORDER BY last_contact_time DESC",
  );
  return rows;
},

  findById: async (id) => {
    const [rows] = await db.query("SELECT * FROM contacts_wa WHERE id = ?", [
      id,
    ]);
    return rows[0];
  },

  create: async (data) => {
    const { name, phone, tag, stage, assigned_to, color, initials } = data;
    if (!name || !phone) {
      throw new Error("Name and phone required");
    }

    // Duplicate check
    const [existing] = await db.query(
      "SELECT id FROM contacts_wa WHERE phone = ?",
      [phone],
    );

    if (existing.length) {
      return existing[0].id;
    }

    const [result] = await db.query(
      "INSERT INTO contacts_wa (name, phone, tag, stage, assigned_to, color, initials) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        name,
        phone,
        tag || "new",
        stage || "New",
        assigned_to || "Unassigned",
        color || "blue",
        initials || name.slice(0, 2).toUpperCase(),
      ],
    );
    return result.insertId;
  },

  update: async (id, data) => {
    // Build dynamic update query
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;

    values.push(id);
    await db.query(
      `UPDATE contacts_wa SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
  },

  delete: async (id) => {
    await db.query("DELETE FROM contacts_wa WHERE id = ?", [id]);
  },

  getWithMessages: async (id) => {
    const contact = await Contact.findById(id);
    if (!contact) return null;

    const [messages] = await db.query(
      "SELECT * FROM messages_wa WHERE contact_id = ? ORDER BY time_sent ASC",
      [id],
    );

    const [notes] = await db.query(
      "SELECT note, created_at FROM notes WHERE contact_id = ? ORDER BY created_at DESC",
      [id],
    );

    return { ...contact, messages, notes };
  },

  addNote: async (contact_id, note) => {
    const [result] = await db.query(
      "INSERT INTO notes (contact_id, note) VALUES (?, ?)",
      [contact_id, note],
    );
    return result.insertId;
  },
};

module.exports = Contact;