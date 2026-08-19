const pool = require("../config/database");
const Owner = require("../models/OwnerModel");

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
    countryCode: b.countryCode || "+91",
    assigned_to: toIntOrNull(assignedRaw),
    assigned_to_name: emptyToNull(assignedName),
    source: emptyToNull(b.source),
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
       (salutation, name, phone, whatsapp, email, state, city, location, stage, leadType, priority, status, notes, owner_dob, countryCode, assigned_to, assigned_to_name, source)
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
    const [ownerRows] = await pool.query(ownerSql, [id]);
    if (!ownerRows.length) {
      return res.status(404).json({ success: false, message: "Owner not found" });
    }
    const ownerRow = ownerRows[0];
    const owner = {
      ...ownerRow,
      created_by_user: pickUser(ownerRow, "created_by"),
      updated_by_user: pickUser(ownerRow, "updated_by"),
      assigned_to_user: pickUser(ownerRow, "assigned_to"),
    };

    const [activities] = await pool.query(
      `SELECT * FROM owner_activities WHERE owner_id = ? ORDER BY id DESC`,
      [id]
    );

    const [followups] = await pool.query(
      `SELECT * FROM owner_followups WHERE owner_id = ? ORDER BY followup_date DESC, id DESC`,
      [id]
    );

    const [properties] = await pool.query(
      `SELECT * FROM rental_properties WHERE owner_id = ? ORDER BY id DESC`,
      [id]
    );

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

    // Reset linked rental properties for this owner
    await conn.query(
      `UPDATE rental_properties SET owner_id = NULL, owner_name = NULL, assigned_to = NULL WHERE owner_id = ?`,
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
           SET owner_id = ?, owner_name = ?, assigned_to = ?
           WHERE id IN (${propertyIds.map(() => "?").join(",")})`,
          [id, owner.name, owner.assigned_to, ...propertyIds]
        );
      }
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
};
