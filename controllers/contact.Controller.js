// const Contact = require("../models/contact.Model");

// exports.getAllContacts = async (req, res) => {
//   try {
//     const contacts = await Contact.findAll();
//     res.json(contacts);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// exports.getContactById = async (req, res) => {
//   try {
//     const contact = await Contact.getWithMessages(req.params.id);
//     if (!contact) return res.status(404).json({ error: "Not found" });
//     res.json(contact);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// exports.createContact = async (req, res) => {
//   try {
//     const id = await Contact.create(req.body);
//     res.status(201).json({ id });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// exports.updateContact = async (req, res) => {
//   try {
//     await Contact.update(req.params.id, req.body);
//     const updated = await Contact.findById(req.params.id);
//     res.json(updated);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// exports.deleteContact = async (req, res) => {
//   try {
//     await Contact.delete(req.params.id);
//     res.json({ message: "Deleted" });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// exports.addNote = async (req, res) => {
//   try {
//     const { contact_id, note } = req.body;
//     const noteId = await Contact.addNote(contact_id, note);
//     res.status(201).json({ id: noteId, message: "Note added" });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

const Contact = require("../models/contact.Model");
const Tag = require("../models/tag.Model");
const Note = require("../models/note.Model");
const db = require("../config/database");

// Get all contacts
exports.getAllContacts = async (req, res) => {
  try {
    const contacts = await Contact.findAll();
    res.json(contacts);
  } catch (err) {
    console.error("Error in getAllContacts:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get contact by ID with messages
exports.getContactById = async (req, res) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const [messages] = await db.query(
      "SELECT * FROM messages_wa WHERE contact_id = ? ORDER BY time_sent ASC",
      [id],
    );

    const [notes] = await db.query(
      `SELECT n.*, 
        CONCAT(u.first_name, ' ', u.last_name) as author_name
       FROM notes n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.contact_id = ?
       ORDER BY n.created_at DESC`,
      [id],
    );

    const tags = await Tag.getContactTags(id);

    res.json({ ...contact, messages, notes, tags });
  } catch (err) {
    console.error("Error in getContactById:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get contact with full details
exports.getContactWithDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const [notes] = await db.query(
      `SELECT n.*, 
        CONCAT(u.first_name, ' ', u.last_name) as author_name
       FROM notes n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.contact_id = ?
       ORDER BY n.created_at DESC`,
      [id],
    );

    const tags = await Tag.getContactTags(id);

    res.json({ ...contact, notes, tags });
  } catch (err) {
    console.error("Error in getContactWithDetails:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get contact notes
exports.getNotes = async (req, res) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const [notes] = await db.query(
      `SELECT n.*, 
        CONCAT(u.first_name, ' ', u.last_name) as author_name
       FROM notes n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.contact_id = ?
       ORDER BY n.created_at DESC`,
      [id],
    );

    res.json(notes);
  } catch (err) {
    console.error("Error in getNotes:", err);
    res.status(500).json({ error: err.message });
  }
};

// Add note to contact - FIXED (supports both endpoint formats)
exports.addNote = async (req, res) => {
  try {
    // Support both /note and /:id/notes endpoints
    let contact_id = req.body.contact_id || req.params.id;
    let note = req.body.note || req.body.body;

    // Debug logging
    console.log("Add Note Request:", {
      body: req.body,
      params: req.params,
      contact_id,
      note,
    });

    if (!contact_id || !note) {
      return res.status(400).json({
        error: "Contact ID and note are required",
        received: { contact_id, note, body: req.body, params: req.params },
      });
    }

    const authorId = req.body?.user_id || null;

    const contact = await Contact.findById(contact_id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const [result] = await db.query(
      `INSERT INTO notes (contact_id, author_id, note, created_at, updated_at) 
       VALUES (?, ?, ?, NOW(), NOW())`,
      [contact_id, authorId, note],
    );

    const [newNote] = await db.query(
      `SELECT n.*, 
        CONCAT(u.first_name, ' ', u.last_name) as author_name
       FROM notes n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.id = ?`,
      [result.insertId],
    );

    res.status(201).json(newNote[0]);
  } catch (err) {
    console.error("Error in addNote:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update contact stage
exports.updateStage = async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const updated = await Contact.updateStage(id, stage);
    res.json(updated);
  } catch (err) {
    console.error("Error in updateStage:", err);
    res.status(500).json({ error: err.message });
  }
};

// Assign contact to user
exports.assignContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const updated = await Contact.assignToUser(id, assigned_to);
    res.json(updated);
  } catch (err) {
    console.error("Error in assignContact:", err);
    res.status(500).json({ error: err.message });
  }
};

// Add tag to contact
exports.addTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { tag_id } = req.body;

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const tag = await Tag.findById(tag_id);
    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }

    await Contact.addTag(id, tag_id);
    const tags = await Tag.getContactTags(id);
    res.json({ success: true, tags });
  } catch (err) {
    console.error("Error in addTag:", err);
    res.status(500).json({ error: err.message });
  }
};

// Remove tag from contact
exports.removeTag = async (req, res) => {
  try {
    const { id, tagId } = req.params;

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    await Contact.removeTag(id, tagId);
    const tags = await Tag.getContactTags(id);
    res.json({ success: true, tags });
  } catch (err) {
    console.error("Error in removeTag:", err);
    res.status(500).json({ error: err.message });
  }
};

// Search contacts
exports.searchContacts = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: "Search query required" });
    }
    const contacts = await Contact.search(q);
    res.json(contacts);
  } catch (err) {
    console.error("Error in searchContacts:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get contact statistics
exports.getStats = async (req, res) => {
  try {
    const stats = await Contact.getStats();
    res.json(stats);
  } catch (err) {
    console.error("Error in getStats:", err);
    res.status(500).json({ error: err.message });
  }
};

// Create contact
exports.createContact = async (req, res) => {
  try {
    const id = await Contact.create(req.body);
    const newContact = await Contact.findById(id);
    res.status(201).json(newContact);
  } catch (err) {
    console.error("Error in createContact:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update contact
exports.updateContact = async (req, res) => {
  try {
    await Contact.update(req.params.id, req.body);
    const updated = await Contact.findById(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error("Error in updateContact:", err);
    res.status(500).json({ error: err.message });
  }
};

// Delete contact
exports.deleteContact = async (req, res) => {
  try {
    await Contact.delete(req.params.id);
    res.json({ success: true, message: "Contact deleted" });
  } catch (err) {
    console.error("Error in deleteContact:", err);
    res.status(500).json({ error: err.message });
  }
};