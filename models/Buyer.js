
// models/Buyer.js
const db = require("../config/database");

/* ========================= Helpers ========================= */
const toDateOnly = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const safeParse = (v, fallback = {}) => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  if (typeof v === "object") return v;
  return fallback;
};

const safeStringify = (v, fallbackObj = {}) => {
  if (v === null || v === undefined) return JSON.stringify(fallbackObj);
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return JSON.stringify(fallbackObj); }
};

/** normalize object keys to lower-case + trimmed */
const lowerKeys = (obj) =>
  Object.fromEntries(
    Object.entries(obj || {}).map(([k, v]) => [String(k).toLowerCase().trim(), v])
  );

/** shallow object merge; arrays REPLACE entirely */
const deepMergePreferringIncoming = (current, incoming) => {
  const a = safeParse(current, {});
  const b = safeParse(incoming, {});
  const out = { ...a };
  for (const k in b) {
    const val = b[k];
    if (Array.isArray(val)) out[k] = [...val];
    else if (val && typeof val === "object") out[k] = { ...(a[k] || {}), ...val };
    else out[k] = val;
  }
  return out;
};

// ---- tiny normalizers (shared with Sellers style) ----
const emptyToNull = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "null" ? null : v;
};
const intOrNull = (v) => {
  v = emptyToNull(v);
  if (v === null) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};
// return "0.00" or a 2-dp string MySQL DECIMAL(14,2) happily accepts
const decOrZero = (v) => {
  if (v === undefined || v === null || String(v).trim() === "") return "0.00";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
};
const normalizeEmail = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  return s || null;
};
const normalizePhoneDigits = (v) => {
  if (v === undefined || v === null) return null;
  const digits = String(v).replace(/\D/g, "");
  return digits || null;
};

/* ========================= Model ========================= */
class Buyer {
  /* ---------- Create ---------- */
  static async create(data) {
    const salutation = data.salutation ?? "Mr.";
    const name = (data.name ?? "").toString().trim();
    const dob = toDateOnly(data.dob);
    const phone = normalizePhoneDigits(data.phone ?? null);
    const whatsapp_number = normalizePhoneDigits(data.whatsapp_number ?? data.whatsapp ?? null);
    const email = normalizeEmail(data.email ?? null);

    const state = emptyToNull(data.state);
    const city = emptyToNull(data.city);
    const location = emptyToNull(data.location);

    const buyer_lead_priority = emptyToNull(data.buyer_lead_priority ?? data.priority);
    const buyer_lead_source   = emptyToNull(data.buyer_lead_source   ?? data.source);
    const buyer_lead_stage    = emptyToNull(data.buyer_lead_stage    ?? data.stage);
    const buyer_lead_status   = emptyToNull(data.buyer_lead_status   ?? data.status);

    const budget_min = decOrZero(data.budget_min ?? (data.budget?.min ?? 0));
    const budget_max = decOrZero(data.budget_max ?? (data.budget?.max ?? 0));

    const requirements = safeStringify(data.requirements ?? {}, {});
    const financials   = safeStringify(data.financials   ?? {}, {});

    const [result] = await db.execute(
      `INSERT INTO buyers (
        \`salutation\`, \`name\`, \`dob\`, \`phone\`, \`whatsapp_number\`, \`email\`,
        \`state\`, \`city\`, \`location\`,
        \`buyer_lead_priority\`, \`buyer_lead_source\`, \`buyer_lead_stage\`, \`buyer_lead_status\`,
        \`budget_min\`, \`budget_max\`, \`requirements\`, \`financials\`,
        \`created_at\`, \`updated_at\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), NOW(), NOW())`,
      [
        salutation, name, dob, phone, whatsapp_number, email,
        state, city, location,
        buyer_lead_priority, buyer_lead_source, buyer_lead_stage, buyer_lead_status,
        budget_min, budget_max, requirements, financials,
      ]
    );

    return await Buyer.findById(result.insertId);
  }

  /* ---------- Read ---------- */
  static async findById(id) {
    const [rows] = await db.execute("SELECT * FROM buyers WHERE id = ?", [id]);
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      ...row,
      dob: row.dob,
      requirements: safeParse(row.requirements, {}),
      financials: safeParse(row.financials, {}),
      budget: { min: row.budget_min, max: row.budget_max },
    };
  }

  static async findAll() {
    const [rows] = await db.execute("SELECT * FROM buyers ORDER BY created_at DESC");
    return rows.map((row) => ({
      ...row,
      dob: row.dob,
      requirements: safeParse(row.requirements, {}),
      financials: safeParse(row.financials, {}),
      budget: { min: row.budget_min, max: row.budget_max },
    }));
  }

  /* ---------- Update ---------- */
  static async update(id, data) {
    const current = await this.findById(id);
    if (!current) return null;

    // Merge JSON fields
    const incomingReq = data.requirements !== undefined ? data.requirements : undefined;
    const incomingFin = data.financials  !== undefined ? data.financials  : undefined;

    const mergedRequirements =
      incomingReq === undefined ? current.requirements : deepMergePreferringIncoming(current.requirements, incomingReq);
    const mergedFinancials =
      incomingFin === undefined ? current.financials   : deepMergePreferringIncoming(current.financials, incomingFin);

    const merged = {
      salutation:           data.salutation           ?? current.salutation ?? "Mr.",
      name:                 data.name                 ?? current.name,
      dob:                  toDateOnly(data.dob ?? current.dob),
      phone:                normalizePhoneDigits(data.phone ?? current.phone),
      whatsapp_number:      normalizePhoneDigits(data.whatsapp_number ?? data.whatsapp ?? current.whatsapp_number ?? current.whatsapp),
      email:                normalizeEmail(data.email ?? current.email),
      state:                emptyToNull(data.state ?? current.state),
      city:                 emptyToNull(data.city ?? current.city),
      location:             emptyToNull(data.location ?? current.location),
      buyer_lead_priority:  emptyToNull(data.buyer_lead_priority ?? current.buyer_lead_priority ?? current.priority),
      buyer_lead_source:    emptyToNull(data.buyer_lead_source   ?? current.buyer_lead_source   ?? current.source),
      buyer_lead_stage:     emptyToNull(data.buyer_lead_stage    ?? current.buyer_lead_stage    ?? current.stage),
      buyer_lead_status:    emptyToNull(data.buyer_lead_status   ?? current.buyer_lead_status   ?? current.status),
      budget_min:           decOrZero(data.budget_min ?? (current.budget?.min ?? current.budget_min ?? 0)),
      budget_max:           decOrZero(data.budget_max ?? (current.budget?.max ?? current.budget_max ?? 0)),
      requirements:         safeStringify(mergedRequirements, {}),
      financials:           safeStringify(mergedFinancials, {}),
    };

    await db.execute(
      `UPDATE buyers SET
        \`salutation\`=?, \`name\`=?, \`dob\`=?, \`phone\`=?, \`whatsapp_number\`=?, \`email\`=?,
        \`state\`=?, \`city\`=?, \`location\`=?,
        \`buyer_lead_priority\`=?, \`buyer_lead_source\`=?, \`buyer_lead_stage\`=?, \`buyer_lead_status\`=?,
        \`budget_min\`=?, \`budget_max\`=?, \`requirements\`=CAST(? AS JSON), \`financials\`=CAST(? AS JSON), \`updated_at\`=NOW()
       WHERE \`id\`=?`,
      [
        merged.salutation, merged.name, merged.dob, merged.phone, merged.whatsapp_number, merged.email,
        merged.state, merged.city, merged.location,
        merged.buyer_lead_priority, merged.buyer_lead_source, merged.buyer_lead_stage, merged.buyer_lead_status,
        merged.budget_min, merged.budget_max,
        merged.requirements, merged.financials,
        id,
      ]
    );

    return await this.findById(id);
  }

  /* ---------- Soft delete ---------- */
  static async softDelete(id) {
    await db.execute("UPDATE buyers SET is_active=0, updated_at=NOW() WHERE id=?", [id]);
    return { id, is_active: 0 };
  }

  /* ---------- Assignment ---------- */
  static async assignExecutive(buyerId, executiveId) {
    if (!buyerId) throw new Error("Buyer ID required");
    const [res] = await db.execute(
      "UPDATE buyers SET assigned_executive=?, updated_at=NOW() WHERE id=?",
      [executiveId ?? null, buyerId]
    );
    return { success: true, affected: res.affectedRows };
  }

  static async bulkAssignSameExecutive(buyerIds = [], executiveId, onlyEmpty = false) {
    if (!Array.isArray(buyerIds) || buyerIds.length === 0) return { success: true, affected: 0 };
    const placeholders = buyerIds.map(() => "?").join(",");
    const params = [executiveId ?? null, ...buyerIds];
    let sql = `UPDATE buyers SET assigned_executive=?, updated_at=NOW() WHERE id IN (${placeholders})`;
    if (onlyEmpty) sql += " AND (assigned_executive IS NULL OR assigned_executive='')";
    const [res] = await db.execute(sql, params);
    return { success: true, affected: res.affectedRows };
  }

  /* ---------- Single/Bulk lead field updates ---------- */
  static async updateLeadField(buyerId, field, value) {
    if (!buyerId) throw new Error("Buyer ID required");
    const allowed = ["buyer_lead_stage", "buyer_lead_status", "buyer_lead_priority", "is_active"];
    if (!allowed.includes(field)) throw new Error("Invalid field name");

    const [res] = await db.execute(
      `UPDATE buyers SET \`${field}\`=?, updated_at=NOW() WHERE id=?`,
      [value, buyerId]
    );

    return { success: true, affected: res.affectedRows };
  }

  static async bulkUpdateLeadField(buyerIds = [], field, value, onlyEmpty = false) {
    if (!Array.isArray(buyerIds) || buyerIds.length === 0)
      return { success: true, affected: 0 };

    const allowed = ["buyer_lead_stage", "buyer_lead_status", "buyer_lead_priority", "is_active"];
    if (!allowed.includes(field)) throw new Error("Invalid field name");

    const placeholders = buyerIds.map(() => "?").join(",");
    const params = [value, ...buyerIds];
    let sql = `UPDATE buyers SET \`${field}\`=?, updated_at=NOW() WHERE id IN (${placeholders})`;
    if (onlyEmpty) sql += ` AND (\`${field}\` IS NULL OR \`${field}\`='')`;

    const [res] = await db.execute(sql, params);
    return { success: true, affected: res.affectedRows };
  }

  /* ---------- Bulk Import ---------- */
  static async bulkImport(buyers, { created_by = null } = {}) {
    if (!Array.isArray(buyers) || buyers.length === 0) {
      return { success: true, inserted: 0, skipped: 0, skippedRows: [], updatedRows: [], insertedRows: [] };
    }

    // Preload existing and normalize for dedupe
    const [existingRows] = await db.query("SELECT id, email, phone FROM buyers");
    const existingEmails = new Set(
      existingRows.map(r => r.email ? String(r.email).toLowerCase().trim() : null).filter(Boolean)
    );
    const existingPhones = new Set(
      existingRows.map(r => normalizePhoneDigits(r.phone)).filter(Boolean)
    );

    const skippedRows = [];
    const insertedRows = [];
    let inserted = 0;

    for (const [index, raw] of buyers.entries()) {
      const rowNum = index + 2; // header at row 1
      const r = lowerKeys(raw || {});

      const salutation          = (r.salutation ?? "Mr.").toString().trim() || "Mr.";
      const name                = (r.name ?? "").toString().trim();

      const email               = normalizeEmail(r.email ?? null);
      const phone               = normalizePhoneDigits(r.phone ?? null);
      const whatsapp_number     = normalizePhoneDigits(r.whatsapp_number ?? r.whatsapp ?? null);

      const dob                 = toDateOnly(r.dob);
      const state               = emptyToNull(r.state);
      const city                = emptyToNull(r.city);
      const location            = emptyToNull(r.location);

      const buyer_lead_priority = emptyToNull(r.buyer_lead_priority);
      const buyer_lead_source   = emptyToNull(r.buyer_lead_source);
      const buyer_lead_stage    = emptyToNull(r.buyer_lead_stage);
      const buyer_lead_status   = emptyToNull(r.buyer_lead_status);

      const budget_min          = decOrZero(r.budget_min);
      const budget_max          = decOrZero(r.budget_max);

      const requirements        = safeStringify(r.requirements, {});
      const financials          = safeStringify(r.financials, {}); // present in schema

      const remark              = emptyToNull(r.remark);
      const nearbylocations     = emptyToNull(r.nearbylocations);

      // 🔑 INTs must be int or null (never "")
      const assigned_executive  = intOrNull(r.assigned_executive);

      // ✅ created_by: prefer row-level; fallback to options/root
      const createdByFinal =
        intOrNull(r.created_by) ??
        intOrNull(r.createdby) ??
        intOrNull(raw?.created_by) ??
        intOrNull(created_by) ??
        null;

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

      // Duplicate checks (normalized)
      if (email && existingEmails.has(email)) {
        skippedRows.push({ row: rowNum, reason: `Email already exists (${email})`, data: raw });
        continue;
      }
      if (phone && existingPhones.has(phone)) {
        skippedRows.push({ row: rowNum, reason: `Phone already exists (${phone})`, data: raw });
        continue;
      }

      try {
        const [res] = await db.execute(
          `INSERT INTO buyers (
            \`salutation\`, \`name\`,
            \`phone\`, \`whatsapp_number\`, \`email\`,
            \`state\`, \`city\`, \`location\`,
            \`buyer_lead_priority\`, \`buyer_lead_source\`, \`buyer_lead_stage\`, \`buyer_lead_status\`,
            \`budget_min\`, \`budget_max\`,
            \`requirements\`, \`financials\`,
            \`assigned_executive\`, \`created_by\`,
            \`remark\`, \`dob\`, \`nearbylocations\`,
            \`created_at\`, \`updated_at\`
          ) VALUES (
            ?, ?,                 -- salutation, name
            ?, ?, ?,              -- phone, whatsapp_number, email
            ?, ?, ?,              -- state, city, location
            ?, ?, ?, ?,           -- priority, source, stage, status
            ?, ?,                 -- budget_min, budget_max
            CAST(? AS JSON), CAST(? AS JSON), -- requirements, financials
            ?, ?,                 -- assigned_executive, created_by
            ?, ?, ?,              -- remark, dob, nearbylocations
            NOW(), NOW()          -- created_at, updated_at
          )`,
          [
            salutation, name,
            phone, whatsapp_number, email,
            state, city, location,
            buyer_lead_priority, buyer_lead_source, buyer_lead_stage, buyer_lead_status,
            budget_min, budget_max,
            requirements, financials,
            assigned_executive, createdByFinal,
            remark, dob, nearbylocations,
          ]
        );

        inserted++;
        insertedRows.push({ id: res.insertId, name });

        // update in-memory dedupe sets
        if (email) existingEmails.add(email);
        if (phone) existingPhones.add(phone);
      } catch (err) {
        if (err?.code === "ER_DUP_ENTRY" || err?.errno === 1062) {
          skippedRows.push({
            row: rowNum,
            reason: "Duplicate entry (email/phone already exists)",
            data: raw,
            dbError: err.message
          });
        } else if (err?.code === "3140") {
          skippedRows.push({
            row: rowNum,
            reason: "Invalid JSON in requirements/financials",
            data: raw,
            dbError: err.message
          });
        } else {
          skippedRows.push({
            row: rowNum,
            reason: `Database error: ${err.message}`,
            data: raw,
            dbError: err.message
          });
        }
      }
    }

    return { success: true, inserted, skipped: skippedRows.length, skippedRows, updatedRows: [], insertedRows };
  }
}

module.exports = Buyer;
