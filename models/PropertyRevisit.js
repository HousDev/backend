// src/models/PropertyRevisit.js
const db = require("../config/database"); // mysql2/promise pool

class PropertyRevisit {
  constructor(r) {
    this.visit_id = r.visit_id;
    this.executive_id = r.executive_id ?? null;

    this.revisit_datetime = r.revisit_datetime;   // ISO -> DATETIME
    this.duration_minutes = r.duration_minutes ?? 60;

    this.status = r.status || "scheduled";
    this.feedback = r.feedback || null;
    this.rating = r.rating ?? null;
    this.remarks = r.remarks || null;

    this.created_at = r.created_at || new Date();
    this.updated_at = r.updated_at || new Date();
  }

  static #safeInt(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }
  static #pick(obj, fields) {
    const out = {};
    fields.forEach((f) => { if (obj[f] !== undefined) out[f] = obj[f]; });
    return out;
  }

  static async create(newRevisit) {
    const data = this.#pick(newRevisit, [
      "visit_id","executive_id","revisit_datetime","duration_minutes",
      "status","feedback","rating","remarks",
    ]);

    data.visit_id = this.#safeInt(data.visit_id);
    data.executive_id = newRevisit.executive_id === "" ? null : this.#safeInt(newRevisit.executive_id);
    data.duration_minutes = data.duration_minutes != null ? this.#safeInt(data.duration_minutes) : 60;
    data.rating = data.rating != null ? this.#safeInt(data.rating) : null;
    data.status = data.status || "scheduled";

    const cols = Object.keys(data);
    const placeholders = cols.map(() => "?").join(", ");
    const sql = `
      INSERT INTO property_revisits
        (${cols.join(", ")}, created_at, updated_at)
      VALUES (${placeholders}, NOW(), NOW())
    `;
    const [res] = await db.query(sql, cols.map(c => data[c]));
    return this.findById(res.insertId);
  }

  static async findById(id) {
    const [rows] = await db.query(`SELECT * FROM property_revisits WHERE id = ?`, [id]);
    return rows?.[0] || null;
  }

  static async listByVisit(visitId) {
    const [rows] = await db.query(
      `SELECT * FROM property_revisits WHERE visit_id = ? ORDER BY revisit_datetime ASC, id ASC`,
      [this.#safeInt(visitId)]
    );
    return rows;
  }

  static async updateById(id, updates) {
    const allowed = [
      "visit_id","executive_id","revisit_datetime","duration_minutes",
      "status","feedback","rating","remarks",
    ];
    const data = this.#pick(updates, allowed);

    if (data.visit_id !== undefined)       data.visit_id = this.#safeInt(data.visit_id);
    if (data.executive_id !== undefined)   data.executive_id = updates.executive_id === "" ? null : this.#safeInt(updates.executive_id);
    if (data.duration_minutes !== undefined) data.duration_minutes = this.#safeInt(data.duration_minutes);
    if (data.rating !== undefined)         data.rating = this.#safeInt(data.rating);

    if (!Object.keys(data).length) return { kind: "no_changes" };

    const setParts = Object.keys(data).map(k => `${k} = ?`);
    const values = Object.keys(data).map(k => data[k]);
    setParts.push("updated_at = NOW()");
    values.push(id);

    const sql = `UPDATE property_revisits SET ${setParts.join(", ")} WHERE id = ?`;
    const [res] = await db.query(sql, values);
    if (res.affectedRows === 0) return { kind: "not_found" };
    return this.findById(id);
  }

  static async remove(id) {
    const [res] = await db.query(`DELETE FROM property_revisits WHERE id = ?`, [id]);
    if (res.affectedRows === 0) return { kind: "not_found" };
    return res;
  }
}

module.exports = PropertyRevisit;
