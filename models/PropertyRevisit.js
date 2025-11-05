// src/models/PropertyRevisit.js
const db = require("../config/database"); // mysql2/promise pool

class PropertyRevisit {
  static #safeInt(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
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
  static #splitISOToDateTime(iso) {
    if (!iso) return { date: null, time: null };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: null, time: null };
    const pad = (n) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return { date, time };
  }

  static async create(payload) {
    const data = {
      visit_id: this.#safeInt(payload.visit_id),
      executive_id: payload.executive_id === "" ? null : this.#safeInt(payload.executive_id),
      revisit_date: payload.revisit_date || null,
      revisit_time: payload.revisit_time || null,
      revisit_datetime: payload.revisit_datetime || null, // optional ISO for convenience
      duration_minutes: payload.duration_minutes != null ? this.#safeInt(payload.duration_minutes) : 60,
      accompanied_by: this.#toJSONOrNull(payload.accompanied_by),
      status: payload.status || "scheduled",
      feedback: payload.feedback || null,
      rating: payload.rating != null ? this.#safeInt(payload.rating) : null,
      remarks: payload.remarks || null,
    };

    if ((!data.revisit_date || !data.revisit_time) && data.revisit_datetime) {
      const { date, time } = this.#splitISOToDateTime(data.revisit_datetime);
      data.revisit_date = data.revisit_date || date;
      data.revisit_time = data.revisit_time || time;
    }
    if (!data.visit_id || !data.revisit_date || !data.revisit_time) {
      throw new Error("visit_id and (revisit_date & revisit_time) are required");
    }

    const cols = [
      "visit_id","executive_id",
      "revisit_date","revisit_time",
      "duration_minutes","accompanied_by","status",
      "feedback","rating","remarks",
    ];
    const params = [
      data.visit_id, data.executive_id,
      data.revisit_date, data.revisit_time,
      data.duration_minutes, data.accompanied_by, data.status,
      data.feedback, data.rating, data.remarks,
    ];
    const placeholders = cols.map(() => "?").join(", ");

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [res] = await conn.query(
        `INSERT INTO property_revisits (${cols.join(", ")}, created_at, updated_at)
         VALUES (${placeholders}, NOW(), NOW())`,
        params
      );

      // increment parent counter
      await conn.query(
        `UPDATE property_visits SET revisit_count = revisit_count + 1, updated_at = NOW() WHERE id = ?`,
        [data.visit_id]
      );

      await conn.commit();

      const [rows] = await conn.query(`SELECT * FROM property_revisits WHERE id = ?`, [res.insertId]);
      return rows?.[0] || null;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  static async listByVisit(visit_id) {
    const [rows] = await db.query(
      `SELECT * FROM property_revisits WHERE visit_id = ? ORDER BY revisit_datetime ASC, id ASC`,
      [this.#safeInt(visit_id)]
    );
    return rows;
  }

  static async updateById(id, updates) {
    const allowed = [
      "executive_id","revisit_date","revisit_time",
      "duration_minutes","accompanied_by","status",
      "feedback","rating","remarks",
      // revisit_datetime is generated, do not set directly
    ];
    const data = {};
    for (const k of allowed) {
      if (updates[k] !== undefined) data[k] = updates[k];
    }
    if (data.executive_id !== undefined) data.executive_id = updates.executive_id === "" ? null : this.#safeInt(updates.executive_id);
    if (data.duration_minutes !== undefined) data.duration_minutes = this.#safeInt(data.duration_minutes);
    if (data.rating !== undefined) data.rating = this.#safeInt(data.rating);
    if (data.accompanied_by !== undefined) data.accompanied_by = this.#toJSONOrNull(data.accompanied_by);

    // If client passed revisit_datetime in update, split to date/time
    if (!data.revisit_date && !data.revisit_time && updates.revisit_datetime) {
      const { date, time } = this.#splitISOToDateTime(updates.revisit_datetime);
      if (date) data.revisit_date = date;
      if (time) data.revisit_time = time;
    }

    if (!Object.keys(data).length) return { kind: "no_changes" };

    const setParts = Object.keys(data).map(k => `${k} = ?`);
    const values = Object.keys(data).map(k => data[k]);
    setParts.push("updated_at = NOW()");
    values.push(id);

    const [res] = await db.query(
      `UPDATE property_revisits SET ${setParts.join(", ")} WHERE id = ?`,
      values
    );
    if (res.affectedRows === 0) return { kind: "not_found" };

    const [rows] = await db.query(`SELECT * FROM property_revisits WHERE id = ?`, [id]);
    return rows?.[0] || null;
  }

  static async remove(id) {
    // We need visit_id to decrement counter
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[row]] = await conn.query(`SELECT visit_id FROM property_revisits WHERE id = ?`, [id]);
      if (!row) {
        await conn.rollback();
        return { kind: "not_found" };
      }

      await conn.query(`DELETE FROM property_revisits WHERE id = ?`, [id]);

      await conn.query(
        `UPDATE property_visits
         SET revisit_count = GREATEST(revisit_count - 1, 0), updated_at = NOW()
         WHERE id = ?`,
        [row.visit_id]
      );

      await conn.commit();
      return { kind: "ok" };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

module.exports = PropertyRevisit;
