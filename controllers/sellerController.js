// controllers/sellerController.js
const pool = require("../config/database");
const Seller = require("../models/SellerModel");

// helpers
const toIntOrNull = (v) => {
  if (v === undefined || v === null) return null;
  // handle strings: "", " ", "null", "undefined"
  const s = String(v).trim().toLowerCase();
  if (s === "" || s === "null" || s === "undefined") return null;
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
};

const toDateOrNull = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
};
const emptyToNull = (v) => (v === "" ? null : v);

// normalize seller
const normalizeSeller = (b = {}) => {
  const assignedRaw =
    b.assigned_to ?? b.assignedTo ?? b.assignedExecutiveId ?? b.assignedUserId;

  const assignedName =
    b.assigned_to_name ?? b.assignedToName ?? b.assignedExecutiveName ?? b.assignedUserName;

  return {
    salutation: b.salutation ?? "Mr.",
    name: (b.name ?? "").trim() || null,
    phone: emptyToNull(b.phone),
    whatsapp: emptyToNull(b.whatsapp),
    email: emptyToNull(b.email),
    state: emptyToNull(b.state),
    city: emptyToNull(b.city),
    location: emptyToNull(b.location),
    stage: emptyToNull(b.stage),
    leadType: emptyToNull(b.leadType),
    priority: emptyToNull(b.priority),
    status: emptyToNull(b.status),
    notes: emptyToNull(b.notes),
    seller_dob: toDateOrNull(b.seller_dob),
    countryCode: b.countryCode || "+91",
    assigned_to: toIntOrNull(assignedRaw),
    assigned_to_name: emptyToNull(assignedName),
    source: emptyToNull(b.source),
  };
};


// normalize cosellers
const normalizeCoSellers = (arr = []) =>
  (Array.isArray(arr) ? arr : []).map((c) => ({
    salutation: c.coSeller_salutation ?? "Mr.",
    name: (c.coSeller_name ?? "").trim(),
    phone: emptyToNull(c.coSeller_phone),
    whatsapp: emptyToNull(c.coSeller_whatsapp),
    email: emptyToNull(c.coSeller_email),
    dob: toDateOrNull(c.coSeller_dob),
    relation: emptyToNull(c.coSeller_relation),
  })).filter((x) => x.name);

// ---------- CREATE Seller ----------

const createSeller = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const body = req.body || {};
    const seller = normalizeSeller(body);
    const coSellers = normalizeCoSellers(body.coSellers || []);
    const selectedProps = body.properties || []; // array of {id: propertyId}

    if (!seller.name) {
      conn.release();
      return res.status(400).json({ success: false, message: "Name is required." });
    }

    await conn.beginTransaction();

    // 1) Insert seller  ✅ added "source" column + bound value
    const [rs] = await conn.query(
      `INSERT INTO sellers 
       (salutation, name, phone, whatsapp, email, state, city, location, stage, leadType, priority, status, notes, seller_dob, countryCode, assigned_to, assigned_to_name, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        seller.salutation, seller.name, seller.phone, seller.whatsapp, seller.email,
        seller.state, seller.city, seller.location, seller.stage, seller.leadType,
        seller.priority, seller.status, seller.notes, seller.seller_dob,
        seller.countryCode, seller.assigned_to, seller.assigned_to_name, seller.source
      ]
    );
    const sellerId = rs.insertId;

    // 2) Insert co-sellers (unchanged)
    if (coSellers.length) {
      const values = coSellers.map((c) => [
        sellerId, c.salutation, c.name, c.phone, c.whatsapp, c.email, c.dob, c.relation
      ]);
      const placeholders = new Array(coSellers.length).fill("(?,?,?,?,?,?,?,?)").join(",");
      await conn.query(
        `INSERT INTO seller_cosellers (seller_id, salutation, name, phone, whatsapp, email, dob, relation)
         VALUES ${placeholders}`,
        values.flat()
      );
    }

    // 3) Assign existing properties to seller & agent (unchanged)
    if (selectedProps.length) {
      const ids = selectedProps.map((p) => p.id);
      await conn.query(
        `UPDATE my_properties 
         SET seller_id = ?, seller_name = ?, assigned_to = ?
         WHERE id IN (${ids.map(() => "?").join(",")})`,
        [sellerId, seller.name, seller.assigned_to, ...ids]
      );
    }

    await conn.commit();
    conn.release();
    return res.status(201).json({ success: true, id: sellerId });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error("Create Seller TX error:", err);
    return res.status(500).json({ success: false, message: "Failed to create seller" });
  }
};

module.exports = { createSeller };

// ---------- READ/UPDATE/DELETE ----------

// Utility: build user object from row aliases
const pickUser = (row, pfx) => ({
  id: row[`${pfx}_id`] ?? null,
  name: row[`${pfx}_name`] ?? null,
  email: row[`${pfx}_email`] ?? null,
  phone: row[`${pfx}_phone`] ?? null,
});

const getSellers = async (_req, res) => {
  const tryQuery = async (sql, params = []) => {
    try {
      const [rows] = await pool.query(sql, params);
      return rows;
    } catch (e) {
      if (e && e.code === "ER_NO_SUCH_TABLE") return null;
      throw e;
    }
  };

  const getTableRows = async (primary, fallback, orderBy = "id DESC") => {
    const primaryRows = await tryQuery(`SELECT * FROM \`${primary}\` ORDER BY ${orderBy}`);
    if (primaryRows !== null) return primaryRows;
    if (!fallback) return [];
    const fallbackRows = await tryQuery(`SELECT * FROM \`${fallback}\` ORDER BY ${orderBy}`);
    return fallbackRows ?? [];
  };

  try {
    // 1) Sellers + user joins
    const sellersSql = `
      SELECT
        s.*,

        c.id   AS created_by_id,
        CONCAT_WS(' ', c.salutation, c.first_name, c.last_name) AS created_by_name,
        c.email AS created_by_email,
        c.phone AS created_by_phone,

        u.id   AS updated_by_id,
        CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS updated_by_name,
        u.email AS updated_by_email,
        u.phone AS updated_by_phone,

        a.id   AS assigned_to_id,
        CONCAT_WS(' ', a.salutation, a.first_name, a.last_name) AS assigned_to_name,
        a.email AS assigned_to_email,
        a.phone AS assigned_to_phone

      FROM sellers s
      LEFT JOIN users c ON s.created_by = c.id
      LEFT JOIN users u ON s.updated_by = u.id
      LEFT JOIN users a ON s.assigned_to = a.id
      ORDER BY s.id DESC
    `;
    const [sellers] = await pool.query(sellersSql);
    if (!sellers.length) return res.json({ success: true, data: [] });

    // 2) Side tables (support legacy fallback names too)
    const [
      cosellerRows,
      activityRows,
      followupRows,
      documentRows,
      propertyRows,
    ] = await Promise.all([
      getTableRows("seller_cosellers", "cosellers", "id DESC"),
      getTableRows("seller_activities", "activities", "activity_date DESC, created_at DESC, id DESC"),
      getTableRows("seller_followups", "followups", "followup_date DESC, id DESC"),
      getTableRows("seller_documents", "documents", "id DESC"),
      getTableRows("my_properties", null, "id DESC"),
    ]);

    // 3) Bucket by seller_id
    const bySeller = (rows) =>
      rows.reduce((acc, r) => {
        const k = r.seller_id;
        if (!acc[k]) acc[k] = [];
        acc[k].push(r);
        return acc;
      }, {});

    const cosBy = bySeller(cosellerRows);
    const actBy = bySeller(activityRows);
    const folBy = bySeller(followupRows);
    const docBy = bySeller(documentRows);
    const propBy = bySeller(propertyRows);

    // 4) Quick metrics
    const metricsBy = {};
    for (const s of sellers) {
      const sid = s.id;
      const acts = actBy[sid] || [];
      const foll = folBy[sid] || [];
      const docs = docBy[sid] || [];
      const lastActivity = acts.reduce((max, a) => {
        const d = a.activity_date || a.created_at || a.updated_at || null;
        if (!d) return max;
        const ts = new Date(d).getTime();
        return ts > max ? ts : max;
      }, 0);
      metricsBy[sid] = {
        seller_id: sid,
        activities_count: acts.length,
        followups_count: foll.length,
        documents_count: docs.length,
        last_activity_date: lastActivity ? new Date(lastActivity) : null,
      };
    }

    // 5) Shape response (attach user objects)
    const data = sellers.map((s) => ({
      ...s,
      created_by_user: pickUser(s, "created_by"),
      updated_by_user: pickUser(s, "updated_by"),
      assigned_to_user: pickUser(s, "assigned_to"),

      cosellers: cosBy[s.id] || [],
      activities: actBy[s.id] || [],
      followups: folBy[s.id] || [],
      documents: docBy[s.id] || [],
      properties: propBy[s.id] || [],

      metrics: metricsBy[s.id] || {
        seller_id: s.id,
        activities_count: 0,
        followups_count: 0,
        documents_count: 0,
        last_activity_date: null,
      },
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("Get Sellers error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch sellers" });
  }
};

module.exports = { getSellers };



// get seller byu id
// get seller by id (full)
const getSellerById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid seller id" });

    // 1) Seller with joined users
    const sellerSql = `
      SELECT
        s.*,

        c.id   AS created_by_id,
        CONCAT_WS(' ', c.salutation, c.first_name, c.last_name) AS created_by_name,
        c.email AS created_by_email,
        c.phone AS created_by_phone,

        u.id   AS updated_by_id,
        CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS updated_by_name,
        u.email AS updated_by_email,
        u.phone AS updated_by_phone,

        a.id   AS assigned_to_id,
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
    const [sellerRows] = await pool.query(sellerSql, [id]);
    if (!sellerRows.length) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }
    const sellerRow = sellerRows[0];
    const seller = {
      ...sellerRow,
      created_by_user: {
        id: sellerRow.created_by_id,
        name: sellerRow.created_by_name,
        email: sellerRow.created_by_email,
        phone: sellerRow.created_by_phone,
      },
      updated_by_user: {
        id: sellerRow.updated_by_id,
        name: sellerRow.updated_by_name,
        email: sellerRow.updated_by_email,
        phone: sellerRow.updated_by_phone,
      },
      assigned_to_user: {
        id: sellerRow.assigned_to_id,
        name: sellerRow.assigned_to_name,
        email: sellerRow.assigned_to_email,
        phone: sellerRow.assigned_to_phone,
      },
    };

    // 2) Co-sellers
    const [cosellers] = await pool.query(
      `SELECT id, salutation, name, phone, whatsapp, email, relation, dob
       FROM seller_cosellers
       WHERE seller_id = ?
       ORDER BY id DESC`,
      [id]
    );

    // 3) Activities (kept as-is; you can also join executed_by -> users if needed)
    const [activities] = await pool.query(
      `SELECT id, activity_type, description, activity_date, activity_time, stage,
              duration, outcome, next_action, executed_by, remarks, created_at
       FROM seller_activities
       WHERE seller_id = ?
       ORDER BY activity_date DESC, created_at DESC, id DESC`,
      [id]
    );

    // 4) Followups (kept as-is; can join assigned_to -> users if needed)
    const [followups] = await pool.query(
      `SELECT id, followup_date, followup_type, followup_time, status, priority,
              assigned_to, reminder, notes
       FROM seller_followups
       WHERE seller_id = ?
       ORDER BY followup_date DESC, id DESC`,
      [id]
    );

    // 5) Documents
    const [documents] = await pool.query(
      `SELECT id, doc_type, doc_path, status, doc_date, category
       FROM seller_documents
       WHERE seller_id = ?
       ORDER BY id DESC`,
      [id]
    );

    // 6) Properties owned by this seller
    const [properties] = await pool.query(
      `SELECT mp.*
       FROM my_properties mp
       WHERE mp.seller_id = ?
       ORDER BY mp.id DESC`,
      [id]
    );

    // 7) Metrics
    const [[metrics]] = await pool.query(
      `SELECT
          (SELECT COUNT(*) FROM seller_activities WHERE seller_id = ?) AS activities_count,
          (SELECT COUNT(*) FROM seller_followups  WHERE seller_id = ?) AS followups_count,
          (SELECT COUNT(*) FROM seller_documents  WHERE seller_id = ?) AS documents_count,
          (SELECT MAX(activity_date) FROM seller_activities WHERE seller_id = ?) AS last_activity_date
       `,
      [id, id, id, id]
    );

    return res.json({
      success: true,
      data: {
        seller,
        cosellers,
        activities,
        followups,
        documents,
        properties,
        metrics,
      },
    });
  } catch (err) {
    console.error("Get Seller by ID (full) error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch seller" });
  }
};

module.exports = { getSellers, getSellerById };


// ---- date helpers ----
const pad2 = (n) => String(n).padStart(2, '0');
const toDateOnly = (v) => {
  if (!v) return null;
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    // Return YYYY-MM-DD (local date; change to UTC if you prefer)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  } catch {
    return null;
  }
};

const normalizeIncoming = (body = {}) => {
  const cosellersRaw =
    body.cosellers ?? body.seller_cosellers ?? body.coSellersPayload ?? body.coSellers ?? [];

  const deleteIdsRaw =
    body.coseller_delete_ids ?? body.co_seller_delete_ids ?? body.coSellersDeleteIds ?? [];

  const cosellers = Array.isArray(cosellersRaw)
    ? cosellersRaw.map((c) => ({
        id: c.id ? Number(c.id) : null,
        salutation: (c.salutation ?? c.coSeller_salutation ?? 'Mr.').trim(),
        name: String(c.name ?? c.coSeller_name ?? '').trim(),
        phone: String(c.phone ?? c.coSeller_phone ?? '').replace(/\D/g, ''),
        whatsapp: String(c.whatsapp ?? c.coSeller_whatsapp ?? '').replace(/\D/g, ''),
        email: String(c.email ?? c.coSeller_email ?? '').trim(),
        relation: String(c.relation ?? c.coSeller_relation ?? '').trim(),
        // 👇 normalize to YYYY-MM-DD for DATE column
        dob: toDateOnly(c.dob ?? c.coSeller_dob ?? null),
      }))
    : [];

  const deleteIds = Array.isArray(deleteIdsRaw)
    ? deleteIdsRaw.map((x) => Number(x)).filter(Number.isFinite)
    : [];

  const seller = {
    salutation: body.salutation ?? null,
    name: body.name ?? null,
    phone: (body.phone ?? '').toString().replace(/\D/g, ''),
    whatsapp: (body.whatsapp ?? '').toString().replace(/\D/g, ''),
    email: body.email ?? null,
    state: body.state ?? null,
    city: body.city ?? null,
    location: body.location ?? null,
    stage: body.stage ?? null,
    leadType: body.leadType ?? null,
    priority: body.priority ?? null,
    status: body.status ?? null,
    notes: body.notes ?? null,
    // 👇 normalize to YYYY-MM-DD for DATE column
    seller_dob: toDateOnly(body.seller_dob ?? body.dob ?? null),
    countryCode: body.countryCode ?? null,
    assigned_to: body.assigned_to ?? null,
    assigned_to_name: body.assigned_to_name ?? null,
    lead_score: body.lead_score ?? null,
    deal_value: body.deal_value ?? null,
    expected_close: toDateOnly(body.expected_close ?? null), // if DATE; keep as-is if DATETIME
    source: body.source ?? null,
    visits: body.visits ?? 0,
    total_visits: body.total_visits ?? 0,
    // 👇 normalize if DATE column; if DATETIME, adjust accordingly
    last_activity: toDateOnly(body.lastActivity ?? body.last_activity ?? null),
    notifications: body.notifications ?? 0,
    current_stage: body.current_stage ?? body.stage ?? null,
    stage_progress: body.stage_progress ?? 0,
    deal_potential: body.deal_potential ?? null,
    response_rate: body.response_rate ?? 0,
    avg_response_time: body.avg_response_time ?? null,
  };

  return { seller, cosellers, deleteIds };
};


const updateSeller = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      conn.release();
      return res.status(400).json({ success: false, message: 'Invalid seller id.' });
    }

    let { seller, cosellers, deleteIds } = normalizeIncoming(req.body);
    const selectedProps = req.body.properties || [];

    // Validate required fields
    if (!seller.name || String(seller.name).trim() === '') {
      conn.release();
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }

    // ✅ Ensure assigned_to is either number or null
    seller.assigned_to = seller.assigned_to ? Number(seller.assigned_to) : null;

    // ✅ Convert seller_dob to string if it's a Date
    if (seller.seller_dob instanceof Date) {
      seller.seller_dob = seller.seller_dob.toISOString().split('T')[0];
    }

    // ✅ Convert co-seller DOBs and ensure IDs are numbers
    cosellers = (cosellers || []).map(cs => ({
      ...cs,
      id: cs.id ? Number(cs.id) : null,
      seller_id: cs.seller_id ? Number(cs.seller_id) : id,
      dob: cs.dob instanceof Date ? cs.dob.toISOString().split('T')[0] : cs.dob || null,
    }));

    await conn.beginTransaction();

    // 1) Update main seller and co-sellers
    const affected = await Seller.updateWithCoSellers(id, seller, cosellers, deleteIds);
    if (!affected) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    // 2) Handle property assignments
    // Reset all properties for this seller
    await conn.query(
      `UPDATE my_properties SET seller_id = NULL, seller_name = NULL, assigned_to = NULL WHERE seller_id = ?`,
      [id]
    );

    // Assign selected properties
    if (selectedProps.length > 0) {
      const propertyIds = selectedProps.map(p => Number(p.id)).filter(Boolean);
      if (propertyIds.length > 0) {
        await conn.query(
          `UPDATE my_properties 
           SET seller_id = ?, seller_name = ?, assigned_to = ?
           WHERE id IN (${propertyIds.map(() => "?").join(",")})`,
          [id, seller.name, seller.assigned_to, ...propertyIds]
        );
      }
    }

    await conn.commit();

    // Return fresh data
    const fresh = await Seller.getByIdWithCoSellers(id);
    conn.release();

    return res.json({
      success: true,
      message: 'Seller updated successfully',
      data: fresh,
    });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('Update Seller error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update seller' });
  }
};


const deleteSeller = async (req, res) => {
  try {
    const affected = await Seller.delete(req.params.id);
    if (!affected) return res.status(404).json({ success: false, message: "Seller not found" });
    res.json({ success: true, message: "Seller deleted successfully" });
  } catch (err) {
    console.error("Delete Seller error:", err);
    res.status(500).json({ success: false, message: "Failed to delete seller" });
  }
};
// Get all properties by seller_id
const getPropertiesBySellerId = async (req, res) => {
  try {
    const sellerId = Number(req.params.sellerId);
    if (!sellerId) {
      return res.status(400).json({ success: false, message: "sellerId is required" });
    }

    // Only join with sellers table
    const [rows] = await pool.query(
      `SELECT mp.*, s.name AS seller_name
       FROM my_properties mp
       LEFT JOIN sellers s ON mp.seller_id = s.id
       WHERE mp.seller_id = ?
       ORDER BY mp.id DESC`,
      [sellerId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("getPropertiesBySellerId error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch properties" });
  }
};

// Get all properties by assigned_to (executive/DO id)
const getPropertiesByAssignedTo = async (req, res) => {
  try {
    const assignedToId = Number(req.params.userId);
    if (!assignedToId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    // Only join with sellers table
    const [rows] = await pool.query(
      `SELECT mp.*, s.name AS seller_name
       FROM my_properties mp
       LEFT JOIN sellers s ON mp.seller_id = s.id
       WHERE mp.assigned_to = ?
       ORDER BY mp.id DESC`,
      [assignedToId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("getPropertiesByAssignedTo error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch properties" });
  }
};

const bulkImport = async (req, res) => {
  try {
    const body = req.body;
    let sellers = [];

    // Handle all possible payload shapes
    if (Array.isArray(body)) {
      sellers = body; // raw array
    } else if (Array.isArray(body?.sellers)) {
      sellers = body.sellers;
    } else if (Array.isArray(body?.data)) {
      sellers = body.data;
    }

    const created_by = body?.created_by || req.user?.id || null;

    if (!sellers.length) {
      return res.status(400).json({
        success: false,
        message: "No sellers found in request body.",
      });
    }

    const result = await Seller.bulkImport(sellers, { created_by });
    res.json(result);

  } catch (e) {
    console.error("Bulk import error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
};
// Route Handlers - These are mostly correct, but add validation:

const bulkAssignExecutive = async (req, res) => {
  try {
    const { sellerIds = [], executiveId = null, onlyEmpty = false } = req.body || {};
    
    // Additional validation
    if (executiveId !== null && typeof executiveId !== 'string' && typeof executiveId !== 'number') {
      return res.status(400).json({ success: false, error: "Invalid executiveId" });
    }
    
    const result = await Seller.bulkAssignSameExecutive(sellerIds, executiveId, !!onlyEmpty);
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
};

const updateLeadField = async (req, res) => {
  try {
    const { id } = req.params;
    const { field, value } = req.body || {};
    
    if (!id) {
      return res.status(400).json({ success: false, error: "Seller ID is required" });
    }
    
    const result = await Seller.updateLeadField(id, field, value);
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
};

const bulkUpdateLeadField = async (req, res) => {
  try {
    const { sellerIds = [], field, value, onlyEmpty = false } = req.body || {};
    
    if (!field || value === undefined) {
      return res.status(400).json({ success: false, error: "Field and value are required" });
    }
    
    const result = await Seller.bulkUpdateLeadField(sellerIds, field, value, !!onlyEmpty);
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
};

const bulkHardDeleteSellers = async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: "ids array is required" });
    }

    const result = await Seller.bulkHardDelete(ids);

    if (!result.success) {
      const status = result.code === 1451 ? 409 : 400;
      return res.status(status).json(result);
    }

    return res.json({
      success: true,
      hardDeleted: result.deleted,
      ids: result.ids || [],
    });
  } catch (err) {
    console.error("bulkHardDeleteSellers error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal error" });
  }
};
module.exports = {
  createSeller,
  getSellers,
  getSellerById,
  updateSeller,
  deleteSeller,
  getPropertiesBySellerId,
  bulkAssignExecutive,
  updateLeadField,
  getPropertiesByAssignedTo,

  bulkUpdateLeadField,

  bulkImport,
  bulkHardDeleteSellers
};


