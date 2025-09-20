// controllers/transferToSeller.js
const pool = require("../config/database");
const Property = require("../models/Property");
const SellerModel = require("../models/SellerModel");

// helpers
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

function ensureJsonString(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    try {
      JSON.parse(s);
      return s;
    } catch {
      const arr = s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      return arr.length ? JSON.stringify(arr) : null;
    }
  }
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

// Build property payload: use human-readable budget string (from overrides or lead)
function buildPropertyPayload(overrides, lead, createdBy) {
  // include lead fields as fallback so budget from lead is used if overrides missing
  const rawBudget =
    overrides.budget ??
    overrides.budget_range ??
    overrides.price ??
    lead.budget ??
    lead.budget_range ??
    lead.price ??
    null;

  const photosJson = ensureJsonString(overrides.photos ?? null);
  const amenitiesJson = ensureJsonString(overrides.amenities ?? null);
  const furnishingJson = ensureJsonString(
    overrides.furnishing_items ?? overrides.furnishingItems ?? null
  );
  const nearbyJson = ensureJsonString(
    overrides.nearby_places ??
      overrides.nearbyplaces ??
      overrides.nearbyLocations ??
      null
  );

  return {
    seller_name: overrides.seller_name ?? lead.name ?? null,
    seller_id: overrides.seller_id ?? null,
    assigned_to: overrides.assigned_to ?? overrides.assigned_executive ?? null,
    property_type_name:
      overrides.property_type ??
      overrides.propertyType ??
      lead.property_type ??
      null,
    property_subtype_name:
      overrides.property_subtype ??
      overrides.property_subtype_name ??
      lead.property_subtype ??
      null,
    unit_type: overrides.unit_type ?? overrides.unitType ?? null,
    wing: overrides.wing ?? null,
    unit_no: overrides.unit_no ?? null,
    furnishing: overrides.furnishing ?? null,
    parking_type: overrides.parking_type ?? null,
    parking_qty: overrides.parking_qty ?? null,
    city_name: overrides.city ?? lead.city ?? null,
    location_name: overrides.location ?? lead.location ?? null,
    society_name: overrides.society ?? overrides.society_name ?? null,
    floor: overrides.floor ?? null,
    total_floors: overrides.total_floors ?? null,
    carpet_area: overrides.carpet_area ?? overrides.carpetArea ?? null,
    builtup_area: overrides.builtup_area ?? null,

    // store human-readable budget string directly (e.g., "80L", "2Cr")
    budget: rawBudget ? String(rawBudget) : null,

    address: overrides.address ?? null,
    status: overrides.status ?? lead.status ?? null,
    lead_source: overrides.lead_source ?? lead.lead_source ?? null,
    possession_month: overrides.possession_month ?? null,
    possession_year: overrides.possession_year ?? null,
    purchase_month: overrides.purchase_month ?? null,
    purchase_year: overrides.purchase_year ?? null,
    selling_rights: overrides.selling_rights ?? null,
    ownership_doc_path: overrides.ownership_doc_path ?? null,
    photos: photosJson,
    amenities: amenitiesJson,
    furnishing_items: furnishingJson,
    nearby_places: nearbyJson,
    description: overrides.description ?? null,
    is_public: overrides.is_public ?? false,
    publication_date: overrides.publication_date ?? null,
    created_at:
      toSqlDateTime(overrides.created_at) ??
      toSqlDateTime(new Date().toISOString()),
    updated_at:
      toSqlDateTime(overrides.updated_at) ??
      toSqlDateTime(new Date().toISOString()),
    lead_id: String(lead.id),
    created_by:
      asIntOrNull(createdBy) ?? asIntOrNull(overrides.created_by) ?? null,
    updated_by:
      asIntOrNull(createdBy) ?? asIntOrNull(overrides.updated_by) ?? null,
  };
}

// Build seller payload: **NOTE: no `notes` field here** (we dropped it)
function buildSellerPayload(overrides, lead, propertyId, createdBy) {
  return {
    salutation: overrides.salutation ?? lead.salutation ?? null,
    name: overrides.name ?? lead.name ?? null,
    phone: overrides.phone ?? lead.phone ?? null,
    whatsapp:
      overrides.whatsapp ??
      overrides.whatsapp_number ??
      lead.whatsapp_number ??
      null,
    email: overrides.email ?? lead.email ?? null,
    source: overrides.lead_source ?? lead.lead_source ?? null,
    leadType: overrides.lead_type ?? lead.lead_type ?? null,
    status: overrides.status ?? lead.status ?? null,
    created_by:
      asIntOrNull(createdBy) ??
      asIntOrNull(overrides.created_by) ??
      asIntOrNull(lead.created_by) ??
      null,
    assigned_to:
      overrides.assigned_executive ??
      overrides.assigned_to ??
      lead.assigned_executive ??
      null,
    assigned_to_name:
      overrides.assigned_executive_name ?? overrides.assigned_to_name ?? null,
    lead_id: String(lead.id),
    property_id: propertyId ?? null,
    created_at:
      toSqlDateTime(overrides.created_at) ??
      toSqlDateTime(new Date().toISOString()),
    updated_at:
      toSqlDateTime(overrides.updated_at) ??
      toSqlDateTime(new Date().toISOString()),
    is_active: overrides.is_active != null ? (overrides.is_active ? 1 : 0) : 1,
  };
}

// Main controller
async function transferToSeller(req, res) {
  const { leadId, overrides = {}, createdBy } = req.body || {};
  console.log(req.body);
  if (!leadId) return res.status(400).json({ error: "leadId is required" });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // load lead
    const [leadRows] = await conn.query(
      "SELECT * FROM client_leads WHERE id = ? LIMIT 1",
      [leadId]
    );
    const lead =
      Array.isArray(leadRows) && leadRows.length ? leadRows[0] : null;
    if (!lead) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ error: "Lead not found" });
    }

    // load followups
    const [followupRows] = await conn.query(
      "SELECT * FROM followups WHERE lead_id = ?",
      [leadId]
    );
    const followups = Array.isArray(followupRows) ? followupRows : [];

    // 1) create property (transactional insert using conn)
    const propertyPayload = buildPropertyPayload(overrides, lead, createdBy);

    // optional debug: uncomment to inspect payload before insert
    // console.log("propertyPayload:", JSON.stringify(propertyPayload, null, 2));

    const propCols = Object.keys(propertyPayload).filter(
      (k) => propertyPayload[k] !== undefined
    );
    const propPlaceholders = propCols.map(() => "?").join(", ");
    const propValues = propCols.map((k) => propertyPayload[k]);
    const propSql = `INSERT INTO my_properties (${propCols.join(
      ", "
    )}) VALUES (${propPlaceholders})`;
    const [propInsertRes] = await conn.query(propSql, propValues);

    const propertyId =
      propInsertRes &&
      (propInsertRes.insertId ||
        (Array.isArray(propInsertRes) &&
          propInsertRes[0] &&
          propInsertRes[0].insertId))
        ? propInsertRes.insertId || propInsertRes[0].insertId
        : null;
    if (!propertyId) throw new Error("Failed to insert property");

    const [propRows] = await conn.query(
      "SELECT * FROM my_properties WHERE id = ? LIMIT 1",
      [propertyId]
    );
    const createdProperty =
      Array.isArray(propRows) && propRows.length ? propRows[0] : null;

    // 2) create seller (transactional)
    const sellerPayload = buildSellerPayload(
      overrides,
      lead,
      propertyId,
      createdBy
    );

    // dynamic insert using sellerPayload keys (so we won't try to write dropped columns)
    const sellerCols = Object.keys(sellerPayload).filter(
      (k) => sellerPayload[k] !== undefined
    );
    const sellerPlaceholders = sellerCols.map(() => "?").join(", ");
    const sellerValues = sellerCols.map((k) => sellerPayload[k]);
    const sellerSql = `INSERT INTO sellers (${sellerCols.join(
      ", "
    )}) VALUES (${sellerPlaceholders})`;
    const [sellerInsertRes] = await conn.query(sellerSql, sellerValues);

    const createdSellerId =
      sellerInsertRes &&
      (sellerInsertRes.insertId ||
        (Array.isArray(sellerInsertRes) &&
          sellerInsertRes[0] &&
          sellerInsertRes[0].insertId))
        ? sellerInsertRes.insertId || sellerInsertRes[0].insertId
        : null;
    if (!createdSellerId) throw new Error("Failed to insert seller");

    const [sellerRows] = await conn.query(
      "SELECT * FROM sellers WHERE id = ? LIMIT 1",
      [createdSellerId]
    );
    const createdSeller =
      Array.isArray(sellerRows) && sellerRows.length ? sellerRows[0] : null;

    // 3) map followups -> seller_followups (best-effort)
    if (Array.isArray(followups) && followups.length > 0) {
      const followupRowsToInsert = followups.map((fu) => {
        const scheduleDateTime =
          fu.scheduled_date ??
          fu.scheduledDate ??
          fu.scheduled_at ??
          fu.scheduledAt ??
          null;
        const completedDate =
          fu.completed_date ?? fu.completedDate ?? fu.completed_at ?? null;
        return {
          seller_id: createdSellerId,
          lead_id: fu.lead_id ?? lead.id ?? null,
          followup_id: fu.id ?? null,
          followup_type: fu.type ?? fu.followup_type ?? "other",
          seller_lead_stage: fu.stage ?? null,
          seller_lead_status: fu.status ?? null,
          notes: fu.notes ?? null,
          next_action: fu.next_action ?? fu.nextAction ?? null,
          completed_date: completedDate ? toSqlDateTime(completedDate) : null,
          schedule_date: scheduleDateTime
            ? toSqlDateTime(scheduleDateTime)
            : null,
          schedule_time: scheduleDateTime
            ? new Date(scheduleDateTime).toTimeString().split(" ")[0]
            : null,
          priority: fu.priority ?? "Medium",
          created_by:
            asIntOrNull(fu.created_by) ?? asIntOrNull(createdBy) ?? null,
          updated_by:
            asIntOrNull(fu.updated_by) ?? asIntOrNull(createdBy) ?? null,
          created_at:
            toSqlDateTime(fu.created_at) ??
            toSqlDateTime(new Date().toISOString()),
          updated_at:
            toSqlDateTime(fu.updated_at) ??
            toSqlDateTime(new Date().toISOString()),
        };
      });

      if (followupRowsToInsert.length > 0) {
        // remove columns that are null for all rows to avoid 'unknown column' if table differs
        const cols = Object.keys(followupRowsToInsert[0]).filter((c) =>
          followupRowsToInsert.some((r) => r[c] !== undefined)
        );
        const placeholders = followupRowsToInsert
          .map(() => `(${cols.map(() => "?").join(", ")})`)
          .join(", ");
        const values = [];
        followupRowsToInsert.forEach((row) =>
          cols.forEach((c) => values.push(row[c]))
        );
        const insertSql = `INSERT INTO seller_followups (${cols.join(
          ", "
        )}) VALUES ${placeholders}`;
        try {
          await conn.query(insertSql, values);
        } catch (e) {
          console.warn(
            "seller_followups insert failed (non-fatal):",
            e && e.message
          );
        }
      }
    }

    // 4) update lead
    const nowSql = toSqlDateTime(new Date().toISOString());
    const leadUpdateSql = `
      UPDATE client_leads
      SET
        status = ?,
        stage = ?,
        updated_at = ?,
        updated_by = ?,
        transferred_to_seller = 1,
        transferred_to_seller_at = ?,
        transferred_to_seller_by = ?,
        is_listed = 0
      WHERE id = ?
    `;
    const leadStatus = overrides.status ?? lead.status ?? null;
    const leadStage = overrides.stage ?? lead.stage ?? null;
    await conn.query(leadUpdateSql, [
      leadStatus,
      leadStage,
      nowSql,
      asIntOrNull(createdBy) ?? null,
      nowSql,
      asIntOrNull(createdBy) ?? null,
      leadId,
    ]);

    await conn.commit();
    conn.release();

    return res.status(201).json({
      success: true,
      message: "Lead transferred to property + seller successfully",
      property: createdProperty,
      seller: createdSeller,
      transferred_followups_count: Array.isArray(followups)
        ? followups.length
        : 0,
    });
  } catch (err) {
    console.error(
      "transferToSeller error:",
      err && err.message ? err.message : err
    );
    try {
      if (conn) {
        await conn.rollback();
        conn.release();
      }
    } catch (rbErr) {
      console.error(
        "Rollback error:",
        rbErr && rbErr.message ? rbErr.message : rbErr
      );
    }
    return res.status(500).json({
      error: "Transfer failed",
      details: (err && err.message) || String(err),
    });
  }
}

module.exports = { transferToSeller };
