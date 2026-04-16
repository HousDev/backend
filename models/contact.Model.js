const db = require("../config/database");

const Contact = {
  findAll: async () => {
    const [rows] = await db.query(
      "SELECT * FROM contacts_wa  ORDER BY created_at DESC",
    );
    return rows;
  },
  findById: async (id) => {
    const [rows] = await db.query("SELECT * FROM contacts_wa  WHERE id = ?", [id]);
    return rows[0];
  },
  create: async (data) => {
    const { name, phone, tag, stage, assigned_to, color, initials } = data;
      if (!name || !phone) {
        throw new Error("Name and phone required");
      }

      // 🔥 duplicate check
      const [existing] = await db.query(
        "SELECT id FROM contacts_wa WHERE phone = ?",
        [phone],
      );

      if (existing.length) {
        return existing[0].id; // already exist
      }

    const [result] = await db.query(
      "INSERT INTO contacts_wa  (name, phone, tag, stage, assigned_to, color, initials) VALUES (?, ?, ?, ?, ?, ?, ?)",
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
    await db.query("UPDATE contacts_wa  SET ? WHERE id = ?", [data, id]);
  },
  delete: async (id) => {
    await db.query("DELETE FROM contacts_wa  WHERE id = ?", [id]);
  },
  getWithMessages: async (id) => {
    const contact = await Contact.findById(id);
    if (!contact) return null;
    const [messages] = await db.query(
      "SELECT * FROM messages_wa WHERE contact_id = ? ORDER BY time_sent",
      [id],
    );
    const [notes] = await db.query(
      "SELECT note, created_at FROM notes WHERE contact_id = ? ORDER BY created_at DESC",
      [id],
    );
    const [pipeline] = await db.query(
      "SELECT stage_name, done, completed_date FROM pipeline_stages WHERE contact_id = ?",
      [id],
    );
    return { ...contact, messages, notes, pipeline };
  },
  addNote: async (contact_id, note) => {
    await db.query("INSERT INTO notes (contact_id, note) VALUES (?, ?)", [
      contact_id,
      note,
    ]);
  },
  updatePipeline: async (contact_id, stage_name, done, completed_date) => {
    await db.query(
      "UPDATE pipeline_stages SET done = ?, completed_date = ? WHERE contact_id = ? AND stage_name = ?",
      [done, completed_date, contact_id, stage_name],
    );
    if (done) {
      await db.query("UPDATE contacts_wa  SET stage = ? WHERE id = ?", [
        stage_name,
        contact_id,
      ]);
    }
  },
  initPipeline: async (contact_id) => {
    const stages = [
      "New",
      "Enquiry",
      "Qualified",
      "Proposal",
      "Negotiation",
      "Closed Won",
    ];
    for (let s of stages) {
      await db.query(
        "INSERT INTO pipeline_stages (contact_id, stage_name, done) VALUES (?, ?, ?)",
        [contact_id, s, false],
      );
    }
  },
};

module.exports = Contact;
