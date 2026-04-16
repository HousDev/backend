// src/models/PropertyVisit.js
const db = require("../config/database"); // mysql2/promise pool

class PropertyVisit {
  constructor(v = {}) {
    // buyer (cached columns in visits table; may or may not exist)
    this.buyer_id = v.buyer_id;
    this.buyer_salutation = v.buyer_salutation || null;
    this.buyer_name = v.buyer_name || null;
    this.buyer_email = v.buyer_email || null;
    this.buyer_phone = v.buyer_phone || null;

    // seller (cached)
    this.seller_id = v.seller_id ?? null;
    this.seller_salutation = v.seller_salutation || null;
    this.seller_name = v.seller_name || null;
    this.seller_email = v.seller_email || null;
    this.seller_phone = v.seller_phone || null;

    // property
    this.property_id = v.property_id;
    this.property_title = v.property_title || null;

    // executive (cached)
    this.executive_id = v.executive_id ?? null;
    this.executive_salutation = v.executive_salutation || null;
    this.executive_name = v.executive_name || null;
    this.executive_email = v.executive_email || null;
    this.executive_phone = v.executive_phone || null;

    // schedule
    this.visit_datetime = v.visit_datetime || null;
    this.visit_date = v.visit_date || null;
    this.visit_time = v.visit_time || null;

    // meta
    this.duration_minutes = v.duration_minutes ?? 60;
    this.visit_type = v.visit_type || "site_visit";
    this.meet_point = v.meet_point || null;
    this.seller_present = PropertyVisit.#toTinyInt(v.seller_present);
    this.accompanied_by = v.accompanied_by ?? null;

    this.feedback = v.feedback || null;
    this.rating = v.rating ?? null;
    this.outcome = v.outcome || null;
    this.next_action = v.next_action || null;
    this.next_action_due = v.next_action_due || null;

    this.concerns = v.concerns || null;
    this.positives = v.positives || null;
    this.remarks = v.remarks || null;

    this.status = v.status || "scheduled";
    this.created_at = v.created_at || new Date();
    this.updated_at = v.updated_at || new Date();
  }

  /* ---------------- internals ---------------- */
  static #columnsCache = null;
  static async #getVisitColumns() {
    if (this.#columnsCache) return this.#columnsCache;
    const [rows] = await db.query(`SHOW COLUMNS FROM property_visits`);
    this.#columnsCache = new Set(rows.map(r => r.Field));
    return this.#columnsCache;
  }

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
  static #toJSONOrNull(v) {
    if (v === undefined || v === null || v === "") return null;
    try {
      if (typeof v === "string") {
        try { JSON.parse(v); return v; } catch { return JSON.stringify([v]); }
      }
      return JSON.stringify(v);
    } catch { return null; }
  }
  static #parseJSONSafe(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v !== "string") return v;
    try { return JSON.parse(v); } catch { return v; }
  }
  static #splitISOToDateTime(iso) {
    if (!iso) return { date: null, time: null };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: null, time: null };
    const pad = (n) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return { date, time };
  }
  static #joinName({ salutation, name, first, last, fallback }) {
    const base = (name || [first, last].filter(Boolean).join(" ")).toString().trim();
    const s = (salutation || "").toString().trim();
    const full = [s, base].filter(Boolean).join(" ").trim();
    return full || (fallback || null);
  }

  /* --------- resolvers: buyers/sellers/users -> names & phones --------- */
  static async #resolveBuyer(buyer_id) {
    const id = this.#safeInt(buyer_id);
    if (!id) return {};
    const [rows] = await db.query(
      `SELECT id, salutation, name, email, phone
       FROM buyers
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    if (!rows?.[0]) return {};
    const r = rows[0];
    const buyer_name = this.#joinName({
      salutation: r.salutation,
      name: r.name,
      fallback: r.name
    });
    return {
      buyer_id: id,
      buyer_salutation: r.salutation || null,
      buyer_name,
      buyer_email: r.email || null,
      buyer_phone: r.phone || null,
    };
  }

  static async #resolveSeller(seller_id) {
    const id = this.#safeInt(seller_id);
    if (!id) return {};
    const [rows] = await db.query(
      `SELECT id, salutation, name, email, phone
       FROM sellers
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    if (!rows?.[0]) return {};
    const r = rows[0];
    const seller_name = this.#joinName({
      salutation: r.salutation,
      name: r.name,
      fallback: r.name
    });
    return {
      seller_id: id,
      seller_salutation: r.salutation || null,
      seller_name,
      seller_email: r.email || null,
      seller_phone: r.phone || null,
    };
  }

  static async #resolveExecutive(executive_id) {
    const id = this.#safeInt(executive_id);
    if (!id) return {};
    const [rows] = await db.query(
      `SELECT id, salutation, first_name, last_name, email, phone
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    if (!rows?.[0]) return {};
    const { salutation, first_name, last_name, email, phone } = rows[0];
    const executive_name = this.#joinName({
      salutation,
      first: first_name,
      last: last_name,
      fallback: [first_name, last_name].filter(Boolean).join(" ")
    });
    return {
      executive_id: id,
      executive_salutation: salutation || null,
      executive_name,
      executive_email: email || null,
      executive_phone: phone || null,
    };
  }

  static async #hydrateParties(data) {
    const jobs = [];
    if (data.buyer_id != null) jobs.push(this.#resolveBuyer(data.buyer_id));
    if (data.seller_id != null) jobs.push(this.#resolveSeller(data.seller_id));
    if (data.executive_id != null) jobs.push(this.#resolveExecutive(data.executive_id));
    const merged = Object.assign({}, ...(await Promise.all(jobs)));

    const prefer = (manual, auto) =>
      (manual !== undefined && manual !== null && manual !== "" ? manual : (auto ?? null));

    return {
      // buyer
      buyer_id: merged.buyer_id ?? data.buyer_id ?? null,
      buyer_salutation: prefer(data.buyer_salutation, merged.buyer_salutation),
      buyer_name:       prefer(data.buyer_name,       merged.buyer_name),
      buyer_email:      prefer(data.buyer_email,      merged.buyer_email),
      buyer_phone:      prefer(data.buyer_phone,      merged.buyer_phone),

      // seller
      seller_id: merged.seller_id ?? data.seller_id ?? null,
      seller_salutation: prefer(data.seller_salutation, merged.seller_salutation),
      seller_name:       prefer(data.seller_name,       merged.seller_name),
      seller_email:      prefer(data.seller_email,      merged.seller_email),
      seller_phone:      prefer(data.seller_phone,      merged.seller_phone),

      // executive
      executive_id: merged.executive_id ?? data.executive_id ?? null,
      executive_salutation: prefer(data.executive_salutation, merged.executive_salutation),
      executive_name:       prefer(data.executive_name,       merged.executive_name),
      executive_email:      prefer(data.executive_email,      merged.executive_email),
      executive_phone:      prefer(data.executive_phone,      merged.executive_phone),
    };
  }

  /* ------------------------------- CRUD ------------------------------- */
  static async create(payload) {
    const columns = await this.#getVisitColumns();

    const allowed = [
      // buyer (cached fields if exist)
      "buyer_id","buyer_salutation","buyer_name","buyer_email","buyer_phone",
      // seller
      "seller_id","seller_salutation","seller_name","seller_email","seller_phone",
      // property
      "property_id","property_title",
      // executive (cached)
      "executive_id","executive_salutation","executive_name","executive_email","executive_phone",
      // schedule + meta
      "visit_date","visit_time","visit_datetime",
      "duration_minutes","visit_type","meet_point","seller_present",
      "accompanied_by",
      "feedback","rating","outcome","next_action","next_action_due",
      "concerns","positives","remarks","status",
    ];
    const data = this.#pick(payload, allowed);

    // normalize
    data.buyer_id = this.#safeInt(data.buyer_id);
    data.seller_id = payload.seller_id === "" ? null : this.#safeInt(payload.seller_id);
    data.property_id = this.#safeInt(data.property_id);
    data.executive_id = payload.executive_id === "" ? null : this.#safeInt(payload.executive_id);
    data.duration_minutes = data.duration_minutes != null ? this.#safeInt(data.duration_minutes) : 60;
    data.rating = data.rating != null ? this.#safeInt(data.rating) : null;
    data.seller_present = this.#toTinyInt(data.seller_present);
    data.visit_type = data.visit_type || "site_visit";
    data.status = data.status || "scheduled";
    data.accompanied_by = this.#toJSONOrNull(data.accompanied_by);

    // derive live party details into cached columns
    Object.assign(data, await this.#hydrateParties(data));

    // handle date/time split if only datetime given
    let visit_date = data.visit_date || null;
    let visit_time = data.visit_time || null;
    if ((!visit_date || !visit_time) && data.visit_datetime) {
      const split = this.#splitISOToDateTime(data.visit_datetime);
      visit_date = visit_date || split.date;
      visit_time = visit_time || split.time;
    }
    if (!visit_date || !visit_time) {
      throw new Error("visit_date & visit_time (or visit_datetime) are required");
    }

    // keep only columns that exist in your table
    const cols = allowed.filter(c => columns.has(c)).filter(c => c !== "visit_datetime");
    const placeholders = cols.map(() => "?").join(", ");
    const params = cols.map(c => {
      if (c === "visit_date") return visit_date;
      if (c === "visit_time") return visit_time;
      return data[c] ?? null;
    });

    const sql = `
      INSERT INTO property_visits
        (${cols.join(", ")}, created_at, updated_at)
      VALUES (${placeholders}, NOW(), NOW())
    `;
    const [res] = await db.query(sql, params);
    return this.findWithRevisits(res.insertId);
  }

  /* ---------- helpers to post-process rows ---------- */
  static #massageVisitRow(row) {
    if (!row) return row;
    if (row.accompanied_by !== undefined) {
      row.accompanied_by = this.#parseJSONSafe(row.accompanied_by);
    }
    return row;
  }
  static #massageVisitRows(rows) {
    return rows.map(r => this.#massageVisitRow(r));
  }

  /* ---------- Single visit with joined info ---------- */
  static async findById(id) {
    const sql = `
      SELECT
        v.*,

        DATE_FORMAT(v.visit_date, '%Y-%m-%d') AS visit_date,
        TIME_FORMAT(v.visit_time, '%H:%i:%s') AS visit_time,
        DATE_FORMAT(v.visit_datetime, '%Y-%m-%d %H:%i:%s') AS visit_datetime,

        /* Buyer fields (full name, email, phone) — phone prefers buyers table */
        CONCAT_WS(' ', b.salutation, b.name)                AS buyer_full_name,
        b.email                                             AS buyer_email,
        COALESCE(b.phone, v.buyer_phone)                    AS buyer_phone,

        /* Seller fields (full name, email, phone) — phone prefers sellers table */
        CONCAT_WS(' ', s.salutation, s.name)                AS seller_full_name,
        s.email                                             AS seller_email,
        COALESCE(s.phone, v.seller_phone)                   AS seller_phone,

        /* Executive fields (salutation + first + last, email, phone) */
        CONCAT_WS(' ',
          u.salutation,
          CONCAT_WS(' ', u.first_name, u.last_name)
        )                                                   AS executive_full_name,
        u.email                                             AS executive_email,
        u.phone                                             AS executive_phone

      FROM property_visits v
      LEFT JOIN buyers  b ON v.buyer_id = b.id
      LEFT JOIN sellers s ON v.seller_id = s.id
      LEFT JOIN users   u ON v.executive_id = u.id
      WHERE v.id = ?
      LIMIT 1
    `;
    const [rows] = await db.query(sql, [id]);
    return this.#massageVisitRow(rows?.[0] || null);
  }

  static async findWithRevisits(id) {
    const visit = await this.findById(id);
    if (!visit) return null;
    const sql = `
      SELECT
        r.*,
        DATE_FORMAT(r.revisit_date, '%Y-%m-%d') AS revisit_date,
        TIME_FORMAT(r.revisit_time, '%H:%i:%s') AS revisit_time,
        DATE_FORMAT(r.revisit_datetime, '%Y-%m-%d %H:%i:%s') AS revisit_datetime,

        CONCAT_WS(' ',
          u.salutation,
          CONCAT_WS(' ', u.first_name, u.last_name)
        )                             AS executive_full_name,
        u.email                        AS executive_email,
        u.phone                        AS executive_phone
      FROM property_revisits r
      LEFT JOIN users u ON r.executive_id = u.id
      WHERE r.visit_id = ?
      ORDER BY r.revisit_datetime ASC, r.id ASC
    `;
    const [revisits] = await db.query(sql, [id]);
    visit.revisits = this.#massageVisitRows(revisits);
    return visit;
  }

  /* ---------- List with filters + joined party details ---------- */
  static async getAll(filters = {}, pagination = {}) {
    const {
      buyer_id, seller_id, property_id, executive_id, status,
      search, from_datetime, to_datetime, from_date, to_date
    } = filters;

    const where = ["1=1"];
    const vals = [];

    if (buyer_id)      { where.push("v.buyer_id = ?");      vals.push(this.#safeInt(buyer_id)); }
    if (seller_id)     { where.push("v.seller_id = ?");     vals.push(this.#safeInt(seller_id)); }
    if (property_id)   { where.push("v.property_id = ?");   vals.push(this.#safeInt(property_id)); }
    if (executive_id)  { where.push("v.executive_id = ?");  vals.push(this.#safeInt(executive_id)); }
    if (status)        { where.push("v.status = ?");        vals.push(status); }

    if (from_datetime) { where.push("v.visit_datetime >= ?"); vals.push(from_datetime); }
    if (to_datetime)   { where.push("v.visit_datetime <= ?"); vals.push(to_datetime); }
    if (from_date)     { where.push("v.visit_date >= ?");     vals.push(from_date); }
    if (to_date)       { where.push("v.visit_date <= ?");     vals.push(to_date); }

    if (search) {
      const like = `%${search}%`;
      where.push(`(
        v.buyer_name LIKE ? OR v.property_title LIKE ? OR v.seller_name LIKE ?
        OR v.seller_phone LIKE ? OR v.buyer_phone LIKE ? OR v.buyer_email LIKE ? OR v.seller_email LIKE ?
        OR CONCAT_WS(' ', b.salutation, b.name) LIKE ?
        OR b.phone LIKE ?
        OR s.name LIKE ?
        OR s.phone LIKE ?
        OR CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) LIKE ?
      )`);
      vals.push(like, like, like, like, like, like, like, like, like, like, like, like);
    }

    const page = Number(pagination.page || 1);
    const limit = Number(pagination.limit || 20);
    const offset = (page - 1) * limit;

    const sql = `
      SELECT SQL_CALC_FOUND_ROWS
        v.*,

        DATE_FORMAT(v.visit_date, '%Y-%m-%d') AS visit_date,
        TIME_FORMAT(v.visit_time, '%H:%i:%s') AS visit_time,
        DATE_FORMAT(v.visit_datetime, '%Y-%m-%d %H:%i:%s') AS visit_datetime,

        /* Buyer: full name, email, phone (phone prefers buyers table) */
        CONCAT_WS(' ', b.salutation, b.name)                AS buyer_full_name,
        b.email                                             AS buyer_email,
        COALESCE(b.phone, v.buyer_phone)                    AS buyer_phone,

        /* Seller: full name, email, phone (phone prefers sellers table) */
        CONCAT_WS(' ', s.salutation, s.name)                AS seller_full_name,
        s.email                                             AS seller_email,
        COALESCE(s.phone, v.seller_phone)                   AS seller_phone,

        /* Executive: full name (with salutation), email, phone */
        CONCAT_WS(' ',
          u.salutation,
          CONCAT_WS(' ', u.first_name, u.last_name)
        )                                                   AS executive_full_name,
        u.email                                             AS executive_email,
        u.phone                                             AS executive_phone

      FROM property_visits v
      LEFT JOIN buyers  b ON v.buyer_id = b.id
      LEFT JOIN sellers s ON v.seller_id = s.id
      LEFT JOIN users   u ON v.executive_id = u.id
      WHERE ${where.join(" AND ")}
      ORDER BY v.visit_datetime DESC, v.id DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await db.query(sql, [...vals, limit, offset]);
    const [[countRow]] = await db.query("SELECT FOUND_ROWS() AS total");
    return { rows: this.#massageVisitRows(rows), total: countRow.total, page, limit };
  }

  static async updateById(id, updates) {
    const columns = await this.#getVisitColumns();

    const allowed = [
      "buyer_id","buyer_salutation","buyer_name","buyer_email","buyer_phone",
      "seller_id","seller_salutation","seller_name","seller_email","seller_phone",
      "property_id","property_title",
      "executive_id","executive_salutation","executive_name","executive_email","executive_phone",
      "visit_date","visit_time","visit_datetime",
      "duration_minutes","visit_type","meet_point","seller_present",
      "accompanied_by",
      "feedback","rating","outcome","next_action","next_action_due",
      "concerns","positives","remarks","status",
    ];
    const data = this.#pick(updates, allowed);

    // normalize
    if (data.buyer_id !== undefined)      data.buyer_id = this.#safeInt(data.buyer_id);
    if (data.seller_id !== undefined)     data.seller_id = updates.seller_id === "" ? null : this.#safeInt(updates.seller_id);
    if (data.property_id !== undefined)   data.property_id = this.#safeInt(data.property_id);
    if (data.executive_id !== undefined)  data.executive_id = updates.executive_id === "" ? null : this.#safeInt(updates.executive_id);
    if (data.duration_minutes !== undefined) data.duration_minutes = this.#safeInt(data.duration_minutes);
    if (data.rating !== undefined)        data.rating = this.#safeInt(data.rating);
    if (data.seller_present !== undefined) data.seller_present = this.#toTinyInt(data.seller_present);
    if (data.accompanied_by !== undefined) data.accompanied_by = this.#toJSONOrNull(data.accompanied_by);

    // allow visit_datetime -> split
    if (!data.visit_date && !data.visit_time && updates.visit_datetime) {
      const { date, time } = this.#splitISOToDateTime(updates.visit_datetime);
      if (date) data.visit_date = date;
      if (time) data.visit_time = time;
    }

    // re-hydrate derived fields if any party ids changed (unless manually overridden)
    const needsBuyerHydrate = Object.prototype.hasOwnProperty.call(updates, "buyer_id");
    const needsSellerHydrate = Object.prototype.hasOwnProperty.call(updates, "seller_id");
    const needsExecHydrate   = Object.prototype.hasOwnProperty.call(updates, "executive_id");
    if (needsBuyerHydrate || needsSellerHydrate || needsExecHydrate) {
      const derived = await this.#hydrateParties({
        buyer_id: data.buyer_id,
        seller_id: data.seller_id,
        executive_id: data.executive_id,

        buyer_salutation: data.buyer_salutation,
        buyer_name: data.buyer_name,
        buyer_email: data.buyer_email,
        buyer_phone: data.buyer_phone,

        seller_salutation: data.seller_salutation,
        seller_name: data.seller_name,
        seller_email: data.seller_email,
        seller_phone: data.seller_phone,

        executive_salutation: data.executive_salutation,
        executive_name: data.executive_name,
        executive_email: data.executive_email,
        executive_phone: data.executive_phone,
      });
      Object.assign(data, derived);
    }

    // filter to existing columns (safe if some cached fields aren't present)
    const setEntries = Object.entries(data).filter(([k]) => columns.has(k));
    // do not set visit_datetime directly; it's generated
    const filtered = setEntries.filter(([k]) => k !== "visit_datetime");

    if (!filtered.length) return { kind: "no_changes" };

    const setParts = filtered.map(([k]) => `${k} = ?`);
    const values = filtered.map(([_, v]) => v);
    setParts.push("updated_at = NOW()");
    values.push(id);

    const sql = `UPDATE property_visits SET ${setParts.join(", ")} WHERE id = ?`;
    const [res] = await db.query(sql, values);
    if (res.affectedRows === 0) return { kind: "not_found" };
    return this.findWithRevisits(id);
  }

  static async remove(id) {
    const [res] = await db.query(`DELETE FROM property_visits WHERE id = ?`, [id]);
    if (res.affectedRows === 0) return { kind: "not_found" };
    return res;
  }
}

module.exports = PropertyVisit;
