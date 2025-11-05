// src/models/PropertyVisit.js
const db = require("../config/database"); // mysql2/promise pool

class PropertyVisit {
  constructor(v) {
    this.buyer_id = v.buyer_id;
    this.buyer_name = v.buyer_name || null;

    this.seller_id = v.seller_id ?? null;

    this.property_id = v.property_id;
    this.property_title = v.property_title || null;

    this.executive_id = v.executive_id ?? null;

    this.visit_datetime = v.visit_datetime;       // ISO -> DATETIME
    this.duration_minutes = v.duration_minutes ?? 60;

    this.visit_type = v.visit_type || "site_visit";
    this.seller_present = v.seller_present ? 1 : 0;
    this.seller_name = v.seller_name || null;
    this.seller_phone = v.seller_phone || null;

    this.feedback = v.feedback || null;
    this.rating = v.rating ?? null;
    this.outcome = v.outcome || null;
    this.next_action = v.next_action || null;
    this.concerns = v.concerns || null;
    this.positives = v.positives || null;
    this.remarks = v.remarks || null;

    this.status = v.status || "scheduled";

    this.created_at = v.created_at || new Date();
    this.updated_at = v.updated_at || new Date();
  }

  // helpers
  static #safeInt(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }
  static #toTinyInt(v) {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["1", "true", "yes", "active"].includes(s)) return 1;
      if (["0", "false", "no", "inactive"].includes(s)) return 0;
      const n = Number(s); return Number.isNaN(n) ? 0 : (n ? 1 : 0);
    }
    if (v === true) return 1;
    if (v === false) return 0;
    const n = Number(v); return Number.isNaN(n) ? 0 : (n ? 1 : 0);
  }
  static #pick(obj, fields) {
    const out = {};
    fields.forEach((f) => { if (obj[f] !== undefined) out[f] = obj[f]; });
    return out;
  }

  // CRUD
  static async create(newVisit) {
    const data = this.#pick(newVisit, [
      "buyer_id","buyer_name","seller_id","property_id","property_title",
      "executive_id","visit_datetime","duration_minutes","visit_type",
      "seller_present","seller_name","seller_phone","feedback","rating",
      "outcome","next_action","concerns","positives","remarks","status",
    ]);

    // normalize
    data.buyer_id = this.#safeInt(data.buyer_id);
    data.seller_id = newVisit.seller_id === "" ? null : this.#safeInt(newVisit.seller_id);
    data.property_id = this.#safeInt(data.property_id);
    data.executive_id = newVisit.executive_id === "" ? null : this.#safeInt(newVisit.executive_id);
    data.duration_minutes = data.duration_minutes != null ? this.#safeInt(data.duration_minutes) : 60;
    data.rating = data.rating != null ? this.#safeInt(data.rating) : null;
    data.seller_present = this.#toTinyInt(data.seller_present);
    data.visit_type = data.visit_type || "site_visit";
    data.status = data.status || "scheduled";

    const cols = Object.keys(data);
    const placeholders = cols.map(() => "?").join(", ");
    const sql = `
      INSERT INTO property_visits
        (${cols.join(", ")}, created_at, updated_at)
      VALUES (${placeholders}, NOW(), NOW())
    `;
    const [res] = await db.query(sql, cols.map(c => data[c]));
    return this.findById(res.insertId);
  }

  static async findById(id) {
    const [rows] = await db.query(`SELECT * FROM property_visits WHERE id = ?`, [id]);
    return rows?.[0] || null;
  }

  static async findWithRevisits(id) {
    const visit = await this.findById(id);
    if (!visit) return null;
    const [revisits] = await db.query(
      `SELECT * FROM property_revisits WHERE visit_id = ? ORDER BY revisit_datetime ASC, id ASC`,
      [id]
    );
    visit.revisits = revisits;
    return visit;
  }

  static async getAll(filters = {}, pagination = {}) {
    const {
      buyer_id, seller_id, property_id, executive_id, status,
      search, from_datetime, to_datetime
    } = filters;

    const where = ["1=1"];
    const vals = [];

    if (buyer_id)      { where.push("buyer_id = ?");      vals.push(this.#safeInt(buyer_id)); }
    if (seller_id)     { where.push("seller_id = ?");     vals.push(this.#safeInt(seller_id)); }
    if (property_id)   { where.push("property_id = ?");   vals.push(this.#safeInt(property_id)); }
    if (executive_id)  { where.push("executive_id = ?");  vals.push(this.#safeInt(executive_id)); }
    if (status)        { where.push("status = ?");        vals.push(status); }
    if (from_datetime) { where.push("visit_datetime >= ?"); vals.push(from_datetime); }
    if (to_datetime)   { where.push("visit_datetime <= ?"); vals.push(to_datetime); }

    if (search) {
      const like = `%${search}%`;
      where.push(`(buyer_name LIKE ? OR property_title LIKE ? OR seller_name LIKE ? OR seller_phone LIKE ?)`);
      vals.push(like, like, like, like);
    }

    const page = Number(pagination.page || 1);
    const limit = Number(pagination.limit || 20);
    const offset = (page - 1) * limit;

    const sql = `
      SELECT SQL_CALC_FOUND_ROWS *
      FROM property_visits
      WHERE ${where.join(" AND ")}
      ORDER BY visit_datetime DESC, id DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await db.query(sql, [...vals, limit, offset]);
    const [[countRow]] = await db.query("SELECT FOUND_ROWS() AS total");
    return { rows, total: countRow.total, page, limit };
  }

  static async updateById(id, updates) {
    const allowed = [
      "buyer_id","buyer_name","seller_id","property_id","property_title",
      "executive_id","visit_datetime","duration_minutes","visit_type",
      "seller_present","seller_name","seller_phone","feedback","rating",
      "outcome","next_action","concerns","positives","remarks","status",
    ];
    const data = this.#pick(updates, allowed);

    if (data.buyer_id !== undefined)    data.buyer_id = this.#safeInt(data.buyer_id);
    if (data.seller_id !== undefined)   data.seller_id = updates.seller_id === "" ? null : this.#safeInt(updates.seller_id);
    if (data.property_id !== undefined) data.property_id = this.#safeInt(data.property_id);
    if (data.executive_id !== undefined) data.executive_id = updates.executive_id === "" ? null : this.#safeInt(updates.executive_id);
    if (data.duration_minutes !== undefined) data.duration_minutes = this.#safeInt(data.duration_minutes);
    if (data.rating !== undefined)      data.rating = this.#safeInt(data.rating);
    if (data.seller_present !== undefined) data.seller_present = this.#toTinyInt(data.seller_present);

    if (!Object.keys(data).length) return { kind: "no_changes" };

    const setParts = Object.keys(data).map(k => `${k} = ?`);
    const values = Object.keys(data).map(k => data[k]);
    setParts.push("updated_at = NOW()");
    values.push(id);

    const sql = `UPDATE property_visits SET ${setParts.join(", ")} WHERE id = ?`;
    const [res] = await db.query(sql, values);
    if (res.affectedRows === 0) return { kind: "not_found" };
    return this.findById(id);
  }

  static async remove(id) {
    const [res] = await db.query(`DELETE FROM property_visits WHERE id = ?`, [id]);
    if (res.affectedRows === 0) return { kind: "not_found" };
    return res;
  }
}

module.exports = PropertyVisit;
