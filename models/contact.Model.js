// // module.exports = Contact;
// const db = require("../config/database");

// const Contact = {
//  findAll: async () => {
//   const [rows] = await db.query(
//     "SELECT * FROM contacts_wa ORDER BY last_contact_time DESC",
//   );
//   return rows;
// },

//   findById: async (id) => {
//     const [rows] = await db.query("SELECT * FROM contacts_wa WHERE id = ?", [
//       id,
//     ]);
//     return rows[0];
//   },

//   create: async (data) => {
//     const { name, phone, tag, stage, assigned_to, color, initials } = data;
//     if (!name || !phone) {
//       throw new Error("Name and phone required");
//     }

//     // Duplicate check
//     const [existing] = await db.query(
//       "SELECT id FROM contacts_wa WHERE phone = ?",
//       [phone],
//     );

//     if (existing.length) {
//       return existing[0].id;
//     }

//     const [result] = await db.query(
//       "INSERT INTO contacts_wa (name, phone, tag, stage, assigned_to, color, initials) VALUES (?, ?, ?, ?, ?, ?, ?)",
//       [
//         name,
//         phone,
//         tag || "new",
//         stage || "New",
//         assigned_to || "Unassigned",
//         color || "blue",
//         initials || name.slice(0, 2).toUpperCase(),
//       ],
//     );
//     return result.insertId;
//   },

//   update: async (id, data) => {
//     // Build dynamic update query
//     const fields = [];
//     const values = [];

//     for (const [key, value] of Object.entries(data)) {
//       if (value !== undefined) {
//         fields.push(`${key} = ?`);
//         values.push(value);
//       }
//     }

//     if (fields.length === 0) return;

//     values.push(id);
//     await db.query(
//       `UPDATE contacts_wa SET ${fields.join(", ")} WHERE id = ?`,
//       values,
//     );
//   },

//   delete: async (id) => {
//     await db.query("DELETE FROM contacts_wa WHERE id = ?", [id]);
//   },

//   getWithMessages: async (id) => {
//     const contact = await Contact.findById(id);
//     if (!contact) return null;

//     const [messages] = await db.query(
//       "SELECT * FROM messages_wa WHERE contact_id = ? ORDER BY time_sent ASC",
//       [id],
//     );

//     const [notes] = await db.query(
//       "SELECT note, created_at FROM notes WHERE contact_id = ? ORDER BY created_at DESC",
//       [id],
//     );

//     return { ...contact, messages, notes };
//   },

//   addNote: async (contact_id, note) => {
//     const [result] = await db.query(
//       "INSERT INTO notes (contact_id, note) VALUES (?, ?)",
//       [contact_id, note],
//     );
//     return result.insertId;
//   },
// };

// module.exports = Contact;

const db = require("../config/database");
const Tag = require("./tag.Model");
const Note = require("./note.Model");

const Contact = {
  findAll: async () => {
    try {
      const [rows] = await db.query(
        `SELECT c.*, 
                (SELECT COUNT(*) FROM contact_tags WHERE contact_id = c.id) as tag_count,
                (SELECT COUNT(*) FROM notes WHERE contact_id = c.id) as note_count
         FROM contacts_wa c 
         ORDER BY c.last_contact_time DESC`,
      );
      return rows;
    } catch (error) {
      console.error("Error in findAll:", error);
      throw error;
    }
  },

  findById: async (id) => {
    try {
      const [rows] = await db.query("SELECT * FROM contacts_wa WHERE id = ?", [
        id,
      ]);
      return rows[0] || null;
    } catch (error) {
      console.error("Error in findById:", error);
      throw error;
    }
  },

  // Get contact with all details (messages, notes, tags)
  getWithMessages: async (id) => {
    try {
      const contact = await Contact.findById(id);
      if (!contact) return null;

      const [messages] = await db.query(
        `SELECT * FROM messages_wa 
         WHERE contact_id = ? 
         ORDER BY time_sent ASC`,
        [id],
      );

      const [notes] = await db.query(
        `SELECT n.*, u.name as author_name 
         FROM notes n
         LEFT JOIN users u ON n.author_id = u.id
         WHERE n.contact_id = ? 
         ORDER BY n.created_at DESC`,
        [id],
      );

      const tags = await Tag.getContactTags(id);

      return { ...contact, messages, notes, tags };
    } catch (error) {
      console.error("Error in getWithMessages:", error);
      throw error;
    }
  },

  create: async (data) => {
    try {
      const {
        name,
        phone,
        email,
        tag,
        stage,
        assigned_to,
        color,
        initials,
        preferred_location,
        property_type,
        source,
        budget_min,
        budget_max,
      } = data;

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
        `INSERT INTO contacts_wa 
         (name, phone, email, tag, stage, assigned_to, color, initials, 
          preferred_location, property_type, source, budget_min, budget_max, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          name,
          phone,
          email || null,
          tag || "new",
          stage || "New",
          assigned_to || "Unassigned",
          color || "blue",
          initials || name.slice(0, 2).toUpperCase(),
          preferred_location || null,
          property_type || null,
          source || null,
          budget_min || null,
          budget_max || null,
        ],
      );
      return result.insertId;
    } catch (error) {
      console.error("Error in create:", error);
      throw error;
    }
  },

  update: async (id, data) => {
    try {
      const fields = [];
      const values = [];
      const allowedFields = [
        "name",
        "phone",
        "email",
        "tag",
        "stage",
        "assigned_to",
        "color",
        "initials",
        "preferred_location",
        "property_type",
        "source",
        "budget_min",
        "budget_max",
        "notes",
      ];

      for (const [key, value] of Object.entries(data)) {
        if (allowedFields.includes(key) && value !== undefined) {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (fields.length === 0) return;

      fields.push("updated_at = NOW()");
      values.push(id);

      await db.query(
        `UPDATE contacts_wa SET ${fields.join(", ")} WHERE id = ?`,
        values,
      );

      return Contact.findById(id);
    } catch (error) {
      console.error("Error in update:", error);
      throw error;
    }
  },

  delete: async (id) => {
    try {
      // Delete related records first (cascade will handle, but explicit for safety)
      await db.query("DELETE FROM contact_tags WHERE contact_id = ?", [id]);
      await db.query("DELETE FROM notes WHERE contact_id = ?", [id]);
      await db.query("DELETE FROM messages_wa WHERE contact_id = ?", [id]);
      await db.query("DELETE FROM contacts_wa WHERE id = ?", [id]);
      return true;
    } catch (error) {
      console.error("Error in delete:", error);
      throw error;
    }
  },

  // Update contact stage
  updateStage: async (id, stage) => {
    try {
      await db.query(
        `UPDATE contacts_wa SET stage = ?, updated_at = NOW() WHERE id = ?`,
        [stage, id],
      );
      return Contact.findById(id);
    } catch (error) {
      console.error("Error in updateStage:", error);
      throw error;
    }
  },

  // Assign contact to user
  assignToUser: async (contactId, userId) => {
    try {
      await db.query(
        `UPDATE contacts_wa SET assigned_to = ?, updated_at = NOW() WHERE id = ?`,
        [userId, contactId],
      );
      return Contact.findById(contactId);
    } catch (error) {
      console.error("Error in assignToUser:", error);
      throw error;
    }
  },

  // Add note to contact
  addNote: async (contactId, authorId, note) => {
    try {
      const [result] = await db.query(
        `INSERT INTO notes (contact_id, author_id, note, created_at, updated_at) 
         VALUES (?, ?, ?, NOW(), NOW())`,
        [contactId, authorId, note],
      );

      // Return the created note with author info
      const [newNote] = await db.query(
        `SELECT n.*, u.name as author_name 
         FROM notes n
         LEFT JOIN users u ON n.author_id = u.id
         WHERE n.id = ?`,
        [result.insertId],
      );

      return newNote[0];
    } catch (error) {
      console.error("Error in addNote:", error);
      throw error;
    }
  },

  // Get notes for contact
  getNotes: async (contactId) => {
    try {
      const [rows] = await db.query(
        `SELECT n.*, u.name as author_name 
         FROM notes n
         LEFT JOIN users u ON n.author_id = u.id
         WHERE n.contact_id = ? 
         ORDER BY n.created_at DESC`,
        [contactId],
      );
      return rows;
    } catch (error) {
      console.error("Error in getNotes:", error);
      throw error;
    }
  },

  // Add tag to contact
  addTag: async (contactId, tagId) => {
    try {
      await db.query(
        `INSERT IGNORE INTO contact_tags (contact_id, tag_id, created_at) 
         VALUES (?, ?, NOW())`,
        [contactId, tagId],
      );
      return Tag.getContactTags(contactId);
    } catch (error) {
      console.error("Error in addTag:", error);
      throw error;
    }
  },

  // Remove tag from contact
  removeTag: async (contactId, tagId) => {
    try {
      await db.query(
        `DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?`,
        [contactId, tagId],
      );
      return Tag.getContactTags(contactId);
    } catch (error) {
      console.error("Error in removeTag:", error);
      throw error;
    }
  },

  // Get contact with all details
  getWithFullDetails: async (id) => {
    try {
      const contact = await Contact.findById(id);
      if (!contact) return null;

      const tags = await Tag.getContactTags(id);
      const notes = await Contact.getNotes(id);

      return {
        ...contact,
        tags,
        notes,
      };
    } catch (error) {
      console.error("Error in getWithFullDetails:", error);
      throw error;
    }
  },

  // Search contacts
  search: async (query) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM contacts_wa 
         WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? 
         ORDER BY created_at DESC`,
        [`%${query}%`, `%${query}%`, `%${query}%`],
      );
      return rows;
    } catch (error) {
      console.error("Error in search:", error);
      throw error;
    }
  },

  // Get contacts by stage
  findByStage: async (stage) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM contacts_wa WHERE stage = ? ORDER BY created_at DESC`,
        [stage],
      );
      return rows;
    } catch (error) {
      console.error("Error in findByStage:", error);
      throw error;
    }
  },

  // Get contacts by assigned user
  findByAssignedTo: async (userId) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM contacts_wa WHERE assigned_to = ? ORDER BY last_contact_time DESC`,
        [userId],
      );
      return rows;
    } catch (error) {
      console.error("Error in findByAssignedTo:", error);
      throw error;
    }
  },

  // Update last contact time
  updateLastContactTime: async (id) => {
    try {
      await db.query(
        `UPDATE contacts_wa SET last_contact_time = NOW(), updated_at = NOW() WHERE id = ?`,
        [id],
      );
    } catch (error) {
      console.error("Error in updateLastContactTime:", error);
      throw error;
    }
  },

  // Get contact statistics
  getStats: async () => {
    try {
      const [rows] = await db.query(
        `SELECT 
          COUNT(*) as total_contacts,
          SUM(CASE WHEN stage = 'New' THEN 1 ELSE 0 END) as new_leads,
          SUM(CASE WHEN stage = 'Contacted' THEN 1 ELSE 0 END) as contacted,
          SUM(CASE WHEN stage = 'Qualified' THEN 1 ELSE 0 END) as qualified,
          SUM(CASE WHEN stage = 'Site Visit' THEN 1 ELSE 0 END) as site_visit,
          SUM(CASE WHEN stage = 'Closed' THEN 1 ELSE 0 END) as closed,
          SUM(CASE WHEN stage = 'Lost' THEN 1 ELSE 0 END) as lost
         FROM contacts_wa`,
      );
      return rows[0];
    } catch (error) {
      console.error("Error in getStats:", error);
      throw error;
    }
  },
};

module.exports = Contact;