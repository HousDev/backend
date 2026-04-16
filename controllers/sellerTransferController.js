// controllers/transferToSeller.js
const pool = require("../config/database"); // mysql2/promise pool
require("dotenv").config();
const { slugifyTextParts } = require("../utils/slugify"); // ✅ add import

/* ------------ helpers ------------ */
function toSqlDate(isoOrDate) {
  if (!isoOrDate) return null;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function toSqlTime(isoOrDate) {
  if (!isoOrDate) return null;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mi}:${ss}`;
}
function toSqlDateTime(isoOrDate) {
  if (!isoOrDate) return null;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}
function asIntOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function isValidTimeString(t) {
  // Accepts "HH:MM" or "HH:MM:SS"
  return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(t);
}
function toSqlTimeOrNull(v) {
  if (isValidTimeString(v)) {
    // Normalize to HH:MM:SS
    return v.length === 5 ? `${v}:00` : v;
  }
  return toSqlTime(v);
}

/**
 * POST /api/transfer-to-seller
 * Body:
 * {
 *   leadId: string|number,
 *   createdBy?: number,
 *   seller: {...},
 *   my_property: {...},
 *   seller_followups: [...]
 * }
 */
async function transferToSeller(req, res) {
  const {
    leadId,
    createdBy,
    seller = {},
    my_property = {},
    seller_followups = [],
  } = req.body || {};
  if (!leadId) return res.status(400).json({ error: "leadId is required" });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1) Load lead (sanity)
    const [leadRows] = await conn.query(
      "SELECT * FROM client_leads WHERE id = ? LIMIT 1",
      [leadId]
    );
    const lead = Array.isArray(leadRows) && leadRows.length ? leadRows[0] : null;
    if (!lead) {
      await conn.rollback();
      return res.status(404).json({ error: "Lead not found" });
    }

    const now = toSqlDateTime(new Date().toISOString());

    // 2) Insert seller
    const sellerRow = {
      salutation: seller.salutation ?? lead.salutation ?? null,
      name: seller.name ?? lead.name ?? null,
      phone: seller.phone ?? lead.phone ?? null,
      whatsapp: seller.whatsapp ?? lead.whatsapp_number ?? null,
      email: seller.email ?? lead.email ?? null,
      state: seller.state ?? lead.state ?? null,
      city: seller.city ?? lead.city ?? null,
      location: seller.location ?? lead.location ?? null,
      countryCode: seller.countryCode ?? null,

      stage: seller.stage ?? lead.stage ?? null,
      leadType: seller.leadType ?? lead.lead_type ?? null,
      priority: seller.priority ?? lead.priority ?? null,
      status: seller.status ?? lead.status ?? null,
      source: seller.source ?? lead.lead_source ?? null,
      notes: seller.notes ?? null,

      seller_dob: seller.seller_dob ?? null,
      expected_close: seller.expected_close ?? null,
      last_activity: seller.last_activity
        ? toSqlDateTime(seller.last_activity)
        : now,
      lead_score: seller.lead_score ?? null,
      deal_value: seller.deal_value ?? null,
      visits: seller.visits ?? 0,
      total_visits: seller.total_visits ?? 0,
      stage_progress: seller.stage_progress ?? null,
      deal_potential: seller.deal_potential ?? null,
      response_rate: seller.response_rate ?? null,
      avg_response_time: seller.avg_response_time ?? null,

      assigned_to:
        asIntOrNull(seller.assigned_to) ??
        asIntOrNull(lead.assigned_executive) ??
        null,
      assigned_to_name: seller.assigned_to_name ?? null,
      notifications: seller.notifications ?? null,

      is_active: seller.is_active != null ? (seller.is_active ? 1 : 0) : 1,
      created_at: toSqlDateTime(seller.created_at) ?? now,
      updated_at: toSqlDateTime(seller.updated_at) ?? now,
      current_stage: seller.current_stage ?? lead.stage ?? null,
    };

    const sellerCols = Object.keys(sellerRow);
    const sellerSql = `INSERT INTO sellers (${sellerCols.join(
      ","
    )}) VALUES (${sellerCols.map(() => "?").join(",")})`;
    const [sellerRes] = await conn.query(
      sellerSql,
      sellerCols.map((k) => sellerRow[k])
    );
    const sellerId = sellerRes.insertId;

    // 3) Compute budget (₹) from incoming payload (new or legacy)
    const CRORE_TO_RUPEE = 10_000_000;
    const budgetFromPayload =
      asIntOrNull(my_property.budget) || // new FE (rupees)
      asIntOrNull(my_property.price_max_rupees) || // legacy rupees
      (Number(my_property.price_max_cr)
        ? Math.trunc(Number(my_property.price_max_cr) * CRORE_TO_RUPEE)
        : null); // legacy crore

    // 3b) Insert my_properties (single)
    const propRow = {
      seller_name: sellerRow.name ?? null,
      seller_id: sellerId,
      lead_id: String(lead.id),
      assigned_to:
        asIntOrNull(my_property.assigned_to) ?? sellerRow.assigned_to ?? null,

      property_type_name: my_property.property_type_name ?? null,
      property_subtype_name: my_property.property_subtype_name ?? null,
      unit_type: my_property.unit_type ?? null,
      wing: my_property.wing ?? null,
      unit_no: my_property.unit_no ?? null,
      furnishing: my_property.furnishing ?? null,
      bedrooms: my_property.bedrooms ?? null,
      bathrooms: my_property.bathrooms ?? null,
      facing: my_property.facing ?? null,
      parking_type: my_property.parking_type ?? null,
      parking_qty: my_property.parking_qty ?? null,

      city_name: my_property.city_name ?? sellerRow.city ?? null,
      location_name: my_property.location_name ?? sellerRow.location ?? null,
      society_name: my_property.society_name ?? null,
      floor: my_property.floor ?? null,
      total_floors: my_property.total_floors ?? null,

      carpet_area: my_property.carpet_area ?? null,
      builtup_area: my_property.builtup_area ?? null,

      // ✅ Persist rupees for budget
      budget: budgetFromPayload ?? null,

      address: my_property.address ?? null,

      status: my_property.status ?? "new",
      lead_source: my_property.lead_source ?? lead.lead_source ?? null,
      possession_month: my_property.possession_month ?? null,
      possession_year: my_property.possession_year ?? null,
      purchase_month: my_property.purchase_month ?? null,
      purchase_year: my_property.purchase_year ?? null,
      selling_rights: my_property.selling_rights ?? null,

      ownership_doc_path: my_property.ownership_doc_path ?? null,
      photos: my_property.photos ?? null,
      amenities: my_property.amenities ?? null,
      furnishing_items: my_property.furnishing_items ?? null,

      description: my_property.description ?? null,

      created_at: toSqlDateTime(my_property.created_at) ?? now,
      updated_at: toSqlDateTime(my_property.updated_at) ?? now,
      is_public:
        my_property.is_public != null ? (my_property.is_public ? 1 : 0) : 0,
      publication_date: toSqlDateTime(my_property.publication_date) ?? null,
      created_by:
        asIntOrNull(my_property.created_by) ?? asIntOrNull(createdBy) ?? null,
      updated_by:
        asIntOrNull(my_property.updated_by) ?? asIntOrNull(createdBy) ?? null,
      public_views: my_property.public_views ?? 0,
      public_inquiries: my_property.public_inquiries ?? 0,
      slug: my_property.slug ?? null, // may be null; we'll compute after insert
    };

    const propCols = Object.keys(propRow);
    const propSql = `INSERT INTO my_properties (${propCols.join(
      ","
    )}) VALUES (${propCols.map(() => "?").join(",")})`;
    const [propRes] = await conn.query(
      propSql,
      propCols.map((k) => propRow[k])
    );
    const propertyId = propRes.insertId;

    // 🔗 3c) Generate slug now that we have propertyId
    // Only if no slug was provided in payload
    if (!propRow.slug || String(propRow.slug).trim() === "") {
      const ptype  = propRow.property_type_name;
      const utype  = propRow.unit_type;
      const psub   = propRow.property_subtype_name;
      const loc    = propRow.location_name;
      const city   = propRow.city_name;

      const newSlug = slugifyTextParts(
        propertyId,
        ptype,
        utype,
        psub,
        loc,
        city
      );

      await conn.query(
        "UPDATE my_properties SET slug = ? WHERE id = ?",
        [newSlug, propertyId]
      );
    }

    // 4) Insert seller_followups (bulk) – parity with buyer richness
    if (Array.isArray(seller_followups) && seller_followups.length > 0) {
      const rows = seller_followups.map((f) => {
        // Prefer explicit schedule; otherwise allow explicit followup_date/time; else NULL (no fake 1970 defaults)
        const scheduledSrc =
          f.scheduled_date ?? f.scheduledDate ?? f.scheduled_at ?? f.scheduledAt ?? null;
        const completedSrc =
          f.completed_date ?? f.completedDate ?? f.completed_at ?? null;

        const scheduledDt = scheduledSrc ? new Date(scheduledSrc) : null;
        const hasValidScheduled = scheduledDt && !Number.isNaN(scheduledDt.getTime());
        const completedDt = completedSrc ? new Date(completedSrc) : null;
        const hasValidCompleted = completedDt && !Number.isNaN(completedDt.getTime());

        // Respect provided date/time strings if already SQL-like
        const finalDateSql = hasValidScheduled
          ? toSqlDate(scheduledDt)
          : (toSqlDate(f.followup_date) || null);

        const finalTimeSql =
          toSqlTimeOrNull(f.followup_time) ||
          (hasValidScheduled ? toSqlTime(scheduledDt) : null);

        const assignedExec =
          asIntOrNull(f.assigned_executive) ??
          asIntOrNull(f.assigned_to) ??
          asIntOrNull(sellerRow.assigned_to) ??
          asIntOrNull(createdBy) ??
          null;

        const createdByForRow =
          asIntOrNull(f.created_by) ?? asIntOrNull(createdBy) ?? null;
        const updatedByForRow =
          asIntOrNull(f.updated_by) ?? asIntOrNull(createdBy) ?? null;

        // Merge notes from remark/customRemark if notes not provided
        const notesNormalized =
          f.notes ??
          f.remark ??
          f.custom_remark ??
          f.customRemark ??
          null;

        return {
          // Existing columns (keep names)
          followup_id: f.followup_id ?? f.id ?? null,        // VARCHAR(36) recommended
          lead_id: String(lead.id),                           // align with buyer flow (UUID-safe)
          seller_id: sellerId,
          followup_type: f.followup_type ?? f.type ?? "other",
          followup_date: finalDateSql,
          followup_time: finalTimeSql,
          status: f.status ?? null,
          priority: f.priority ?? "Medium",
          assigned_to: assignedExec,
          reminder: f.reminder != null ? (f.reminder ? 1 : 0) : 0,
          notes: notesNormalized,

          // Rich parity (additive; safe if columns exist)
          seller_lead_stage: f.seller_lead_stage ?? f.stage ?? null,
          seller_lead_status: f.seller_lead_status ?? f.status ?? null,
          remark: f.remark ?? null,
          custom_remark: f.custom_remark ?? f.customRemark ?? null,
          next_action: f.next_action ?? f.nextAction ?? null,
          completed_date: hasValidCompleted ? toSqlDateTime(completedDt) : null,
          schedule_date: hasValidScheduled ? toSqlDate(scheduledDt) : (toSqlDate(f.schedule_date) || null),

          transferred_from_lead:
            f.transferred_from_lead != null ? (f.transferred_from_lead ? 1 : 0) : 1,
          transferred_at: toSqlDateTime(f.transferred_at) ?? now,
          transferred_by: asIntOrNull(f.transferred_by) ?? asIntOrNull(createdBy) ?? null,
          transfer_type: f.transfer_type ?? "lead_transfer",

          assigned_executive: assignedExec,
          created_by: createdByForRow,
          updated_by: updatedByForRow,
          created_at: toSqlDateTime(f.created_at) ?? now,
          updated_at: toSqlDateTime(f.updated_at) ?? now,
        };
      });

      // filter out rows that somehow have neither date nor time if your DB requires one
      const cols = Object.keys(rows[0]);
      const placeholders = rows.map(() => `(${cols.map(() => "?").join(",")})`).join(",");
      const values = [];
      rows.forEach((r) => cols.forEach((c) => values.push(r[c])));

      const fSql = `INSERT INTO seller_followups (${cols.join(",")}) VALUES ${placeholders}`;
      await conn.query(fSql, values);
    }

    // 5) Update client_leads (soft hide, mark transferred)
    const updLeadSql = `
      UPDATE client_leads
      SET
        transferred_to_seller = 1,
        transferred_to_seller_at = ?,
        transferred_to_seller_by = ?,
        is_listed = 0,
        updated_at = ?
      WHERE id = ?
    `;
    await conn.query(updLeadSql, [
      now,
      asIntOrNull(createdBy) ?? null,
      now,
      leadId,
    ]);

    await conn.commit();

    return res.status(201).json({
      success: true,
      message: "Lead transferred to seller with property and followups.",
      seller_id: sellerId,
      property_id: propertyId,
    });
  } catch (err) {
    console.error("transferToSeller error:", err);
    try {
      if (conn) await conn.rollback();
    } catch {}
    return res
      .status(500)
      .json({ error: "Transfer failed", details: String(err?.message || err) });
  } finally {
    try {
      if (conn) conn.release();
    } catch {}
  }
}

module.exports = { transferToSeller };
