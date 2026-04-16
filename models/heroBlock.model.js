// models/heroBlock.model.js
const db = require("../config/database");
const TABLE = "hero_blocks";

const toJson = (v) => JSON.stringify(Array.isArray(v) ? v : []);
const fromJson = (s) => {
  try {
    if (!s) return [];
    if (Buffer.isBuffer(s)) s = s.toString("utf8");
    if (typeof s === "string") return JSON.parse(s || "[]");
    if (Array.isArray(s)) return s;
    return [];
  } catch {
    return [];
  }
};

module.exports = {
  async list() {
    const [rows] = await db.query(
      `SELECT id, title, description, CAST(photos AS CHAR) AS photos,
              created_at, updated_at
       FROM ${TABLE}
       ORDER BY updated_at DESC`
    );
    return rows.map((r) => ({ ...r, photos: fromJson(r.photos) }));
  },

  async getById(id) {
    const [rows] = await db.execute(
      `SELECT id, title, description, CAST(photos AS CHAR) AS photos,
              created_at, updated_at
       FROM ${TABLE}
       WHERE id = ? LIMIT 1`,
      [id]
    );
    const r = rows[0];
    if (!r) return null;
    return { ...r, photos: fromJson(r.photos) };
  },

  async create({ title, description = null, photos = [] }) {
    const [res] = await db.execute(
      `INSERT INTO ${TABLE} (title, description, photos, created_at, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [title, description, toJson(photos)]
    );
    return this.getById(res.insertId);
  },

  async update(id, { title, description, photos }) {
    const sets = [];
    const vals = [];

    if (title !== undefined) {
      sets.push("title = ?");
      vals.push(title);
    }
    if (description !== undefined) {
      sets.push("description = ?");
      vals.push(description);
    }
    if (photos !== undefined) {
      sets.push("photos = ?");
      vals.push(toJson(photos));
    }

    if (!sets.length) return this.getById(id);

    sets.push("updated_at = CURRENT_TIMESTAMP");
    vals.push(id);

    const sql = `UPDATE ${TABLE} SET ${sets.join(", ")} WHERE id = ?`;
    const [res] = await db.execute(sql, vals);
    if (!res.affectedRows) return null;
    return this.getById(id);
  },

  async remove(id) {
    const [res] = await db.execute(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    return res.affectedRows > 0;
  },
};
