const db = require("../config/database");

const Tag = {
  // Get all tags
  findAll: async () => {
    try {
      const [rows] = await db.query(`SELECT * FROM tags ORDER BY name ASC`);
      return rows;
    } catch (error) {
      console.error("Error in findAll:", error);
      throw error;
    }
  },

  // Get tag by ID
  findById: async (id) => {
    try {
      const [rows] = await db.query("SELECT * FROM tags WHERE id = ?", [id]);
      return rows[0] || null;
    } catch (error) {
      console.error("Error in findById:", error);
      throw error;
    }
  },

  // Get tag by name
  findByName: async (name) => {
    try {
      const [rows] = await db.query("SELECT * FROM tags WHERE name = ?", [
        name,
      ]);
      return rows[0] || null;
    } catch (error) {
      console.error("Error in findByName:", error);
      throw error;
    }
  },

  // Create new tag
  create: async (data) => {
    try {
      const { name, color, created_by } = data;

      const [result] = await db.query(
        `INSERT INTO tags (name, color, created_by, created_at, updated_at) 
         VALUES (?, ?, ?, NOW(), NOW())`,
        [name, color || "#3B82F6", created_by || null],
      );

      return result.insertId;
    } catch (error) {
      console.error("Error in create:", error);
      throw error;
    }
  },

  // Update tag
  update: async (id, data) => {
    try {
      const fields = [];
      const values = [];

      if (data.name !== undefined) {
        fields.push("name = ?");
        values.push(data.name);
      }
      if (data.color !== undefined) {
        fields.push("color = ?");
        values.push(data.color);
      }

      if (fields.length === 0) return null;

      fields.push("updated_at = NOW()");
      values.push(id);

      await db.query(
        `UPDATE tags SET ${fields.join(", ")} WHERE id = ?`,
        values,
      );
      return Tag.findById(id);
    } catch (error) {
      console.error("Error in update:", error);
      throw error;
    }
  },

  // Delete tag
  delete: async (id) => {
    try {
      await db.query("DELETE FROM tags WHERE id = ?", [id]);
      return true;
    } catch (error) {
      console.error("Error in delete:", error);
      throw error;
    }
  },

  // Get tags for a contact
  getContactTags: async (contactId) => {
    try {
      const [rows] = await db.query(
        `SELECT t.* FROM tags t
         INNER JOIN contact_tags ct ON t.id = ct.tag_id
         WHERE ct.contact_id = ?
         ORDER BY t.name ASC`,
        [contactId],
      );
      return rows;
    } catch (error) {
      console.error("Error in getContactTags:", error);
      throw error;
    }
  },
};

module.exports = Tag;
