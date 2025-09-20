// controllers/transferController.js
// USING mysql2/promise pool (not knex)
// Make sure ../config/database exports a mysql2/promise pool (module.exports = pool)
const pool = require("../config/database"); // mysql2/promise pool
require("dotenv").config();

// ---------- helpers ----------
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

function safeStringify(val) {
  try {
    if (val === null || val === undefined) return null;
    if (typeof val === "string") return val;
    return JSON.stringify(val);
  } catch (e) {
    return null;
  }
}

// Helper to get requirements from form data or build from individual fields
function getRequirementsFromOverrides(overrides, lead) {
  // If requirements object is directly provided from form, use it
  if (overrides.requirements && typeof overrides.requirements === "object") {
    return overrides.requirements;
  }

  // Fallback: build from individual fields (for backward compatibility)
  const requirements = {};

  // Property type and subtype
  if (overrides.property_type || lead.property_type) {
    requirements.propertyType = overrides.property_type || lead.property_type;
  }
  if (overrides.property_subtype || lead.property_subtype) {
    requirements.property_subtype =
      overrides.property_subtype || lead.property_subtype;
  }

  // Unit types - handle array format
  const unitTypes =
    overrides.preferred_unit_type || lead.preferred_unit_type || [];
  if (Array.isArray(unitTypes) && unitTypes.length > 0) {
    requirements.unitTypes = unitTypes;
  }

  // Preferred locations - handle array format
  const preferredLocations =
    overrides.preferred_location || lead.preferred_location || [];
  if (Array.isArray(preferredLocations) && preferredLocations.length > 0) {
    requirements.preferredLocations = preferredLocations;
  }

  // Nearby locations - handle string or array
  const nearbyLocations = overrides.nearbylocations || lead.nearbylocations;
  if (nearbyLocations) {
    if (typeof nearbyLocations === "string") {
      requirements.nearbylocations = nearbyLocations
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
    } else if (Array.isArray(nearbyLocations)) {
      requirements.nearbylocations = nearbyLocations;
    }
  }

  return Object.keys(requirements).length > 0 ? requirements : {};
}

// ---------- main controller ----------
/**
 * POST /api/transfer-to-buyer
 * Body:
 *  {
 *    leadId: string,             // required
 *    overrides: { ... }          // optional: buyer field overrides (from form)
 *    createdBy: number|string    // optional user id performing transfer
 *  }
 */
async function transferToBuyer(req, res) {
  const { leadId, overrides = {}, createdBy } = req.body || {};

  if (!leadId) {
    return res.status(400).json({ error: "leadId is required" });
  }

  let conn;
  try {
    // 1) get connection and begin transaction
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 2) load lead
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

    // 3) load followups for this lead
    const [followupRows] = await conn.query(
      "SELECT * FROM followups WHERE lead_id = ?",
      [leadId]
    );
    const followups = Array.isArray(followupRows) ? followupRows : [];

    // 4) prepare buyer payload (merge lead fields + overrides from form)
    const nowSql = toSqlDateTime(new Date().toISOString());

    // Get requirements object from form data or build from individual fields
    const requirements = getRequirementsFromOverrides(overrides, lead);

    const buyerPayload = {
      // Basic info
      salutation: overrides.salutation ?? lead.salutation ?? "Mr.",
      name: overrides.name ?? lead.name ?? null,
      phone: overrides.phone ?? lead.phone ?? null,
      whatsapp_number:
        overrides.whatsapp_number ?? lead.whatsapp_number ?? null,
      email: overrides.email ?? lead.email ?? null,
      state: overrides.state ?? lead.state ?? null,
      city: overrides.city ?? lead.city ?? null,
      location: overrides.location ?? lead.location ?? null,

      // Lead mapping - use the buyer_lead_* fields
      buyer_lead_priority: overrides.priority ?? lead.priority ?? null,
      buyer_lead_source: overrides.lead_source ?? lead.lead_source ?? null,
      buyer_lead_stage: overrides.stage ?? lead.stage ?? null,
      buyer_lead_status: overrides.status ?? lead.status ?? null,

      // Budget (store individual fields)
      budget_min: Number(overrides.budget_min ?? lead.budget_min ?? 0) || 0,
      budget_max: Number(overrides.budget_max ?? lead.budget_max ?? 0) || 0,

      // Store requirements as JSON string
      requirements: safeStringify(requirements),

      // Other fields
      is_active:
        overrides.is_active != null ? (overrides.is_active ? 1 : 0) : 1,
      created_at: toSqlDateTime(overrides.created_at) ?? nowSql,
      updated_at: toSqlDateTime(overrides.updated_at) ?? nowSql,
      lead_id: String(lead.id),
      lead_type: overrides.lead_type ?? lead.lead_type ?? null,
      assigned_executive:
        asIntOrNull(overrides.assigned_executive ?? lead.assigned_executive) ??
        null,
      created_by:
        asIntOrNull(createdBy ?? overrides.created_by ?? lead.created_by) ??
        null,
      updated_by:
        asIntOrNull(createdBy ?? overrides.updated_by ?? lead.updated_by) ??
        null,
      last_contact:
        toSqlDateTime(overrides.last_contact ?? lead.last_contact) ?? null,
      last_contact_by:
        asIntOrNull(overrides.last_contact_by ?? lead.last_contact_by) ?? null,
      remark: overrides.remark ?? lead.remark ?? null,

      // Handle nearbylocations - only if not already in requirements
      nearbylocations: !requirements.nearbylocations
        ? typeof (overrides.nearbylocations ?? lead.nearbylocations) ===
          "object"
          ? safeStringify(overrides.nearbylocations ?? lead.nearbylocations)
          : overrides.nearbylocations ?? lead.nearbylocations ?? null
        : null,
    };

    // 5) insert buyer - dynamic insert using keys that are defined
    const insertCols = Object.keys(buyerPayload).filter(
      (k) => buyerPayload[k] !== undefined
    );
    const insertPlaceholders = insertCols.map(() => "?").join(", ");
    const insertValues = insertCols.map((k) => buyerPayload[k]);

    const insertSql = `INSERT INTO buyers (${insertCols.join(
      ", "
    )}) VALUES (${insertPlaceholders})`;
    const [insertResult] = await conn.query(insertSql, insertValues);

    // MySQL returns insertId
    const buyerId =
      insertResult &&
      (insertResult.insertId ||
        (Array.isArray(insertResult) &&
          insertResult[0] &&
          insertResult[0].insertId))
        ? insertResult.insertId || insertResult[0].insertId
        : null;

    // If insertId not found, attempt to lookup by lead_id or recent created_at
    let createdBuyer = null;
    if (buyerId) {
      const [brows] = await conn.query(
        "SELECT * FROM buyers WHERE id = ? LIMIT 1",
        [buyerId]
      );
      if (Array.isArray(brows) && brows.length) createdBuyer = brows[0];
    }
    if (!createdBuyer) {
      // fallback: get last buyer for this lead
      const [maybeRows] = await conn.query(
        "SELECT * FROM buyers WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1",
        [lead.id]
      );
      if (Array.isArray(maybeRows) && maybeRows.length)
        createdBuyer = maybeRows[0];
    }
    if (!createdBuyer) {
      throw new Error("Failed to determine created buyer after insert");
    }

    const createdBuyerId = Number(createdBuyer.id);
    if (!Number.isFinite(createdBuyerId)) {
      throw new Error("Created buyer id is not a valid integer");
    }

    // 6) map followups -> buyer_followups (prepare array of rows)
    const buyerFollowupsToInsert = (followups || []).map((fu) => {
      const scheduleDateTime =
        fu.scheduled_date ??
        fu.scheduledDate ??
        fu.scheduled_at ??
        fu.scheduledAt ??
        null;
      const completedDate =
        fu.completed_date ?? fu.completedDate ?? fu.completed_at ?? null;

      return {
        buyer_id: createdBuyerId,
        lead_id: fu.lead_id ?? lead.id ?? null,
        followup_id: fu.id ?? null,
        followup_type: fu.type ?? fu.followup_type ?? "other",
        buyer_lead_stage: fu.stage ?? null,
        buyer_lead_status: fu.status ?? null,
        remark: fu.remark ?? null,
        custom_remark: fu.custom_remark ?? fu.customRemark ?? null,
        next_action: fu.next_action ?? fu.nextAction ?? null,
        completed_date: toSqlDateTime(completedDate) ?? null,
        schedule_date: toSqlDate(scheduleDateTime) ?? null,
        schedule_time: toSqlTime(scheduleDateTime) ?? null,
        priority: fu.priority ?? "Medium",
        created_by:
          asIntOrNull(fu.created_by) ?? asIntOrNull(createdBy) ?? null,
        updated_by:
          asIntOrNull(fu.updated_by) ?? asIntOrNull(createdBy) ?? null,
        created_at: toSqlDateTime(fu.created_at) ?? nowSql,
        updated_at: toSqlDateTime(fu.updated_at) ?? nowSql,
        transferred_from_lead: 1, // mark that this followup row came from a lead transfer
        transferred_at: nowSql,
        transferred_by: asIntOrNull(createdBy) ?? null,
        transfer_type: "lead_transfer",
      };
    });

    if (buyerFollowupsToInsert.length > 0) {
      // Build multi-row insert
      const columns = Object.keys(buyerFollowupsToInsert[0]);
      const valuePlaceholders = buyerFollowupsToInsert
        .map(() => `(${columns.map(() => "?").join(", ")})`)
        .join(", ");
      const values = [];
      buyerFollowupsToInsert.forEach((row) => {
        columns.forEach((c) => values.push(row[c]));
      });
      const insertFollowupsSql = `INSERT INTO buyer_followups (${columns.join(
        ", "
      )}) VALUES ${valuePlaceholders}`;
      await conn.query(insertFollowupsSql, values);
    }

    // 7) mark lead as transferred AND hide it from lists (soft-hide)
    const leadUpdateSql = `
      UPDATE client_leads
      SET
        status = ?,
        stage = ?,
        updated_at = ?,
        updated_by = ?,
        transferred_to_buyer = 1,
        transferred_to_buyer_at = ?,
        transferred_to_buyer_by = ?,
        is_listed = 0
      WHERE id = ?
    `;
    const leadStatus = overrides.status ?? lead.status ?? null;
    const leadStage = overrides.stage ?? lead.stage ?? null;
    const updatedByForLead =
      asIntOrNull(createdBy ?? overrides.updated_by ?? lead.updated_by) ?? null;
    const nowForSql = toSqlDateTime(new Date().toISOString());
    await conn.query(leadUpdateSql, [
      leadStatus,
      leadStage,
      nowForSql,
      updatedByForLead,
      nowForSql,
      asIntOrNull(createdBy) ?? null,
      leadId,
    ]);

    // 8) mark original followups as transferred / not-listed (keep history)
    if (followups && followups.length > 0) {
      const followupUpdateSql = `
        UPDATE followups
        SET transferred_to_buyer = 1, is_listed = 0, updated_at = ?, updated_by = ?
        WHERE lead_id = ?
      `;
      await conn.query(followupUpdateSql, [
        nowForSql,
        asIntOrNull(createdBy) ?? null,
        leadId,
      ]);
    }

    // commit & release
    await conn.commit();
    conn.release();

    return res.status(201).json({
      success: true,
      message: "Lead transferred to buyer and hidden from lead lists.",
      buyer: createdBuyer,
      transferred_followups_count: buyerFollowupsToInsert.length,
      requirements: requirements,
    });
  } catch (err) {
    console.error("transferToBuyer error:", err);
    try {
      if (conn) {
        await conn.rollback();
        conn.release();
      }
    } catch (rbErr) {
      console.error("Rollback error:", rbErr);
    }
    return res
      .status(500)
      .json({
        error: "Transfer failed",
        details: (err && err.message) || String(err),
      });
  }
}

module.exports = {
  transferToBuyer,
};
