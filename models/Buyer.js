// models/Buyer.js
const db = require("../config/database");

/* ========================= Helpers ========================= */
const safeParse = (v, fallback = {}) => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  if (typeof v === "object") return v; // mysql2 may already return object for JSON columns
  return fallback;
};

const safeStringify = (v, fallback = {}) => {
  if (v === null || v === undefined) return JSON.stringify(fallback);
  if (typeof v === "string") return v; // assume already a JSON string
  try { return JSON.stringify(v); } catch { return JSON.stringify(fallback); }
};

/** shallow object merge; arrays REPLACE entirely (form semantics) */
const deepMergePreferringIncoming = (current, incoming) => {
  const a = safeParse(current, {});
  const b = safeParse(incoming, {});
  const out = { ...a };
  for (const k of Object.keys(b)) {
    const bv = b[k];
    const av = a[k];
    if (Array.isArray(bv)) {
      out[k] = bv;
    } else if (
      bv && typeof bv === "object" &&
      av && typeof av === "object" &&
      !Array.isArray(av)
    ) {
      out[k] = { ...av, ...bv };
    } else {
      out[k] = bv;
    }
  }
  return out;
};

/* ========================= Model ========================= */
class Buyer {
  /** Create a new buyer */
  static async create(data) {
    const {
      salutation,
      name,
      phone,
      whatsapp_number,
      email,
      state,
      city,
      location,
      buyer_lead_priority,
      buyer_lead_source,
      buyer_lead_stage,
      buyer_lead_status,
      budget_min,
      budget_max,
      requirements,
      financials,
    } = data;

    const [result] = await db.execute(
      `INSERT INTO buyers (
        \`salutation\`, \`name\`, \`phone\`, \`whatsapp_number\`, \`email\`,
        \`state\`, \`city\`, \`location\`,
        \`buyer_lead_priority\`, \`buyer_lead_source\`, \`buyer_lead_stage\`, \`buyer_lead_status\`,
        \`budget_min\`, \`budget_max\`, \`requirements\`, \`financials\`, \`created_at\`, \`updated_at\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), NOW(), NOW())`,
      [
        salutation ?? "Mr.",
        name,
        phone ?? null,
        whatsapp_number ?? null,
        email ?? null,
        state ?? null,
        city ?? null,
        location ?? null,
        buyer_lead_priority ?? null,
        buyer_lead_source ?? null,
        buyer_lead_stage ?? null,
        buyer_lead_status ?? null,
        budget_min ?? 0,
        budget_max ?? 0,
        safeStringify(requirements, {}),
        safeStringify(financials, {}),
      ]
    );

    return await Buyer.findById(result.insertId);
  }

  /** Find buyer by ID */
  static async findById(id) {
    const [rows] = await db.execute("SELECT * FROM buyers WHERE id = ?", [id]);
    if (!rows[0]) return null;

    const row = rows[0];
    return {
      ...row,
      requirements: safeParse(row.requirements, {}),
      financials:  safeParse(row.financials, {}),
      budget: { min: row.budget_min, max: row.budget_max },
    };
  }

  /** Fetch all buyers (latest first) */
  static async findAll() {
    const [rows] = await db.execute("SELECT * FROM buyers ORDER BY created_at DESC");
    return rows.map((row) => ({
      ...row,
      requirements: safeParse(row.requirements, {}),
      financials:  safeParse(row.financials, {}),
      budget: { min: row.budget_min, max: row.budget_max },
    }));
  }

  /** Update buyer (partial payload supported; nested JSON deep-merged) */
  static async update(id, data) {
    const current = await this.findById(id);
    if (!current) return null;

    // Prepare merged nested JSON
    const incomingReq = data.requirements !== undefined ? data.requirements : undefined;
    const incomingFin = data.financials  !== undefined ? data.financials  : undefined;

    const mergedRequirements =
      incomingReq === undefined
        ? current.requirements
        : deepMergePreferringIncoming(current.requirements, incomingReq);

    const mergedFinancials =
      incomingFin === undefined
        ? current.financials
        : deepMergePreferringIncoming(current.financials, incomingFin);

    const merged = {
      salutation:           data.salutation           ?? current.salutation,
      name:                 data.name                 ?? current.name,
      phone:                data.phone                ?? current.phone,
      whatsapp_number:      data.whatsapp_number      ?? current.whatsapp_number ?? current.whatsapp,
      email:                data.email                ?? current.email,
      state:                data.state                ?? current.state,
      city:                 data.city                 ?? current.city,
      location:             data.location             ?? current.location,
      buyer_lead_priority:  data.buyer_lead_priority  ?? current.buyer_lead_priority ?? current.priority,
      buyer_lead_source:    data.buyer_lead_source    ?? current.buyer_lead_source   ?? current.source,
      buyer_lead_stage:     data.buyer_lead_stage     ?? current.buyer_lead_stage    ?? current.stage,
      buyer_lead_status:    data.buyer_lead_status    ?? current.buyer_lead_status   ?? current.status,
      budget_min:           data.budget_min ?? (current.budget?.min ?? current.budget_min ?? 0),
      budget_max:           data.budget_max ?? (current.budget?.max ?? current.budget_max ?? 0),
      requirements:         safeStringify(mergedRequirements, {}),
      financials:           safeStringify(mergedFinancials, {}),
    };

    await db.execute(
      `UPDATE buyers SET
        \`salutation\`=?, \`name\`=?, \`phone\`=?, \`whatsapp_number\`=?, \`email\`=?,
        \`state\`=?, \`city\`=?, \`location\`=?,
        \`buyer_lead_priority\`=?, \`buyer_lead_source\`=?, \`buyer_lead_stage\`=?, \`buyer_lead_status\`=?,
        \`budget_min\`=?, \`budget_max\`=?, \`requirements\`=CAST(? AS JSON), \`financials\`=CAST(? AS JSON), \`updated_at\`=NOW()
       WHERE \`id\`=?`,
      [
        merged.salutation, merged.name, merged.phone, merged.whatsapp_number, merged.email,
        merged.state, merged.city, merged.location,
        merged.buyer_lead_priority, merged.buyer_lead_source, merged.buyer_lead_stage, merged.buyer_lead_status,
        merged.budget_min, merged.budget_max,
        merged.requirements, // JSON string param, CAST ensures JSON type
        merged.financials,   // JSON string param
        id,
      ]
    );

    return await this.findById(id);
  }

  /** Optional: soft delete (archive) */
  static async softDelete(id) {
    await db.execute(
      "UPDATE buyers SET is_active=0, updated_at=NOW() WHERE id=?",
      [id]
    );
    return { id, is_active: 0 };
  }

 static async bulkImport(buyers) {
  if (!Array.isArray(buyers) || buyers.length === 0) {
    return { inserted: 0, skipped: 0, skippedRows: [] };
  }

  // Normalizers (same approach as earlier)
  const normalizeEmail = (e) =>
    typeof e === "string" && e.trim() !== "" ? e.trim().toLowerCase() : null;
  const normalizePhone = (p) =>
    p === null || p === undefined ? null : String(p).replace(/[^\d]/g, "") || null;

  // Fetch existing emails/phones once from DB
  const [existingRows] = await db.query("SELECT email, phone FROM buyers");
  const existingEmails = new Set(
    existingRows.map((r) => (r.email ? String(r.email).toLowerCase() : null)).filter(Boolean)
  );
  const existingPhones = new Set(
    existingRows.map((r) => (r.phone ? String(r.phone) : null)).filter(Boolean)
  );

  const skippedRows = [];
  let inserted = 0;

  for (const [index, raw] of buyers.entries()) {
    const rowNum = index + 2; // assume header present; adjust if needed
    // Normalize inputs using same keys as model
    const salutation = raw.salutation ?? "Mr.";
    const name = raw.name ?? "";
    const email = normalizeEmail(raw.email ?? null);
    const phone = normalizePhone(raw.phone ?? null);
    const whatsapp_number = raw.whatsapp_number ?? null;
    const state = raw.state ?? null;
    const city = raw.city ?? null;
    const location = raw.location ?? null;
    const buyer_lead_priority = raw.buyer_lead_priority ?? null;
    const buyer_lead_source = raw.buyer_lead_source ?? null;
    const buyer_lead_stage = raw.buyer_lead_stage ?? null;
    const buyer_lead_status = raw.buyer_lead_status ?? null;
    const budget_min = raw.budget_min ?? 0;
    const budget_max = raw.budget_max ?? 0;
    const requirements = safeStringify(raw.requirements, {});
    const financials = safeStringify(raw.financials, {});

    // Skip if duplicate by email/phone (DB or earlier rows)
    if (email && existingEmails.has(email)) {
      skippedRows.push({ row: rowNum, reason: `Email already exists (${email})`, data: raw });
      continue;
    }
    if (phone && existingPhones.has(phone)) {
      skippedRows.push({ row: rowNum, reason: `Phone already exists (${phone})`, data: raw });
      continue;
    }

    // Attempt insert
    try {
      await db.execute(
        `INSERT INTO buyers (
          \`salutation\`, \`name\`, \`phone\`, \`whatsapp_number\`, \`email\`,
          \`state\`, \`city\`, \`location\`,
          \`buyer_lead_priority\`, \`buyer_lead_source\`, \`buyer_lead_stage\`, \`buyer_lead_status\`,
          \`budget_min\`, \`budget_max\`, \`requirements\`, \`financials\`, \`created_at\`, \`updated_at\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), NOW(), NOW())`,
        [
          salutation,
          name,
          phone,
          whatsapp_number,
          email,
          state,
          city,
          location,
          buyer_lead_priority,
          buyer_lead_source,
          buyer_lead_stage,
          buyer_lead_status,
          budget_min,
          budget_max,
          requirements,
          financials,
        ]
      );

      inserted++;
      // add to in-memory sets so subsequent rows in same file see these as existing
      if (email) existingEmails.add(email);
      if (phone) existingPhones.add(phone);
    } catch (err) {
      // handle DB duplicate constraint or other errors gracefully
      if (err && (err.code === "ER_DUP_ENTRY" || (err.errno && err.errno === 1062))) {
        skippedRows.push({
          row: rowNum,
          reason: `DB duplicate entry (ER_DUP_ENTRY)`,
          data: raw,
          dbError: err.message,
        });
      } else {
        skippedRows.push({
          row: rowNum,
          reason: `DB error`,
          data: raw,
          dbError: err.message,
        });
      }
      // continue with next row
    }
  } // end loop

  return { inserted, skipped: skippedRows.length, skippedRows };
}
}

module.exports = Buyer;
