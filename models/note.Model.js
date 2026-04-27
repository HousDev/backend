// models/note.Model.js

const db = require("../config/database");

const Note = {
  // Get notes for a contact - FIXED for first_name/last_name
  findByContactId: async (contactId) => {
    try {
      const [rows] = await db.query(
        `SELECT n.*, 
          CONCAT(u.first_name, ' ', u.last_name) as author_name 
         FROM notes n
         LEFT JOIN users u ON n.author_id = u.id
         WHERE n.contact_id = ?
         ORDER BY n.created_at DESC`,
        [contactId],
      );
      return rows;
    } catch (error) {
      console.error("Error in findByContactId:", error);
      throw error;
    }
  },

  // Get note by ID - FIXED
  findById: async (id) => {
    try {
      const [rows] = await db.query(
        `SELECT n.*, 
          CONCAT(u.first_name, ' ', u.last_name) as author_name 
         FROM notes n
         LEFT JOIN users u ON n.author_id = u.id
         WHERE n.id = ?`,
        [id],
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error in findById:", error);
      throw error;
    }
  },

  // Create note
  create: async (data) => {
    try {
      const { contact_id, author_id, note } = data;

      const [result] = await db.query(
        `INSERT INTO notes (contact_id, author_id, note, created_at, updated_at) 
         VALUES (?, ?, ?, NOW(), NOW())`,
        [contact_id, author_id || null, note],
      );

      return result.insertId;
    } catch (error) {
      console.error("Error in create:", error);
      throw error;
    }
  },

  // Update note
  update: async (id, note) => {
    try {
      await db.query(
        `UPDATE notes SET note = ?, updated_at = NOW() WHERE id = ?`,
        [note, id],
      );
      return Note.findById(id);
    } catch (error) {
      console.error("Error in update:", error);
      throw error;
    }
  },

  // Delete note
  delete: async (id) => {
    try {
      await db.query("DELETE FROM notes WHERE id = ?", [id]);
      return true;
    } catch (error) {
      console.error("Error in delete:", error);
      throw error;
    }
  },

  // Delete all notes for a contact
  deleteByContactId: async (contactId) => {
    try {
      await db.query("DELETE FROM notes WHERE contact_id = ?", [contactId]);
      return true;
    } catch (error) {
      console.error("Error in deleteByContactId:", error);
      throw error;
    }
  },
};

module.exports = Note;
