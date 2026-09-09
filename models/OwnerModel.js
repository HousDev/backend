const pool = require("../config/database");

// helpers
const pad = (n) => String(n).padStart(2, "0");
const formatDateTime = (d) => {
  if (!d) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const normalizeToMysqlDatetime = (val) => {
  if (!val && val !== 0) return null;
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val)) return val;
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return null;
  return formatDateTime(d);
};

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

const str = (v) => (v == null ? "" : String(v));
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
  if (v === null || v === undefined || String(v).trim() === "" || String(v).toLowerCase() === "null") return null;
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
  if (digits.length === 10) return "91" + digits;
  return digits;
};

const OwnerModel = {
  async getAll(conn = null) {
    const sql = `
      SELECT 
        o.*,
        CONCAT_WS(' ', c.salutation, c.first_name, c.last_name) AS created_by_name,
        c.email AS created_by_email,
        c.phone AS created_by_phone,

        CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS updated_by_name,
        u.email AS updated_by_email,
        u.phone AS updated_by_phone,

        CONCAT_WS(' ', a.salutation, a.first_name, a.last_name) AS assigned_to_name,
        a.email AS assigned_to_email,
        a.phone AS assigned_to_phone

      FROM owners o
        LEFT JOIN users c ON o.created_by = c.id
        LEFT JOIN users u ON o.updated_by = u.id
        LEFT JOIN users a ON o.assigned_to = a.id
      ORDER BY o.id DESC
    `;
    const [rows] = await runQuery(conn, sql);
    return rows;
  },

  async getById(id, conn = null) {
    const sql = `
      SELECT 
        o.*,
        CONCAT_WS(' ', c.salutation, c.first_name, c.last_name) AS created_by_name,
        c.email AS created_by_email,
        c.phone AS created_by_phone,

        CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS updated_by_name,
        u.email AS updated_by_email,
        u.phone AS updated_by_phone,

        CONCAT_WS(' ', a.salutation, a.first_name, a.last_name) AS assigned_to_name,
        a.email AS assigned_to_email,
        a.phone AS assigned_to_phone

      FROM owners o
        LEFT JOIN users c ON o.created_by = c.id
        LEFT JOIN users u ON o.updated_by = u.id
        LEFT JOIN users a ON o.assigned_to = a.id
      WHERE o.id = ?
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
      lead_type: data.leadType ?? data.lead_type ?? null,
      priority: data.priority ?? null,
      status: data.status ?? null,
      notes: data.notes ?? null,
      owner_dob: toDateOnly(data.owner_dob),
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
      created_at: normalizeToMysqlDatetime(data.created_at ?? new Date()),
      updated_at: normalizeToMysqlDatetime(data.updated_at ?? new Date()),
      lead_id: data.lead_id ?? null,
      is_active: data.is_active != null ? (data.is_active ? 1 : 0) : 1,
      created_by: data.created_by ?? null,
      updated_by: data.updated_by ?? null,
    };

    const cols = Object.keys(payload).filter(k => payload[k] !== undefined);
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map(k => payload[k]);

    const sql = `INSERT INTO owners (${cols.join(", ")}) VALUES (${placeholders})`;
    const [res] = await runQuery(conn, sql, values);

    const insertId = res && (res.insertId || (Array.isArray(res) && res[0] && res[0].insertId))
      ? (res.insertId || res[0].insertId)
      : null;

    if (insertId) {
      const [rows] = await runQuery(conn, "SELECT * FROM owners WHERE id = ? LIMIT 1", [insertId]);
      return rows && rows[0] ? rows[0] : { id: insertId };
    }
    return null;
  },

  async update(id, data = {}, conn = null) {
    // sanitize date fields
    data.owner_dob = toDateOnly(data.owner_dob);
    if (data.expected_close) data.expected_close = toDateOnly(data.expected_close);
    if (data.last_activity) data.last_activity = toDateOnly(data.last_activity);
    data.notifications = safeStringify(data.notifications, null);

    // Format preferred_visit_slots
    let preferredVisitSlots = data.preferred_visit_slots || data.preferred_slots || null;
    if (preferredVisitSlots && typeof preferredVisitSlots === 'object') {
      preferredVisitSlots = JSON.stringify(preferredVisitSlots);
    }

    // Try update with preferred_visit_slots first
    try {
      const sqlWithSlots = `
        UPDATE owners SET 
          salutation=?, name=?, phone=?, whatsapp=?, email=?, state=?, city=?, 
          location=?, stage=?, lead_type=?, priority=?, status=?, notes=?, 
          owner_dob=?, countryCode=?, assigned_to=?, assigned_to_name=?,
          lead_score=?, deal_value=?, expected_close=?, source=?, visits=?, 
          total_visits=?, last_activity=?, notifications=?, current_stage=?, 
          stage_progress=?, deal_potential=?, response_rate=?, avg_response_time=?,
          preferred_visit_slots=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `;
      const paramsWithSlots = [
        data.salutation, data.name, data.phone, data.whatsapp, data.email,
        data.state, data.city, data.location, data.stage, data.leadType ?? data.lead_type,
        data.priority, data.status, data.notes, data.owner_dob,
        data.countryCode, data.assigned_to, data.assigned_to_name,
        data.lead_score, data.deal_value, data.expected_close, data.source,
        data.visits, data.total_visits, data.last_activity, data.notifications,
        data.current_stage, data.stage_progress, data.deal_potential,
        data.response_rate, data.avg_response_time,
        preferredVisitSlots,
        id
      ];

      const [result] = await runQuery(conn, sqlWithSlots, paramsWithSlots);
      return result ? result.affectedRows : 1;
    } catch (colErr) {
      // Fallback if preferred_visit_slots column doesn't exist yet
      const sql = `
        UPDATE owners SET 
          salutation=?, name=?, phone=?, whatsapp=?, email=?, state=?, city=?, 
          location=?, stage=?, lead_type=?, priority=?, status=?, notes=?, 
          owner_dob=?, countryCode=?, assigned_to=?, assigned_to_name=?,
          lead_score=?, deal_value=?, expected_close=?, source=?, visits=?, 
          total_visits=?, last_activity=?, notifications=?, current_stage=?, 
          stage_progress=?, deal_potential=?, response_rate=?, avg_response_time=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `;
      const params = [
        data.salutation, data.name, data.phone, data.whatsapp, data.email,
        data.state, data.city, data.location, data.stage, data.leadType ?? data.lead_type,
        data.priority, data.status, data.notes, data.owner_dob,
        data.countryCode, data.assigned_to, data.assigned_to_name,
        data.lead_score, data.deal_value, data.expected_close, data.source,
        data.visits, data.total_visits, data.last_activity, data.notifications,
        data.current_stage, data.stage_progress, data.deal_potential,
        data.response_rate, data.avg_response_time,
        id
      ];

      const [result] = await runQuery(conn, sql, params);
      return result ? result.affectedRows : 0;
    }
  },

  async getByIdWithRentalProperties(id, conn = null) {
    const owner = await this.getById(id, conn);
    if (!owner) return null;

    const [rentalProps] = await runQuery(conn,
      `SELECT * FROM rental_properties WHERE owner_id=? ORDER BY id DESC`,
      [id]
    );

    return {
      ...owner,
      properties: rentalProps || [],
    };
  },

  async delete(id, conn = null) {
    const [result] = await runQuery(conn, "DELETE FROM owners WHERE id = ?", [id]);
    return result.affectedRows;
  },

  async bulkAssignSameExecutive(ownerIds = [], executiveId, onlyEmpty = false) {
    if (!Array.isArray(ownerIds) || ownerIds.length === 0)
      return { success: true, affected: 0 };

    const placeholders = ownerIds.map(() => "?").join(",");
    const params = [executiveId ?? null, ...ownerIds];

    let sql = `UPDATE owners SET assigned_to=?, updated_at=NOW() WHERE id IN (${placeholders})`;
    if (onlyEmpty) sql += " AND (assigned_to IS NULL OR assigned_to='')";

    const [res] = await pool.execute(sql, params);
    return { success: true, affected: res.affectedRows };
  },

  async updateLeadField(ownerId, field, value) {
    if (!ownerId) throw new Error("Owner ID required");
    const allowed = [
      "stage", "status", "priority", "is_active", "lead_type", "assigned_to",
      "preferred_visit_slots", "preferred_slots", "preferred_location", "inquiries_received"
    ];
    if (!allowed.includes(field)) throw new Error("Invalid field name");
    const actualCol = field === "preferred_slots" ? "preferred_visit_slots" : field;

    try {
      const [res] = await pool.execute(
        `UPDATE owners SET \`${actualCol}\`=?, updated_at=NOW() WHERE id=?`,
        [value, ownerId]
      );
      return { success: true, affected: res.affectedRows };
    } catch (e) {
      console.warn(`Could not update owner field ${actualCol}:`, e.message);
      return { success: false, message: e.message };
    }
  },

  async bulkUpdateLeadField(ownerIds = [], field, value, onlyEmpty = false) {
    if (!Array.isArray(ownerIds) || ownerIds.length === 0)
      return { success: true, affected: 0 };

    const allowed = ["stage", "status", "priority", "is_active", "lead_type", "assigned_to", "source"];
    if (!allowed.includes(field)) throw new Error("Invalid field name");

    const placeholders = ownerIds.map(() => "?").join(",");
    const params = [value, ...ownerIds];
    let sql = `UPDATE owners SET \`${field}\`=?, updated_at=NOW() WHERE id IN (${placeholders})`;
    if (onlyEmpty) sql += ` AND (\`${field}\` IS NULL OR \`${field}\`='')`;

    const [res] = await pool.execute(sql, params);
    return { success: true, affected: res.affectedRows };
  },

  async bulkImport(owners = [], { created_by = null } = {}) {
    if (!Array.isArray(owners) || owners.length === 0) {
      return {
        success: true,
        inserted: 0,
        skipped: 0,
        skippedRows: [],
        updatedRows: [],
        insertedRows: [],
      };
    }

    const [existingRows] = await pool.query("SELECT id, email, phone FROM owners");
    const existingEmails = new Set(
      existingRows.map((r) => (r.email ? String(r.email).toLowerCase().trim() : null)).filter(Boolean)
    );
    const existingPhones = new Set(
      existingRows.map((r) => normalizePhoneDigits(r.phone)).filter(Boolean)
    );

    const skippedRows = [];
    const insertedRows = [];
    let inserted = 0;

    for (const [index, raw] of owners.entries()) {
      const rowNum = index + 2;
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

      const owner_dob = toDateOnly(r.owner_dob);
      const expected_close = toDateOnly(r.expected_close);

      const deal_value = decOrZero(r.deal_value);
      const assigned_to = intOrNull(r.assigned_to ?? r.assigned_executive);
      const is_active = r.is_active != null ? (String(r.is_active).trim() === "0" ? 0 : 1) : 1;

      const createdFinal =
        intOrNull(r.created_by) ??
        intOrNull(raw?.created_by) ??
        intOrNull(created_by) ??
        null;

      const notifications = safeStringify(r.notifications, null);

      if (!name || !phone) {
        skippedRows.push({
          row: rowNum,
          reason: "Missing required field(s): name/phone",
          data: raw,
          errors: [!name ? "Missing name" : null, !phone ? "Missing phone" : null].filter(Boolean),
        });
        continue;
      }

      if (email && existingEmails.has(email)) {
        skippedRows.push({ row: rowNum, reason: `Email already exists (${email})`, data: raw });
        continue;
      }
      if (phone && existingPhones.has(phone)) {
        skippedRows.push({ row: rowNum, reason: `Phone already exists (${phone})`, data: raw });
        continue;
      }

      try {
        const payload = {
          salutation, name, phone, whatsapp, email, state, city, location,
          stage, lead_type: leadType, priority, status, notes, owner_dob, expected_close,
          source, deal_value, assigned_to, is_active, created_by: createdFinal,
          notifications, created_at: normalizeToMysqlDatetime(new Date()), updated_at: normalizeToMysqlDatetime(new Date())
        };

        const cols = Object.keys(payload);
        const placeholders = cols.map(() => "?").join(", ");
        const values = cols.map(k => payload[k]);

        const sql = `INSERT INTO owners (${cols.join(", ")}) VALUES (${placeholders})`;
        const [res] = await pool.query(sql, values);

        inserted++;
        existingPhones.add(phone);
        if (email) existingEmails.add(email);

        const newId = res && (res.insertId || (Array.isArray(res) && res[0] && res[0].insertId))
          ? (res.insertId || res[0].insertId)
          : null;

        insertedRows.push({ id: newId, name, phone });
      } catch (err) {
        skippedRows.push({ row: rowNum, reason: `Database Error: ${err.message}`, data: raw });
      }
    }

    return {
      success: true,
      inserted,
      skipped: skippedRows.length,
      skippedRows,
      insertedRows
    };
  },

  async bulkHardDeleteOwners(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return { affected: 0 };
    const placeholders = ids.map(() => "?").join(",");
    const [res] = await pool.query(`DELETE FROM owners WHERE id IN (${placeholders})`, ids);
    return { affected: res.affectedRows };
  }
};

module.exports = OwnerModel;
