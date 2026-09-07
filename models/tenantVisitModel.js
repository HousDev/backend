const db = require("../config/database");

const formatTimeToMysqlTime = (timeStr) => {
  if (!timeStr) return "11:00:00";
  const s = String(timeStr).trim();
  // If already in HH:MM:SS or HH:MM 24h
  if (/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s)) {
    return s.length === 5 ? `${s}:00` : s;
  }
  // Check AM/PM format e.g. "11:00 AM", "03:30 PM", "11:00am", "11 AM"
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM|am|pm)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2] || '00';
    const seconds = match[3] || '00';
    const ampm = (match[4] || '').toUpperCase();

    if (ampm === 'PM' && hours < 12) {
      hours += 12;
    } else if (ampm === 'AM' && hours === 12) {
      hours = 0;
    }
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${minutes}:${seconds}`;
  }
  return "11:00:00";
};

const tenantVisitModel = {
  async create(data) {
    try {
      // 1. Resolve tenant_id if user_id was passed
      let safeTenantId = data.tenant_id || data.tenantId || null;
      if (safeTenantId) {
        try {
          const [tRows] = await db.query(
            `SELECT t.id FROM tenants t
             LEFT JOIN users u ON (BINARY u.email = BINARY t.email)
             WHERE t.id = ? OR u.id = ? LIMIT 1`,
            [safeTenantId, safeTenantId]
          );
          if (tRows && tRows.length > 0) {
            safeTenantId = tRows[0].id;
          }
        } catch (e) {
          console.warn("Could not resolve tenantId:", e.message);
        }
      }

      // 2. Discover table columns dynamically to prevent column mismatch error
      let existingCols = new Set([
        'tenant_id', 'property_title', 'visit_date', 'visit_time', 
        'meeting_point', 'status', 'remarks', 'rental_property_id',
        'owner_id', 'executive_id', 'created_at', 'updated_at'
      ]);

      try {
        const [cols] = await db.query("SHOW COLUMNS FROM tenant_visits");
        if (cols && cols.length > 0) {
          existingCols = new Set(cols.map(c => c.Field.toLowerCase()));
        }
      } catch (err) {
        console.warn("SHOW COLUMNS on tenant_visits note:", err.message);
      }

      const safeTime = formatTimeToMysqlTime(data.visit_time || data.visitTime);

      // Auto-resolve owner_id from rental_properties if missing
      let resolvedOwnerId = data.owner_id || data.ownerId || null;
      if (!resolvedOwnerId && (data.rental_property_id || data.rentalPropertyId)) {
        try {
          const rpid = data.rental_property_id || data.rentalPropertyId;
          const [rpOwner] = await db.query(
            "SELECT owner_id FROM rental_properties WHERE id = ? LIMIT 1",
            [rpid]
          );
          if (rpOwner && rpOwner.length > 0 && rpOwner[0].owner_id) {
            resolvedOwnerId = rpOwner[0].owner_id;
          }
        } catch (e) {
          console.warn("Could not lookup owner_id for visit:", e.message);
        }
      }

      // Candidate values
      const candidateFields = {
        tenant_id: safeTenantId,
        property_title: data.property_title || data.propertyTitle || 'Property Site Visit',
        visit_date: data.visit_date || data.visitDate || null,
        visit_time: safeTime,
        meeting_point: data.meeting_point || data.meetPoint || 'Property Location',
        status: data.status || 'Scheduled',
        remarks: data.remarks || data.remark || '',
        rental_property_id: data.rental_property_id || data.rentalPropertyId || null,
        owner_id: resolvedOwnerId,
        executive_id: data.executive_id || data.executiveId || null,
        visit_type: data.visit_type || data.visitType || 'site_visit',
        duration_minutes: data.duration_minutes || data.durationMinutes || 60,
        feedback: data.feedback || null,
        rating: data.rating || null,
        accompanied_by: data.accompanied_by || data.accompaniedBy || null,
        outcome: data.outcome || null,
      };

      const insertCols = [];
      const insertPlaceholders = [];
      const insertValues = [];

      for (const [colName, colVal] of Object.entries(candidateFields)) {
        if (existingCols.has(colName.toLowerCase())) {
          insertCols.push(colName);
          insertPlaceholders.push('?');
          insertValues.push(colVal);
        }
      }

      if (existingCols.has('created_at')) {
        insertCols.push('created_at');
        insertPlaceholders.push('NOW()');
      }
      if (existingCols.has('updated_at')) {
        insertCols.push('updated_at');
        insertPlaceholders.push('NOW()');
      }

      const sql = `INSERT INTO tenant_visits (${insertCols.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`;
      const [res] = await db.query(sql, insertValues);

      // Also log to tenant_activities if tenant exists
      if (safeTenantId) {
        try {
          const tenantActivityModel = require("./tenantActivityModel");
          await tenantActivityModel.create({
            tenant_id: safeTenantId,
            activity_type: "Visit Scheduled",
            notes: `Site visit booked for ${candidateFields.property_title} on ${candidateFields.visit_date} at ${candidateFields.visit_time}`,
          });
        } catch (actErr) {
          console.warn("Could not log visit in tenant_activities:", actErr.message);
        }
      }

      return res ? res.insertId : null;
    } catch (err) {
      console.error("Error creating tenant visit:", err);
      throw err;
    }
  },

  async getByTenantId(tenantId) {
    try {
      const sql = `SELECT * FROM tenant_visits WHERE tenant_id = ? ORDER BY id DESC`;
      const [rows] = await db.query(sql, [tenantId]);
      return rows || [];
    } catch (err) {
      console.error("Error fetching tenant visits by tenantId:", err);
      return [];
    }
  },

  async getAll() {
    try {
      const sql = `SELECT * FROM tenant_visits ORDER BY id DESC LIMIT 100`;
      const [rows] = await db.query(sql);
      return rows || [];
    } catch (err) {
      console.error("Error fetching all tenant visits:", err);
      return [];
    }
  }
};

module.exports = tenantVisitModel;
