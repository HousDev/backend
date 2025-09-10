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
const getSellers = async (_req, res) => {
  try {
    // 1) Fetch all sellers first
    const [sellers] = await pool.query(`SELECT * FROM sellers ORDER BY id DESC`);

    if (!sellers.length) {
      return res.json({ success: true, data: [] });
    }

    // 2) Fetch all related tables in parallel
    const [cosellers, activities, followups, documents, properties, metrics] = await Promise.all([
      pool.query(`SELECT * FROM seller_cosellers ORDER BY id DESC`),
      pool.query(`SELECT * FROM seller_activities ORDER BY activity_date DESC, created_at DESC, id DESC`),
      pool.query(`SELECT * FROM seller_followups ORDER BY followup_date DESC, id DESC`),
      pool.query(`SELECT * FROM seller_documents ORDER BY id DESC`),
      pool.query(`SELECT * FROM my_properties ORDER BY id DESC`),
      pool.query(`
        SELECT s.id AS seller_id,
          (SELECT COUNT(*) FROM seller_activities sa WHERE sa.seller_id = s.id) AS activities_count,
          (SELECT COUNT(*) FROM seller_followups sf WHERE sf.seller_id = s.id) AS followups_count,
          (SELECT COUNT(*) FROM seller_documents sd WHERE sd.seller_id = s.id) AS documents_count,
          (SELECT MAX(sa.activity_date) FROM seller_activities sa WHERE sa.seller_id = s.id) AS last_activity_date
        FROM sellers s
      `)
    ]);

    // unwrap from pool.query return format
    const cosellerRows = cosellers[0];
    const activityRows = activities[0];
    const followupRows = followups[0];
    const documentRows = documents[0];
    const propertyRows = properties[0];
    const metricsRows = metrics[0];

    // 3) Attach related data to each seller
    const sellerData = sellers.map(seller => {
      return {
        ...seller,
        cosellers: cosellerRows.filter(c => c.seller_id === seller.id),
        activities: activityRows.filter(a => a.seller_id === seller.id),
        followups: followupRows.filter(f => f.seller_id === seller.id),
        documents: documentRows.filter(d => d.seller_id === seller.id),
        properties: propertyRows.filter(p => p.seller_id === seller.id),
        metrics: metricsRows.find(m => m.seller_id === seller.id) || {}
      };
    });

    return res.json({ success: true, data: sellerData });
  } catch (err) {
    console.error("Get Sellers error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch sellers" });
  }
};




// get seller byu id
const getSellerById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid seller id" });

    // 1) Seller
    const [sellerRows] = await pool.query(
      `SELECT *
       FROM sellers
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    if (!sellerRows.length) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }
    const seller = sellerRows[0];

    // 2) Co-sellers
    const [cosellers] = await pool.query(
      `SELECT id, salutation, name, phone, whatsapp, email, relation, dob
       FROM seller_cosellers
       WHERE seller_id = ?
       ORDER BY id DESC`,
      [id]
    );

    // 3) Activities
    const [activities] = await pool.query(
      `SELECT id, activity_type, description, activity_date, activity_time, stage,
              duration, outcome, next_action, executed_by, remarks, created_at
       FROM seller_activities
       WHERE seller_id = ?
       ORDER BY activity_date DESC, created_at DESC, id DESC`,
      [id]
    );

    // 4) Followups
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

    // 7) Small metrics (optional but useful)
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
        metrics
      }
    });
  } catch (err) {
    console.error("Get Seller by ID (full) error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch seller" });
  }
};

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


module.exports = {
  createSeller,
  getSellers,
  getSellerById,
  updateSeller,
  deleteSeller,
  getPropertiesBySellerId,
  getPropertiesByAssignedTo
};
