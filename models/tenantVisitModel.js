const db = require("../config/database");

const formatTimeToMysqlTime = (timeStr) => {
  if (!timeStr) return "11:00:00";
  const s = String(timeStr).trim();

  // 1. Direct 24h format HH:MM:SS or HH:MM
  if (/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s)) {
    return s.length === 5 ? `${s}:00` : s;
  }

  // 2. Contains AM/PM with time e.g. "02:00 PM", "Afternoon (02:00 PM - 05:00 PM)", "2:30pm", "11:00 AM"
  const matchAmPm = s.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)/i);
  if (matchAmPm) {
    let hours = parseInt(matchAmPm[1], 10);
    const minutes = matchAmPm[2] || '00';
    const ampm = matchAmPm[3].toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}:00`;
  }

  // 3. Named periods e.g. "Afternoon", "Evening", "Morning", "2 to 5"
  const lower = s.toLowerCase();
  if (lower.includes('afternoon') || lower.includes('2 to 5') || lower.includes('2-5') || lower.includes('2 - 5')) {
    return "14:00:00";
  }
  if (lower.includes('evening') || lower.includes('5 to 8') || lower.includes('5-8')) {
    return "17:00:00";
  }
  if (lower.includes('morning') || lower.includes('10 to 1') || lower.includes('10-1')) {
    return "10:00:00";
  }
  if (lower.includes('weekend') || lower.includes('11 to 6')) {
    return "11:00:00";
  }

  // 4. Fallback single digit like "2" (assume PM if <= 6)
  const digitMatch = s.match(/\b(\d{1,2})\b/);
  if (digitMatch) {
    let hours = parseInt(digitMatch[1], 10);
    if (hours >= 1 && hours <= 6) hours += 12;
    return `${String(hours).padStart(2, '0')}:00:00`;
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
        status: data.status || 'Pending Owner Approval',
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

      return res ? (res.insertId || (Array.isArray(res) && res[0] && res[0].insertId)) : null;
    } catch (err) {
      console.error("Error creating tenant visit:", err);
      throw err;
    }
  },

  async getByTenantId(tenantId) {
    try {
      const sql = `
        SELECT tv.*,
               rp.society_name,
               rp.location_name,
               rp.city_name,
               rp.monthly_rent,
               o.name AS owner_name,
               o.phone AS owner_phone,
               o.whatsapp AS owner_whatsapp
        FROM tenant_visits tv
        LEFT JOIN rental_properties rp ON tv.rental_property_id = rp.id
        LEFT JOIN owners o ON (tv.owner_id = o.id OR rp.owner_id = o.id)
        WHERE tv.tenant_id = ?
           OR tv.tenant_id IN (
                SELECT t.id FROM tenants t
                LEFT JOIN users u ON (BINARY u.email = BINARY t.email)
                WHERE t.id = ? OR u.id = ? OR t.tenant_id = ? OR t.email = ?
           )
           OR tv.tenant_id IN (
                SELECT u.id FROM users u
                LEFT JOIN tenants t ON (BINARY u.email = BINARY t.email)
                WHERE u.id = ? OR t.id = ?
           )
        ORDER BY tv.id DESC
      `;
      const [rows] = await db.query(sql, [tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId]);
      return rows || [];
    } catch (err) {
      console.error("Error fetching tenant visits by tenantId:", err);
      return [];
    }
  },

  async update(id, data) {
    try {
      let existingCols = new Set([
        'tenant_id', 'property_title', 'visit_date', 'visit_time', 
        'meeting_point', 'status', 'remarks', 'rental_property_id',
        'owner_id', 'executive_id', 'feedback', 'rating', 'accompanied_by',
        'outcome', 'missed_reason', 'cancellation_reason', 'updated_at'
      ]);

      try {
        const [cols] = await db.query("SHOW COLUMNS FROM tenant_visits");
        if (cols && cols.length > 0) {
          existingCols = new Set(cols.map(c => c.Field.toLowerCase()));
        }
      } catch (err) {}

      const setClauses = [];
      const values = [];

      for (const [key, val] of Object.entries(data)) {
        const colLower = key.toLowerCase();
        if (existingCols.has(colLower) && key !== 'id' && key !== 'created_at') {
          setClauses.push(`\`${key}\` = ?`);
          if (colLower === 'visit_time' && val) {
            values.push(formatTimeToMysqlTime(val));
          } else {
            values.push(val);
          }
        }
      }

      if (existingCols.has('updated_at')) {
        setClauses.push("`updated_at` = NOW()");
      }

      if (setClauses.length === 0) return 0;

      values.push(id);
      const sql = `UPDATE tenant_visits SET ${setClauses.join(', ')} WHERE id = ?`;
      const [res] = await db.query(sql, values);
      return res ? res.affectedRows : 0;
    } catch (err) {
      console.error("Error updating tenant visit:", err);
      throw err;
    }
  },

  async delete(id) {
    try {
      const sql = `DELETE FROM tenant_visits WHERE id = ?`;
      const [res] = await db.query(sql, [id]);
      return res ? res.affectedRows : 0;
    } catch (err) {
      console.error("Error deleting tenant visit:", err);
      throw err;
    }
  },

  async bulkDelete(ids = []) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      const placeholders = ids.map(() => '?').join(',');
      const sql = `DELETE FROM tenant_visits WHERE id IN (${placeholders})`;
      const [res] = await db.query(sql, ids);
      return res ? res.affectedRows : 0;
    } catch (err) {
      console.error("Error bulk deleting tenant visits:", err);
      throw err;
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
