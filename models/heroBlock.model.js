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
              is_active, created_at, updated_at
       FROM ${TABLE}
       ORDER BY updated_at DESC`
    );
    return rows.map((r) => ({ ...r, photos: fromJson(r.photos), is_active: Number(r.is_active) === 1 }));
  },

  async getById(id) {
    const [rows] = await db.execute(
      `SELECT id, title, description, CAST(photos AS CHAR) AS photos,
              is_active, created_at, updated_at
       FROM ${TABLE}
       WHERE id = ? LIMIT 1`,
      [id]
    );
    const r = rows[0];
    if (!r) return null;
    return { ...r, photos: fromJson(r.photos), is_active: Number(r.is_active) === 1 };
  },

  async create({ title, description = null, photos = [], is_active = 1 }) {
    const [res] = await db.execute(
      `INSERT INTO ${TABLE} (title, description, photos, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [title, description, toJson(photos), is_active ? 1 : 0]
    );
    return this.getById(res.insertId);
  },

  async update(id, { title, description, photos, is_active }) {
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
    if (is_active !== undefined) {
      sets.push("is_active = ?");
      vals.push(is_active ? 1 : 0);
    }

    if (!sets.length) return this.getById(id);

    sets.push("updated_at = CURRENT_TIMESTAMP");
    vals.push(id);

    const sql = `UPDATE ${TABLE} SET ${sets.join(", ")} WHERE id = ?`;
    const [res] = await db.execute(sql, vals);
    if (!res.affectedRows) return null;
    return this.getById(id);
  },

  async toggleActive(id) {
    const [res] = await db.execute(
      `UPDATE ${TABLE} SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
    if (!res.affectedRows) return null;
    return this.getById(id);
  },

  async bulkToggleActive(ids, is_active) {
    if (!ids.length) return { affected: 0 };
    const placeholders = ids.map(() => "?").join(",");
    const [res] = await db.execute(
      `UPDATE ${TABLE} SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
      [is_active ? 1 : 0, ...ids]
    );
    return { affected: res.affectedRows };
  },

  async bulkRemove(ids) {
    if (!ids.length) return { affected: 0 };
    const placeholders = ids.map(() => "?").join(",");
    const [res] = await db.execute(
      `DELETE FROM ${TABLE} WHERE id IN (${placeholders})`,
      ids
    );
    return { affected: res.affectedRows };
  },

  async remove(id) {
    const [res] = await db.execute(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    return res.affectedRows > 0;
  },
};
