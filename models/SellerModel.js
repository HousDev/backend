
const pool = require("../config/database");

// helpers
const toDateOnly = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const safeStringify = (v, fallback = null) => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return fallback; }
};

const runQuery = async (connOrPool, sql, params = []) => {
  if (!connOrPool) connOrPool = pool;
  return connOrPool.query(sql, params);
};

/* ---------- tiny helpers (kept local to avoid external deps) ---------- */
const str = (v) => (v == null ? "" : String(v));
const nonEmpty = (x) => !!str(x).trim();
const norm = (v) => str(v).trim().toLowerCase();

const lowerKeys = (obj) => {
  const out = {};
  Object.keys(obj || {}).forEach((k) => (out[k.toLowerCase()] = obj[k]));
  return out;
};

const emptyToNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const intOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const decOrZero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeEmail = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s || null;
};

const normalizePhoneDigits = (v) => {
  if (!v && v !== 0) return null;
  const digits = String(v).replace(/\D/g, "");
  if (!digits) return null;
  // normalize to Indian mobile with country code if looks like 10 digits
  if (digits.length === 10) return "91" + digits;
  return digits;
};



const SellerModel = {
 async getAll(conn = null) {
  const sql = `
    SELECT 
      s.*,
      CONCAT_WS(' ', c.salutation, c.first_name, c.last_name) AS created_by_name,
      c.email AS created_by_email,
      c.phone AS created_by_phone,

      CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS updated_by_name,
      u.email AS updated_by_email,
      u.phone AS updated_by_phone,

      CONCAT_WS(' ', a.salutation, a.first_name, a.last_name) AS assigned_to_name,
      a.email AS assigned_to_email,
      a.phone AS assigned_to_phone

    FROM sellers s
      LEFT JOIN users c ON s.created_by = c.id
      LEFT JOIN users u ON s.updated_by = u.id
      LEFT JOIN users a ON s.assigned_to = a.id
    ORDER BY s.id DESC
  `;
  const [rows] = await runQuery(conn, sql);
  return rows;
},

async getById(id, conn = null) {
  const sql = `
    SELECT 
      s.*,
      CONCAT_WS(' ', c.salutation, c.first_name, c.last_name) AS created_by_name,
      c.email AS created_by_email,
      c.phone AS created_by_phone,

      CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS updated_by_name,
      u.email AS updated_by_email,
      u.phone AS updated_by_phone,

      CONCAT_WS(' ', a.salutation, a.first_name, a.last_name) AS assigned_to_name,
      a.email AS assigned_to_email,
      a.phone AS assigned_to_phone

    FROM sellers s
      LEFT JOIN users c ON s.created_by = c.id
      LEFT JOIN users u ON s.updated_by = u.id
      LEFT JOIN users a ON s.assigned_to = a.id
    WHERE s.id = ?
    LIMIT 1
  `;
  const [rows] = await runQuery(conn, sql, [id]);
  return rows && rows[0] ? rows[0] : null;
},

  async create(data = {}, conn = null) {
    const payload = {
      salutation: data.salutation ?? null,
      name: data.name ?? null,
      phone: data.phone ?? null,
      whatsapp: data.whatsapp ?? data.whatsapp_number ?? null,
      email: data.email ?? null,
      state: data.state ?? null,
      city: data.city ?? null,
      location: data.location ?? null,
      stage: data.stage ?? null,
      leadType: data.leadType ?? data.lead_type ?? null,
      priority: data.priority ?? null,
      status: data.status ?? null,
      notes: data.notes ??  null,
      seller_dob: toDateOnly(data.seller_dob),
      countryCode: data.countryCode ?? null,
      assigned_to: data.assigned_to ?? data.assigned_executive ?? null,
      assigned_to_name: data.assigned_to_name ?? data.assigned_executive_name ?? null,
      lead_score: data.lead_score ?? null,
      deal_value: data.deal_value ?? null,
      expected_close: toDateOnly(data.expected_close),
      source: data.source ?? data.lead_source ?? null,
      visits: data.visits ?? 0,
      total_visits: data.total_visits ?? 0,
      last_activity: toDateOnly(data.last_activity),
      notifications: data.notifications ? safeStringify(data.notifications, null) : null,
      current_stage: data.current_stage ?? null,
      stage_progress: data.stage_progress ?? null,
      deal_potential: data.deal_potential ?? null,
      response_rate: data.response_rate ?? null,
      avg_response_time: data.avg_response_time ?? null,
      created_at: data.created_at ?? new Date().toISOString(),
      updated_at: data.updated_at ?? new Date().toISOString(),
      lead_id: data.lead_id ?? null,
      is_active: data.is_active != null ? (data.is_active ? 1 : 0) : 1,
      created_by: data.created_by ?? null,
      updated_by: data.updated_by ?? null,
      property_id: data.property_id ?? null, // if you want to link property
    };

    const cols = Object.keys(payload).filter(k => payload[k] !== undefined);
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map(k => payload[k]);

    const sql = `INSERT INTO sellers (${cols.join(", ")}) VALUES (${placeholders})`;
    const [res] = await runQuery(conn, sql, values);

    const insertId = res && (res.insertId || (Array.isArray(res) && res[0] && res[0].insertId))
      ? (res.insertId || res[0].insertId)
      : null;

    if (insertId) {
      const [rows] = await runQuery(conn, "SELECT * FROM sellers WHERE id = ? LIMIT 1", [insertId]);
      return rows && rows[0] ? rows[0] : { id: insertId };
    }

    // fallback: find recent by lead_id
    if (payload.lead_id) {
      const [rows] = await runQuery(conn, "SELECT * FROM sellers WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1", [payload.lead_id]);
      return rows && rows[0] ? rows[0] : null;
    }

    return null;
  },

  async updateWithCoSellers(id, data, cosellers = [], deleteIds = [], conn = null) {
    const connection = conn || await pool.getConnection();
    let createdLocally = false;
    try {
      if (!conn) {
        await connection.beginTransaction();
        createdLocally = true;
      }

      // sanitize date fields
      data.seller_dob = toDateOnly(data.seller_dob);
      if (data.expected_close) data.expected_close = toDateOnly(data.expected_close);
      if (data.last_activity) data.last_activity = toDateOnly(data.last_activity);

      // Ensure notifications is JSON string or null before updating pool
      data.notifications = safeStringify(data.notifications, null);

      const sql = `
        UPDATE sellers SET 
          salutation=?, name=?, phone=?, whatsapp=?, email=?, state=?, city=?, 
          location=?, stage=?, leadType=?, priority=?, status=?, notes=?, 
          seller_dob=?, countryCode=?, assigned_to=?, assigned_to_name=?,
          lead_score=?, deal_value=?, expected_close=?, source=?, visits=?, 
          total_visits=?, last_activity=?, notifications=?, current_stage=?, 
          stage_progress=?, deal_potential=?, response_rate=?, avg_response_time=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `;
      const params = [
        data.salutation, data.name, data.phone, data.whatsapp, data.email,
        data.state, data.city, data.location, data.stage, data.leadType,
        data.priority, data.status, data.notes, data.seller_dob,
        data.countryCode, data.assigned_to, data.assigned_to_name,
        data.lead_score, data.deal_value, data.expected_close, data.source,
        data.visits, data.total_visits, data.last_activity, data.notifications,
        data.current_stage, data.stage_progress, data.deal_potential,
        data.response_rate, data.avg_response_time,
        id
      ];

      const [result] = await connection.query(sql, params);
      if (result.affectedRows === 0) {
        if (createdLocally) {
          await connection.rollback();
          connection.release();
        }
        return 0; // not found
      }

      // delete cosellers
      if (Array.isArray(deleteIds) && deleteIds.length > 0) {
        await connection.query(
          `DELETE FROM seller_cosellers WHERE seller_id=? AND id IN (${deleteIds.map(() => '?').join(',')})`,
          [id, ...deleteIds]
        );
      }

      const toUpdate = cosellers.filter(c => Number.isFinite(c.id));
      const toInsert = cosellers.filter(c => !c.id);

      for (const c of toUpdate) {
        await connection.query(
          `UPDATE seller_cosellers
             SET salutation=?, name=?, phone=?, whatsapp=?, email=?, relation=?, dob=?, updated_at=CURRENT_TIMESTAMP
           WHERE id=? AND seller_id=?`,
          [
            c.salutation, c.name, c.phone, c.whatsapp, c.email, c.relation, c.dob,
            Number(c.id), id
          ]
        );
      }

      if (toInsert.length > 0) {
        const values = toInsert.map(c => [
          id,
          c.salutation, c.name, c.phone, c.whatsapp, c.email, c.relation, c.dob
        ]);
        await connection.query(
          `INSERT INTO seller_cosellers
            (seller_id, salutation, name, phone, whatsapp, email, relation, dob)
           VALUES ?`,
          [values]
        );
      }

      if (createdLocally) {
        await connection.commit();
        connection.release();
      }

      return result.affectedRows;
    } catch (e) {
      if (createdLocally && connection) {
        await connection.rollback();
        connection.release();
      }
      throw e;
    }
  },

  async getByIdWithCoSellers(id, conn = null) {
    const [rows] = await runQuery(conn, `SELECT * FROM sellers WHERE id=? LIMIT 1`, [id]);
    if (!rows || !rows.length) return null;
    const seller = rows[0];

    const [coRows] = await runQuery(conn,
      `SELECT id, seller_id, salutation, name, phone, whatsapp, email, relation, dob
         FROM seller_cosellers WHERE seller_id=? ORDER BY id ASC`,
      [id]
    );

    return {
      ...seller,
      coSellers: coRows,
      cosellers: coRows,
      seller_cosellers: coRows,
    };
  },

  async delete(id, conn = null) {
    const [result] = await runQuery(conn, "DELETE FROM sellers WHERE id = ?", [id]);
    return result.affectedRows;
  },
   async bulkAssignSameExecutive(sellerIds = [], executiveId, onlyEmpty = false) {
    if (!Array.isArray(sellerIds) || sellerIds.length === 0)
      return { success: true, affected: 0 };

    const placeholders = sellerIds.map(() => "?").join(",");
    const params = [executiveId ?? null, ...sellerIds];

    let sql = `UPDATE sellers SET assigned_to=?, updated_at=NOW() WHERE id IN (${placeholders})`;
    if (onlyEmpty) sql += " AND (assigned_to IS NULL OR assigned_to='')";

    const [res] = await pool.execute(sql, params);
    return { success: true, affected: res.affectedRows };
  },

  /* =========================================
     🔹 Update Single Lead Field (stage/status/priority/is_active/leadType)
  ========================================= */
  async updateLeadField(sellerId, field, value) {
    if (!sellerId) throw new Error("Seller ID required");
    const allowed = ["stage", "status", "priority", "is_active", "leadType"];
    if (!allowed.includes(field)) throw new Error("Invalid field name");

    const [res] = await pool.execute(
      `UPDATE sellers SET \`${field}\`=?, updated_at=NOW() WHERE id=?`,
      [value, sellerId]
    );
    return { success: true, affected: res.affectedRows };
  },

  /* =========================================
     🔹 Bulk Update Lead Field (stage/status/priority/is_active/leadType)
  ========================================= */
  async bulkUpdateLeadField(sellerIds = [], field, value, onlyEmpty = false) {
    if (!Array.isArray(sellerIds) || sellerIds.length === 0)
      return { success: true, affected: 0 };

    const allowed = ["stage", "status", "priority", "is_active", "leadType"];
    if (!allowed.includes(field)) throw new Error("Invalid field name");

    const placeholders = sellerIds.map(() => "?").join(",");
    const params = [value, ...sellerIds];
    let sql = `UPDATE sellers SET \`${field}\`=?, updated_at=NOW() WHERE id IN (${placeholders})`;
    if (onlyEmpty) sql += ` AND (\`${field}\` IS NULL OR \`${field}\`='')`;

    const [res] = await pool.execute(sql, params);
    return { success: true, affected: res.affectedRows };
  },

  /* =============
     🔹 Bulk Import
     - dedupe by email/phone (normalized)
     - collects skippedRows reasons
  ============= */
  async bulkImport(sellers = [], { created_by = null } = {}) {
    if (!Array.isArray(sellers) || sellers.length === 0) {
      return {
        success: true,
        inserted: 0,
        skipped: 0,
        skippedRows: [],
        updatedRows: [],
        insertedRows: [],
      };
    }

    // Preload existing for dedupe
    const [existingRows] = await pool.query("SELECT id, email, phone FROM sellers");
    const existingEmails = new Set(
      existingRows.map((r) => (r.email ? String(r.email).toLowerCase().trim() : null)).filter(Boolean)
    );
    const existingPhones = new Set(
      existingRows.map((r) => normalizePhoneDigits(r.phone)).filter(Boolean)
    );

    const skippedRows = [];
    const insertedRows = [];
    let inserted = 0;

    for (const [index, raw] of sellers.entries()) {
      const rowNum = index + 2; // header at row 1
      const r = lowerKeys(raw || {});

      const salutation = (r.salutation ?? "Mr.").toString().trim() || "Mr.";
      const name = (r.name ?? "").toString().trim();

      const email = normalizeEmail(r.email ?? null);
      const phone = normalizePhoneDigits(r.phone ?? null);
      const whatsapp = normalizePhoneDigits(r.whatsapp ?? r.whatsapp_number ?? null);

      const state = emptyToNull(r.state);
      const city = emptyToNull(r.city);
      const location = emptyToNull(r.location);

      const stage = emptyToNull(r.stage);
      const status = emptyToNull(r.status);
      const priority = emptyToNull(r.priority);
      const leadType = emptyToNull(r.leadtype ?? r.lead_type);

      const notes = emptyToNull(r.notes ?? r.remark);
      const source = emptyToNull(r.source ?? r.lead_source);

      const seller_dob = toDateOnly(r.seller_dob);
      const expected_close = toDateOnly(r.expected_close);

      const deal_value = decOrZero(r.deal_value);
      const assigned_to = intOrNull(r.assigned_to ?? r.assigned_executive);
      const is_active = r.is_active != null ? (String(r.is_active).trim() === "0" ? 0 : 1) : 1;

      const createpoolyFinal =
        intOrNull(r.created_by) ??
        intOrNull(r.createpooly) ??
        intOrNull(raw?.created_by) ??
        intOrNull(created_by) ??
        null;

      // Optional JSON-ish field
      const notifications = safeStringify(r.notifications, null);

      // Minimal validation
      if (!name || !phone) {
        skippedRows.push({
          row: rowNum,
          reason: "Missing required field(s): name/phone",
          data: raw,
          errors: [!name ? "Missing name" : null, !phone ? "Missing phone" : null].filter(Boolean),
        });
        continue;
      }

      // Dedupe
      if (email && existingEmails.has(email)) {
        skippedRows.push({ row: rowNum, reason: `Email already exists (${email})`, data: raw });
        continue;
      }
      if (phone && existingPhones.has(phone)) {
        skippedRows.push({ row: rowNum, reason: `Phone already exists (${phone})`, data: raw });
        continue;
      }

      try {
        const [res] = await pool.execute(
          `INSERT INTO sellers (
            salutation, name,
            phone, whatsapp, email,
            state, city, location,
            stage, status, priority, leadType,
            notes, source,
            seller_dob, expected_close,
            deal_value, assigned_to, is_active,
            notifications,
            created_by, updated_by,
            created_at, updated_at
          ) VALUES (
            ?, ?,              -- salutation, name
            ?, ?, ?,           -- phone, whatsapp, email
            ?, ?, ?,           -- state, city, location
            ?, ?, ?, ?,        -- stage, status, priority, leadType
            ?, ?,              -- notes, source
            ?, ?,              -- seller_dob, expected_close
            ?, ?, ?,           -- deal_value, assigned_to, is_active
            ?,                 -- notifications (JSON string or null)
            ?, NULL,           -- created_by, updated_by
            NOW(), NOW()       -- created_at, updated_at
          )`,
          [
            salutation, name,
            phone, whatsapp, email,
            state, city, location,
            stage, status, priority, leadType,
            notes, source,
            seller_dob, expected_close,
            deal_value, assigned_to, is_active,
            notifications,
            createpoolyFinal,
          ]
        );

        inserted++;
        insertedRows.push({ id: res.insertId, name });

        // Extend dedupe sets
        if (email) existingEmails.add(email);
        if (phone) existingPhones.add(phone);
      } catch (err) {
        if (err?.code === "ER_DUP_ENTRY" || err?.errno === 1062) {
          skippedRows.push({
            row: rowNum,
            reason: "Duplicate entry (email/phone already exists)",
            data: raw,
            poolError: err.message,
          });
        } else if (err?.code === "3140") {
          skippedRows.push({
            row: rowNum,
            reason: "Invalid JSON in notifications",
            data: raw,
            poolError: err.message,
          });
        } else {
          skippedRows.push({
            row: rowNum,
            reason: `Database error: ${err.message}`,
            data: raw,
            poolError: err.message,
          });
        }
      }
    }

    return {
      success: true,
      inserted,
      skipped: skippedRows.length,
      skippedRows,
      updatedRows: [],
      insertedRows,
    };
  },
// ADD THIS to SellerModel
// models/Seller.js (inside SellerModel)
async bulkHardDelete(sellerIds = [], conn = null) {
  if (!Array.isArray(sellerIds) || sellerIds.length === 0) {
    return { success: true, deleted: 0 };
  }

  const ids = sellerIds
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (ids.length === 0) {
    return { success: false, error: "Valid numeric ids required", deleted: 0 };
  }

  const placeholders = ids.map(() => "?").join(",");
  const connection = conn || await pool.getConnection();
  let createdLocally = false;

  try {
    if (!conn) {
      await connection.beginTransaction();
      createdLocally = true;
    }

    const [res] = await connection.query(
      `DELETE FROM sellers WHERE id IN (${placeholders})`,
      ids
    );

    if (createdLocally) {
      await connection.commit();
      connection.release();
    }

    return { success: true, deleted: res.affectedRows || 0, ids };
  } catch (err) {
    if (createdLocally && connection) {
      try { await connection.rollback(); } catch {}
      try { connection.release(); } catch {}
    }
    // FK violation => 1451
    if (err?.code === "ER_ROW_IS_REFERENCED_2" || err?.errno === 1451) {
      return {
        success: false,
        error: "Cannot delete: dependent records exist (FK 1451). Either delete child rows or set ON DELETE CASCADE.",
        code: 1451,
      };
    }
    throw err;
  }
}


};

module.exports = SellerModel;
