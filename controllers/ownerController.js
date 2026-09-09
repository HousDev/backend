const pool = require("../config/database");
const Owner = require("../models/OwnerModel");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

// helpers
const toIntOrNull = (v) => {
  if (v === undefined || v === null) return null;
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

// normalize owner
const normalizeOwner = (b = {}) => {
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
    owner_dob: toDateOrNull(b.owner_dob ?? b.dob ?? null),
    assigned_to: toIntOrNull(assignedRaw),
    assigned_to_name: emptyToNull(assignedName),
    source: emptyToNull(b.source),
    preferred_visit_slots: b.preferred_visit_slots ? (typeof b.preferred_visit_slots === 'string' ? b.preferred_visit_slots : JSON.stringify(b.preferred_visit_slots)) : (b.preferred_slots ? (typeof b.preferred_slots === 'string' ? b.preferred_slots : JSON.stringify(b.preferred_slots)) : null),
  };
};

const createOwner = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const body = req.body || {};
    const owner = normalizeOwner(body);
    const selectedProps = body.properties || [];

    if (!owner.name) {
      conn.release();
      return res.status(400).json({ success: false, message: "Name is required." });
    }

    await conn.beginTransaction();

    const [rs] = await conn.query(
      `INSERT INTO owners 
       (salutation, name, phone, whatsapp, email, state, city, location, stage, lead_type, priority, status, notes, owner_dob, countryCode, assigned_to, assigned_to_name, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        owner.salutation, owner.name, owner.phone, owner.whatsapp, owner.email,
        owner.state, owner.city, owner.location, owner.stage, owner.leadType,
        owner.priority, owner.status, owner.notes, owner.owner_dob,
        owner.countryCode, owner.assigned_to, owner.assigned_to_name, owner.source
      ]
    );
    const ownerId = rs.insertId;

    // Link rental properties directly to owner by updating owner_id and owner_name in rental_properties
    if (selectedProps.length) {
      const ids = selectedProps
        .map((p) => Number(p?.id ?? p?.property_id ?? p?._id ?? p))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length) {
        await conn.query(
          `UPDATE rental_properties 
           SET owner_id = ?, owner_name = ?, assigned_to = ?
           WHERE id IN (${ids.map(() => "?").join(",")})`,
          [ownerId, owner.name, owner.assigned_to, ...ids]
        );
      }
    }

    await conn.commit();
    conn.release();

    if (owner.assigned_to) {
      try {
        const { sendAssignmentNotification } = require("../utils/notificationHelper");
        await sendAssignmentNotification({
          userId: owner.assigned_to,
          type: "owner_assign",
          itemId: ownerId,
          itemName: owner.name,
          message: `You have been assigned a new owner: ${owner.name}`,
          link: `/dashboard/owners`
        });
      } catch (err) {
        console.error("Notification trigger failed for owner creation:", err);
      }
    }

    return res.status(201).json({ success: true, id: ownerId });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error("Create Owner error:", err);
    return res.status(500).json({ success: false, message: "Failed to create owner" });
  }
};

const pickUser = (row, pfx) => ({
  id: row[`${pfx}_id`] ?? null,
  name: row[`${pfx}_name`] ?? null,
  email: row[`${pfx}_email`] ?? null,
  phone: row[`${pfx}_phone`] ?? null,
});

const getOwners = async (_req, res) => {
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
    const ownersSql = `
      SELECT
        o.*,
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

      FROM owners o
      LEFT JOIN users c ON o.created_by = c.id
      LEFT JOIN users u ON o.updated_by = u.id
      LEFT JOIN users a ON o.assigned_to = a.id
      ORDER BY o.id DESC
    `;
    const [owners] = await pool.query(ownersSql);
    if (!owners.length) return res.json({ success: true, data: [] });

    const [
      activityRows,
      followupRows,
      rentalPropertyRows,
    ] = await Promise.all([
      getTableRows("owner_activities", null, "created_at DESC, id DESC"),
      getTableRows("owner_followups", null, "followup_date DESC, id DESC"),
      getTableRows("rental_properties", null, "id DESC"),
    ]);

    const byOwner = (rows, fk = "owner_id") =>
      (rows || []).reduce((acc, r) => {
        const k = r[fk];
        if (!acc[k]) acc[k] = [];
        acc[k].push(r);
        return acc;
      }, {});

    const actBy = byOwner(activityRows);
    const folBy = byOwner(followupRows);
    const propBy = byOwner(rentalPropertyRows);

    const metricsBy = {};
    for (const o of owners) {
      const oid = o.id;
      const acts = actBy[oid] || [];
      const foll = folBy[oid] || [];
      const lastActivity = acts.reduce((max, a) => {
        const d = a.created_at || null;
        if (!d) return max;
        const ts = new Date(d).getTime();
        return ts > max ? ts : max;
      }, 0);
      metricsBy[oid] = {
        owner_id: oid,
        activities_count: acts.length,
        followups_count: foll.length,
        last_activity_date: lastActivity ? new Date(lastActivity) : null,
      };
    }

    const data = owners.map((o) => ({
      ...o,
      created_by_user: pickUser(o, "created_by"),
      updated_by_user: pickUser(o, "updated_by"),
      assigned_to_user: pickUser(o, "assigned_to"),

      activities: actBy[o.id] || [],
      followups: folBy[o.id] || [],
      properties: propBy[o.id] || [],

      metrics: metricsBy[o.id] || {
        owner_id: o.id,
        activities_count: 0,
        followups_count: 0,
        last_activity_date: null,
      },
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("Get Owners error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch owners" });
  }
};

const getOwnerById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid owner id" });

    const ownerSql = `
      SELECT
        o.*,
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

      FROM owners o
      LEFT JOIN users c ON o.created_by = c.id
      LEFT JOIN users u ON o.updated_by = u.id
      LEFT JOIN users a ON o.assigned_to = a.id
      WHERE o.id = ?
      LIMIT 1
    `;
    let [ownerRows] = await pool.query(ownerSql, [id]);

    // If not found by direct owner ID, check if this ID is a user id with role='owner' or matches user email
    if (!ownerRows.length) {
      const [uRows] = await pool.query("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
      if (uRows.length) {
        const uEmail = (uRows[0].email || "").toLowerCase().trim();
        const uPhone = uRows[0].phone ? uRows[0].phone.trim() : null;
        [ownerRows] = await pool.query(`
          SELECT
            o.*,
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
          FROM owners o
          LEFT JOIN users c ON o.created_by = c.id
          LEFT JOIN users u ON o.updated_by = u.id
          LEFT JOIN users a ON o.assigned_to = a.id
          WHERE (LOWER(TRIM(o.email)) = ? AND ? != '') OR (o.phone IS NOT NULL AND o.phone = ?)
          ORDER BY o.id DESC
          LIMIT 1
        `, [uEmail, uEmail, uPhone]);
      }
    }

    if (!ownerRows.length) {
      return res.status(404).json({ success: false, message: "Owner not found" });
    }
    const ownerRow = ownerRows[0];
    const actualOwnerId = ownerRow.id;
    const owner = {
      ...ownerRow,
      created_by_user: pickUser(ownerRow, "created_by"),
      updated_by_user: pickUser(ownerRow, "updated_by"),
      assigned_to_user: pickUser(ownerRow, "assigned_to"),
    };

    const [activities] = await pool.query(
      `SELECT * FROM owner_activities WHERE owner_id = ? ORDER BY id DESC`,
      [actualOwnerId]
    );

    const [followups] = await pool.query(
      `SELECT * FROM owner_followups WHERE owner_id = ? ORDER BY followup_date DESC, id DESC`,
      [actualOwnerId]
    );

    const [properties] = await pool.query(
      `SELECT * FROM rental_properties 
       WHERE owner_id = ? 
          OR (owner_name IS NOT NULL AND LOWER(TRIM(owner_name)) = LOWER(TRIM(?)))
       ORDER BY id DESC`,
      [actualOwnerId, ownerRow.name || '']
    );

    const propIds = properties.map((p) => p.id).filter(Boolean);
    const propMap = new Map();
    properties.forEach((p) => propMap.set(p.id, p));
    const ownerName = ownerRow.name || '';

    let tenantVisits = [];
    let tenantInquiries = [];

    try {
      const propPlaceholders = propIds.length > 0 ? propIds.map(() => "?").join(",") : "0";
      const visitParams = propIds.length > 0 
        ? [actualOwnerId, ...propIds]
        : [actualOwnerId];

      const [vRows] = await pool.query(
        `SELECT tv.*, 
                t.name AS tenant_name, 
                t.phone AS tenant_phone, 
                t.email AS tenant_email, 
                t.tenant_type,
                t.preferred_bhk
         FROM tenant_visits tv
         LEFT JOIN tenants t ON tv.tenant_id = t.id
         WHERE tv.owner_id = ? 
            ${propIds.length > 0 ? `OR tv.rental_property_id IN (${propPlaceholders})` : ''}
         ORDER BY tv.visit_date DESC, tv.id DESC`,
        visitParams
      );
      tenantVisits = (vRows || []).map((v) => {
        const linkedProp = v.rental_property_id ? propMap.get(v.rental_property_id) : null;
        return {
          ...v,
          rental_property_title: linkedProp ? `${linkedProp.unit_type || 'Rental'} in ${linkedProp.society_name || 'Society'}` : (v.property_title || 'Rental Property'),
          rental_property_society: linkedProp?.society_name || v.property_title || '',
        };
      });
    } catch (errVisits) {
      console.warn("Could not query tenant visits for owner properties:", errVisits.message);
    }

    try {
      const [allActivities] = await pool.query(
        `SELECT ta.*, 
                t.name AS tenant_name, 
                t.phone AS tenant_phone, 
                t.email AS tenant_email, 
                t.tenant_type, 
                t.preferred_bhk, 
                t.move_in_date, 
                t.status AS tenant_status
         FROM tenant_activities ta
         JOIN tenants t ON ta.tenant_id = t.id
         ORDER BY ta.created_at DESC, ta.id DESC`
      );

      const [allTenants] = await pool.query(
        `SELECT id AS tenant_id, name AS tenant_name, phone AS tenant_phone, email AS tenant_email,
                tenant_type, preferred_bhk, move_in_date, status AS tenant_status, rental_property_id, notes, created_at,
                enquired_properties, shortlisted_properties
         FROM tenants
         ORDER BY id DESC`
      );

      const inquiriesMap = new Map();

      // 1. Match from tenant enquired_properties and shortlisted_properties
      for (const t of (allTenants || [])) {
        let enqList = [];
        if (t.enquired_properties) {
          try {
            enqList = typeof t.enquired_properties === 'string' ? JSON.parse(t.enquired_properties) : t.enquired_properties;
          } catch (e) {
            enqList = [];
          }
        }
        if (Array.isArray(enqList)) {
          for (const enq of enqList) {
            const enqPropId = Number(enq.id || enq.rental_property_id || enq.property_id);
            const matchedProp = properties.find((p) => Number(p.id) === enqPropId);
            if (matchedProp) {
              const key = `${t.tenant_id}_${matchedProp.id}`;
              inquiriesMap.set(key, {
                tenant_id: t.tenant_id,
                tenant_name: t.tenant_name,
                tenant_phone: t.tenant_phone,
                tenant_email: t.tenant_email,
                tenant_type: t.tenant_type || 'Family',
                preferred_bhk: t.preferred_bhk || matchedProp.unit_type || '2 BHK',
                move_in_date: t.move_in_date || enq.move_in_date || 'Immediately',
                tenant_status: t.tenant_status,
                rental_property_id: matchedProp.id,
                created_at: enq.enquired_at || t.created_at,
                notes: enq.notes || `Direct enquiry for ${matchedProp.unit_type || 'rental'} in ${matchedProp.society_name || 'Society'}`,
                lead_type: 'Direct Enquiry',
                rental_property_title: `${matchedProp.unit_type || '2 BHK'} in ${matchedProp.society_name || 'Society'}`,
                society_name: matchedProp.society_name,
              });
            }
          }
        }

        // Check shortlisted_properties
        let shortList = [];
        if (t.shortlisted_properties) {
          try {
            shortList = typeof t.shortlisted_properties === 'string' ? JSON.parse(t.shortlisted_properties) : t.shortlisted_properties;
          } catch (e) {
            shortList = [];
          }
        }
        if (Array.isArray(shortList)) {
          for (const s of shortList) {
            const sPropId = Number(s.id || s.rental_property_id || s);
            const matchedProp = properties.find((p) => Number(p.id) === sPropId);
            if (matchedProp) {
              const key = `${t.tenant_id}_${matchedProp.id}`;
              if (!inquiriesMap.has(key)) {
                inquiriesMap.set(key, {
                  tenant_id: t.tenant_id,
                  tenant_name: t.tenant_name,
                  tenant_phone: t.tenant_phone,
                  tenant_email: t.tenant_email,
                  tenant_type: t.tenant_type || 'Family',
                  preferred_bhk: t.preferred_bhk || matchedProp.unit_type || '2 BHK',
                  move_in_date: t.move_in_date || 'Immediately',
                  tenant_status: t.tenant_status,
                  rental_property_id: matchedProp.id,
                  created_at: s.shortlisted_at || t.created_at,
                  notes: `Shortlisted rental property ${matchedProp.unit_type || ''} in ${matchedProp.society_name || ''}`,
                  lead_type: 'Shortlisted Lead',
                  rental_property_title: `${matchedProp.unit_type || '2 BHK'} in ${matchedProp.society_name || 'Society'}`,
                  society_name: matchedProp.society_name,
                });
              }
            }
          }
        }
      }

      // 2. Match from tenant activities
      for (const act of (allActivities || [])) {
        const actNotes = act.notes || '';
        for (const prop of properties) {
          const rentCode = `RENT-${prop.id}`;
          const socName = (prop.society_name || '').toLowerCase().trim();
          const matchesCode = actNotes.includes(rentCode);
          const matchesSoc = socName.length > 2 && actNotes.toLowerCase().includes(socName);

          if (matchesCode || matchesSoc) {
            const key = `${act.tenant_id}_${prop.id}`;
            if (!inquiriesMap.has(key)) {
              inquiriesMap.set(key, {
                tenant_id: act.tenant_id,
                tenant_name: act.tenant_name,
                tenant_phone: act.tenant_phone,
                tenant_email: act.tenant_email,
                tenant_type: act.tenant_type || 'Family',
                preferred_bhk: act.preferred_bhk || prop.unit_type || '2 BHK',
                move_in_date: act.move_in_date || 'Immediately',
                tenant_status: act.tenant_status,
                rental_property_id: prop.id,
                created_at: act.created_at,
                notes: act.notes,
                lead_type: 'Contact Activity',
                rental_property_title: `${prop.unit_type || '2 BHK'} in ${prop.society_name || 'Society'}`,
                society_name: prop.society_name,
              });
            }
          }
        }
      }

      // 3. Match directly linked tenants or notes
      for (const t of (allTenants || [])) {
        const tNotes = t.notes || '';
        for (const prop of properties) {
          const rentCode = `RENT-${prop.id}`;
          const socName = (prop.society_name || '').toLowerCase().trim();
          const matchesId = Number(t.rental_property_id) === Number(prop.id);
          const matchesCode = tNotes.includes(rentCode);
          const matchesSoc = socName.length > 2 && tNotes.toLowerCase().includes(socName);

          if (matchesId || matchesCode || matchesSoc) {
            const key = `${t.tenant_id}_${prop.id}`;
            if (!inquiriesMap.has(key)) {
              inquiriesMap.set(key, {
                tenant_id: t.tenant_id,
                tenant_name: t.tenant_name,
                tenant_phone: t.tenant_phone,
                tenant_email: t.tenant_email,
                tenant_type: t.tenant_type || 'Family',
                preferred_bhk: t.preferred_bhk || prop.unit_type || '2 BHK',
                move_in_date: t.move_in_date || 'Immediately',
                tenant_status: t.tenant_status,
                rental_property_id: prop.id,
                created_at: t.created_at,
                notes: t.notes,
                lead_type: 'Direct Lead',
                rental_property_title: `${prop.unit_type || '2 BHK'} in ${prop.society_name || 'Society'}`,
                society_name: prop.society_name,
              });
            }
          }
        }
      }

      // 4. Match from tenant visits for this owner's properties
      for (const v of (tenantVisits || [])) {
        const vPropId = Number(v.rental_property_id);
        const matchedProp = properties.find((p) => Number(p.id) === vPropId);
        if (matchedProp && v.tenant_id) {
          const key = `${v.tenant_id}_${matchedProp.id}`;
          if (!inquiriesMap.has(key)) {
            inquiriesMap.set(key, {
              tenant_id: v.tenant_id,
              tenant_name: v.tenant_name,
              tenant_phone: v.tenant_phone,
              tenant_email: v.tenant_email,
              tenant_type: v.tenant_type || 'Family',
              preferred_bhk: v.preferred_bhk || matchedProp.unit_type || '2 BHK',
              move_in_date: 'Immediately',
              tenant_status: v.status || 'Active',
              rental_property_id: matchedProp.id,
              created_at: v.created_at || v.visit_date,
              notes: `Site visit scheduled for ${v.visit_date ? new Date(v.visit_date).toLocaleDateString('en-IN') : ''} at ${v.visit_time || ''}`,
              lead_type: 'Site Visit Lead',
              rental_property_title: `${matchedProp.unit_type || '2 BHK'} in ${matchedProp.society_name || 'Society'}`,
              society_name: matchedProp.society_name,
            });
          }
        }
      }

      tenantInquiries = Array.from(inquiriesMap.values());
    } catch (errInq) {
      console.warn("Could not query tenant inquiries for owner properties:", errInq.message);
    }

    const [[metrics]] = await pool.query(
      `SELECT
          (SELECT COUNT(*) FROM owner_activities WHERE owner_id = ?) AS activities_count,
          (SELECT COUNT(*) FROM owner_followups  WHERE owner_id = ?) AS followups_count,
          (SELECT MAX(created_at) FROM owner_activities WHERE owner_id = ?) AS last_activity_date
       `,
      [id, id, id]
    );

    return res.json({
      success: true,
      data: {
        owner,
        activities,
        followups,
        properties,
        tenant_visits: tenantVisits,
        tenant_inquiries: tenantInquiries,
        metrics,
      },
    });
  } catch (err) {
    console.error("Get Owner by ID error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch owner" });
  }
};

const updateOwner = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      conn.release();
      return res.status(400).json({ success: false, message: 'Invalid owner id.' });
    }

    const body = req.body || {};
    const owner = normalizeOwner(body);
    const selectedProps = body.properties || body.property_ids || [];

    if (!owner.name) {
      conn.release();
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }

    owner.assigned_to = owner.assigned_to ? Number(owner.assigned_to) : null;

    await conn.beginTransaction();

    const affected = await Owner.update(id, owner, conn);
    if (!affected) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ success: false, message: 'Owner not found' });
    }

    // Update linked rental properties only if properties or property_ids was explicitly passed in body
    if (body.properties !== undefined || body.property_ids !== undefined) {
      // Reset linked rental properties for this owner
      await conn.query(
        `UPDATE rental_properties SET owner_id = NULL, owner_name = NULL WHERE owner_id = ?`,
        [id]
      );

      // Assign selected rental properties
      if (selectedProps.length > 0) {
        const propertyIds = selectedProps
          .map(p => Number(p?.id ?? p?.property_id ?? p?._id ?? p))
          .filter(n => Number.isFinite(n) && n > 0);

        if (propertyIds.length > 0) {
          await conn.query(
            `UPDATE rental_properties 
             SET owner_id = ?, owner_name = ?
             WHERE id IN (${propertyIds.map(() => "?").join(",")})`,
            [id, owner.name, ...propertyIds]
          );
        }
      }
    } else {
      // Keep owner name in sync on all currently linked rental properties
      await conn.query(
        `UPDATE rental_properties SET owner_name = ? WHERE owner_id = ?`,
        [owner.name, id]
      );
    }

    await conn.commit();
    const fresh = await Owner.getByIdWithRentalProperties(id, conn);
    conn.release();

    if (owner.assigned_to && fresh) {
      try {
        const { sendAssignmentNotification } = require("../utils/notificationHelper");
        await sendAssignmentNotification({
          userId: owner.assigned_to,
          type: "owner_assign",
          itemId: id,
          itemName: fresh.name,
          message: `You have been assigned a new owner: ${fresh.name}`,
          link: `/dashboard/owners`
        });
      } catch (err) {
        console.error("Notification trigger failed for owner update:", err);
      }
    }

    return res.json({ success: true, data: fresh });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error("Update Owner error:", err);
    return res.status(500).json({ success: false, message: "Failed to update owner" });
  }
};

const deleteOwner = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid owner id" });

    // Reset linked properties
    await pool.query(`UPDATE rental_properties SET owner_id = NULL, owner_name = NULL, assigned_to = NULL WHERE owner_id = ?`, [id]);

    const affected = await Owner.delete(id);
    return res.json({ success: true, affected });
  } catch (err) {
    console.error("Delete Owner error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete owner" });
  }
};

const bulkAssignExecutive = async (req, res) => {
  try {
    const { ownerIds, executiveId, onlyEmpty } = req.body;
    const result = await Owner.bulkAssignSameExecutive(ownerIds, executiveId, onlyEmpty);
    return res.json(result);
  } catch (err) {
    console.error("Bulk assign executive error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updateLeadField = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { field, value } = req.body;
    const result = await Owner.updateLeadField(id, field, value);
    return res.json(result);
  } catch (err) {
    console.error("Update lead field error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const bulkUpdateLeadField = async (req, res) => {
  try {
    const { ownerIds, field, value, onlyEmpty } = req.body;
    const result = await Owner.bulkUpdateLeadField(ownerIds, field, value, onlyEmpty);
    return res.json(result);
  } catch (err) {
    console.error("Bulk update lead field error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const bulkImport = async (req, res) => {
  try {
    const { items } = req.body;
    const result = await Owner.bulkImport(items, { created_by: req.user?.id });
    return res.json(result);
  } catch (err) {
    console.error("Bulk import owners error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const bulkHardDeleteOwners = async (req, res) => {
  try {
    const { ids } = req.body;
    const result = await Owner.bulkHardDeleteOwners(ids);
    return res.json(result);
  } catch (err) {
    console.error("Bulk hard delete owners error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getOrCreateOwnerCredentials = async (req, res) => {
  try {
    const ownerId = req.params.id;
    const [owners] = await pool.query("SELECT * FROM owners WHERE id = ? LIMIT 1", [ownerId]);
    if (!owners || owners.length === 0) {
      return res.status(404).json({ success: false, message: "Owner record not found" });
    }
    const owner = owners[0];

    const safeName = (owner.name || "Owner").trim();
    const safeEmail = (owner.email || "").trim();
    const safePhone = (owner.phone || "").trim();

    if (!safeEmail && !safePhone) {
      return res.status(400).json({
        success: false,
        message: "Owner has neither an email nor phone number. Please edit owner profile to add at least an email or mobile number.",
      });
    }

    const normalizedEmail = safeEmail ? safeEmail.toLowerCase() : `owner_${owner.id}@resaleexpert.in`;
    const defaultPassword = "Owner@" + (safePhone ? safePhone.slice(-4) : String(owner.id).padStart(4, '0'));

    // Check if user exists in `users` table
    const [users] = await pool.query(
      `SELECT * FROM users WHERE BINARY email = BINARY ? OR (BINARY role = 'owner' AND BINARY phone = BINARY ?) LIMIT 1`,
      [normalizedEmail, safePhone || '___none___']
    );

    let user = users && users.length > 0 ? users[0] : null;
    let isNew = false;

    if (!user) {
      isNew = true;
      const nameParts = safeName.split(/\s+/);
      const firstName = nameParts[0] || "Owner";
      const lastName = nameParts.slice(1).join("") || "";
      let baseUsername = "";
      if (lastName) {
        baseUsername = `${firstName.charAt(0).toLowerCase()}${lastName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      } else {
        baseUsername = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");
      }
      if (!baseUsername || baseUsername.length < 2) baseUsername = `owner_${owner.id}`;

      let username = baseUsername;
      try {
        const [existingU] = await pool.query("SELECT id FROM users WHERE username = ? LIMIT 1", [username]);
        if (existingU && existingU.length > 0) {
          username = `${baseUsername}${Math.floor(10 + Math.random() * 90)}`;
        }
      } catch (e) {}

      const hashedPassword = bcrypt.hashSync(defaultPassword, 8);
      const [uRes] = await pool.query(
        `INSERT INTO users (salutation, username, first_name, last_name, email, password, phone, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'owner', 1, NOW(), NOW())`,
        [owner.salutation || 'Mr.', username, firstName, nameParts.slice(1).join(" ") || "", normalizedEmail, hashedPassword, safePhone || null]
      );
      user = {
        id: uRes.insertId,
        username,
        email: normalizedEmail,
        first_name: firstName,
        last_name: nameParts.slice(1).join(" ") || "",
        phone: safePhone,
        role: 'owner',
      };
    }

    return res.json({
      success: true,
      data: {
        owner_id: owner.id,
        owner_name: owner.name,
        user_id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone || owner.phone,
        role: user.role || 'owner',
        defaultPassword: isNew ? defaultPassword : "Owner@" + (safePhone ? safePhone.slice(-4) : "123"),
        isNew,
      }
    });
  } catch (err) {
    console.error("Error generating owner credentials:", err);
    return res.status(500).json({ success: false, message: "Failed to generate owner credentials: " + err.message });
  }
};

const updateOwnerPassword = async (req, res) => {
  try {
    const ownerId = req.params.id;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const [owners] = await pool.query("SELECT * FROM owners WHERE id = ? LIMIT 1", [ownerId]);
    if (!owners || owners.length === 0) {
      return res.status(404).json({ success: false, message: "Owner record not found." });
    }
    const owner = owners[0];
    const normalizedEmail = (owner.email || `owner_${owner.id}@resaleexpert.in`).toLowerCase().trim();

    const hashedPassword = bcrypt.hashSync(newPassword, 8);

    // Update in users table
    const [uRes] = await pool.query(
      `UPDATE users SET password = ?, updated_at = NOW() 
       WHERE BINARY email = BINARY ? OR (BINARY role = 'owner' AND BINARY phone = BINARY ?)`,
      [hashedPassword, normalizedEmail, owner.phone || '___none___']
    );

    if (uRes.affectedRows === 0) {
      // Create user if didn't exist
      const nameParts = (owner.name || "Owner").trim().split(/\s+/);
      const firstName = nameParts[0] || "Owner";
      const username = `owner_${owner.id}`;
      await pool.query(
        `INSERT INTO users (salutation, username, first_name, last_name, email, password, phone, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'owner', 1, NOW(), NOW())`,
        [owner.salutation || 'Mr.', username, firstName, nameParts.slice(1).join(" ") || "", normalizedEmail, hashedPassword, owner.phone || null]
      );
    }

    return res.json({ success: true, message: "Owner password updated successfully" });
  } catch (err) {
    console.error("Error updating owner password:", err);
    return res.status(500).json({ success: false, message: "Failed to update password: " + err.message });
  }
};

module.exports = {
  createOwner,
  getOwners,
  getOwnerById,
  updateOwner,
  deleteOwner,
  bulkAssignExecutive,
  updateLeadField,
  bulkUpdateLeadField,
  bulkImport,
  bulkHardDeleteOwners,
  getOrCreateOwnerCredentials,
  updateOwnerPassword,
};
