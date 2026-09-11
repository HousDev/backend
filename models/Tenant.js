const pool = require("../config/database");

// helpers
const pad = (n) => String(n).padStart(2, "0");
const formatDateTime = (d) => {
  if (!d) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const normalizeToMysqlDatetime = (val) => {
  if (!val && val !== 0) return null;
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val)) return val;
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return null;
  return formatDateTime(d);
};

const toDateOnly = (v) => {
  if (!v || v === 'null' || v === 'undefined' || String(v).trim() === '') return null;
  const str = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.split('T')[0];
  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(str)) {
    const parts = str.split(/[-/]/);
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const runQuery = async (connOrPool, sql, params = []) => {
  if (!connOrPool) connOrPool = pool;
  return connOrPool.query(sql, params);
};

const intOrNull = (v) => {
  if (v === null || v === undefined || String(v).trim() === "" || String(v).toLowerCase() === "null") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const Tenant = {
  async getAll(conn = null) {
    const sql = `
      SELECT 
        t.*,
        u_ten.username AS username,
        CONCAT_WS(' ', rp.property_type_name, rp.unit_type, rp.property_subtype_name, 'at', rp.society_name) AS property_title,
        rp.owner_id,
        o.name AS owner_name,
        o.phone AS owner_phone,
        o.email AS owner_email,
        o.whatsapp AS owner_whatsapp,
        CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS assigned_to_name,
        u.email AS assigned_to_email,
        u.phone AS assigned_to_phone
      FROM tenants t
        LEFT JOIN users u_ten ON (BINARY u_ten.email = BINARY t.email AND u_ten.role = 'tenant')
        LEFT JOIN rental_properties rp ON t.rental_property_id = rp.id
        LEFT JOIN owners o ON rp.owner_id = o.id
        LEFT JOIN users u ON t.assigned_to = u.id
      ORDER BY t.id DESC
    `;
    const [rows] = await runQuery(conn, sql);
    return rows;
  },

  async getById(id, conn = null) {
    const sql = `
      SELECT 
        t.*,
        u_ten.username AS username,
        CONCAT_WS(' ', rp.property_type_name, rp.unit_type, rp.property_subtype_name, 'at', rp.society_name) AS property_title,
        rp.owner_id,
        o.name AS owner_name,
        o.phone AS owner_phone,
        o.email AS owner_email,
        o.whatsapp AS owner_whatsapp,
        CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS assigned_to_name,
        u.email AS assigned_to_email,
        u.phone AS assigned_to_phone
      FROM tenants t
        LEFT JOIN users u_ten ON (BINARY u_ten.email = BINARY t.email AND u_ten.role = 'tenant')
        LEFT JOIN rental_properties rp ON t.rental_property_id = rp.id
        LEFT JOIN owners o ON rp.owner_id = o.id
        LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = ?
      LIMIT 1
    `;
    const [rows] = await runQuery(conn, sql, [id]);
    return rows[0] || null;
  },

  async create(data, conn = null) {
    // Generate Tenant ID (e.g. TEN0001)
    const [maxIdRow] = await runQuery(conn, "SELECT MAX(id) as max_id FROM tenants");
    const nextId = (maxIdRow[0]?.max_id || 0) + 1;
    const tenant_id = `TEN${String(nextId).padStart(4, '0')}`;

    const payload = {
      tenant_id,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      whatsapp: data.whatsapp || null,
      profile_photo: data.profile_photo || null,
      preferred_location: data.preferred_location || null,
      preferred_locations_coords: data.preferred_locations_coords ? (typeof data.preferred_locations_coords === 'string' ? data.preferred_locations_coords : JSON.stringify(data.preferred_locations_coords)) : null,
      budget_min: data.budget_min || null,
      budget_max: data.budget_max || null,
      preferred_bhk: data.preferred_bhk || null,
      tenant_type: data.tenant_type || null,
      move_in_date: toDateOnly(data.move_in_date),
      current_address: data.current_address || null,
      notes: data.notes || null,
      status: data.status || 'Active Search',
      rental_property_id: intOrNull(data.rental_property_id || data.rentalPropertyId),
      assigned_to: intOrNull(data.assigned_to),
      occupation_type: data.occupation_type || null,
      company_name: data.company_name || null,
      designation: data.designation || null,
      monthly_income: data.monthly_income ? Number(data.monthly_income) : null,
      office_location: data.office_location || null,
      food_preference: data.food_preference || null,
      has_pets: data.has_pets || null,
      smoking_habits: data.smoking_habits || null,
      marital_status: data.marital_status || null,
      family_members_count: data.family_members_count ? Number(data.family_members_count) : null,
      vehicle_type: data.vehicle_type || null,
      expected_stay_duration: data.expected_stay_duration || null,
      id_proof_type: data.id_proof_type || null,
      id_proof_number: data.id_proof_number || null,
      id_proof_document: data.id_proof_document || null,
      profile_completion_percentage: data.profile_completion_percentage ? Number(data.profile_completion_percentage) : 0,
      created_at: normalizeToMysqlDatetime(data.created_at ?? new Date()),
      updated_at: normalizeToMysqlDatetime(data.updated_at ?? new Date()),
    };

    const cols = Object.keys(payload).filter(k => payload[k] !== undefined);
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map(k => payload[k]);

    const sql = `INSERT INTO tenants (${cols.join(", ")}) VALUES (${placeholders})`;
    const [res] = await runQuery(conn, sql, values);

    const insertId = res && (res.insertId || (Array.isArray(res) && res[0] && res[0].insertId))
      ? (res.insertId || res[0].insertId)
      : null;

    if (insertId) {
      return this.getById(insertId, conn);
    }
    return null;
  },

  async update(id, data = {}, conn = null) {
    const sanitizedData = { ...data };
    if (sanitizedData.profile_image && !sanitizedData.profile_photo) {
      sanitizedData.profile_photo = sanitizedData.profile_image;
    }
    delete sanitizedData.profile_image;

    const fieldMappings = {
      name: (v) => v || null,
      email: (v) => v || null,
      phone: (v) => v || null,
      whatsapp: (v) => v || null,
      profile_photo: (v) => v || null,
      preferred_location: (v) => v || null,
      preferred_locations_coords: (v) => v ? (typeof v === 'string' ? v : JSON.stringify(v)) : null,
      budget_min: (v) => v || null,
      budget_max: (v) => v || null,
      preferred_bhk: (v) => v || null,
      tenant_type: (v) => v || null,
      move_in_date: (v) => toDateOnly(v),
      shortlisted_properties: (v) => v ? (typeof v === 'string' ? v : JSON.stringify(v)) : null,
      enquired_properties: (v) => v ? (typeof v === 'string' ? v : JSON.stringify(v)) : null,
      preferred_visit_time: (v) => v || null,
      current_address: (v) => v || null,
      notes: (v) => v || null,
      status: (v) => v || 'Active Search',
      rental_property_id: (v) => intOrNull(v),
      rentalPropertyId: (v) => intOrNull(v),
      assigned_to: (v) => intOrNull(v),
      occupation_type: (v) => v || null,
      company_name: (v) => v || null,
      designation: (v) => v || null,
      monthly_income: (v) => (v !== null && v !== undefined && v !== '') ? Number(v) : null,
      office_location: (v) => v || null,
      food_preference: (v) => v || null,
      has_pets: (v) => v || null,
      smoking_habits: (v) => v || null,
      marital_status: (v) => v || null,
      family_members_count: (v) => (v !== null && v !== undefined && v !== '') ? Number(v) : null,
      vehicle_type: (v) => v || null,
      expected_stay_duration: (v) => v || null,
      id_proof_type: (v) => v || null,
      id_proof_number: (v) => v || null,
      id_proof_document: (v) => v || null,
      profile_completion_percentage: (v) => (v !== null && v !== undefined && v !== '') ? Number(v) : null,
    };

    const fields = [];
    const params = [];

    Object.keys(sanitizedData).forEach((key) => {
      if (sanitizedData[key] !== undefined && fieldMappings[key]) {
        const dbCol = key === 'rentalPropertyId' ? 'rental_property_id' : key;
        fields.push(`${dbCol} = ?`);
        params.push(fieldMappings[key](sanitizedData[key]));
      }
    });

    if (fields.length === 0) return 0;

    fields.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);

    const sql = `UPDATE tenants SET ${fields.join(", ")} WHERE id = ?`;
    const [result] = await runQuery(conn, sql, params);
    return result ? result.affectedRows : 0;
  },

  /**
   * Dynamically calculate profile completion percentage & list missing fields
   */
  calculateProfileCompletion(tenant = {}) {
    if (!tenant) return { percent: 0, missingFields: [] };
    const checks = [
      { key: 'name', label: 'Full Name', weight: 10 },
      { key: 'phone', label: 'Phone Number', weight: 10 },
      { key: 'email', label: 'Email Address', weight: 10 },
      { key: 'tenant_type', label: 'Tenant Type (Family/Bachelor)', weight: 10 },
      { key: 'occupation_type', label: 'Occupation', weight: 10 },
      { key: 'monthly_income', label: 'Monthly Income', weight: 10 },
      { key: 'budget_max', label: 'Budget Range', weight: 10 },
      { key: 'preferred_bhk', label: 'Preferred BHK', weight: 10 },
      { key: 'preferred_location', label: 'Preferred Location', weight: 10 },
      { key: 'food_preference', label: 'Food Preference', weight: 5 },
      { key: 'move_in_date', label: 'Move-in Date', weight: 5 },
    ];

    let totalScore = 0;
    const missing = [];
    for (const c of checks) {
      const val = tenant[c.key];
      const isFilled = val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== '0';
      if (isFilled) {
        totalScore += c.weight;
      } else {
        missing.push({ field: c.key, label: c.label });
      }
    }
    return {
      percent: Math.min(100, Math.round(totalScore)),
      missingFields: missing,
      isComplete: totalScore >= 70,
    };
  },

  /**
   * Multi-dimensional match percentage formula (0-100%)
   */
  calculateMatchScore(tenant = {}, property = {}) {
    if (!tenant || !property) return 50;
    let score = 0;

    // 1. Rent vs Budget (25%)
    const rent = Number(property.expected_rent || property.monthly_rent || property.rent || property.price || 0);
    const budgetMin = Number(tenant.budget_min || 0);
    const budgetMax = Number(tenant.budget_max || 0);
    if (rent > 0 && budgetMax > 0) {
      if (rent <= budgetMax && (budgetMin === 0 || rent >= budgetMin * 0.8)) {
        score += 25;
      } else if (rent <= budgetMax * 1.15) {
        score += 15;
      } else {
        score += 5;
      }
    } else {
      score += 15; // default reasonable mid
    }

    // 2. Tenant Type (20%)
    const propPref = String(property.preferred_tenant || property.tenant_type || '').toLowerCase();
    const tenType = String(tenant.tenant_type || '').toLowerCase();
    if (!propPref || propPref.includes('any') || propPref.includes('all')) {
      score += 20;
    } else if (tenType && (propPref.includes(tenType) || tenType.includes(propPref))) {
      score += 20;
    } else if (tenType.includes('family') && propPref.includes('family')) {
      score += 20;
    } else if (tenType.includes('bachelor') && propPref.includes('bachelor')) {
      score += 20;
    } else {
      score += 5;
    }

    // 3. Location Match (15%)
    const propLoc = String(property.location_name || property.location || property.society_name || property.address || '').toLowerCase();
    const tenLoc = String(tenant.preferred_location || '').toLowerCase();
    if (propLoc && tenLoc) {
      const locParts = tenLoc.split(/[,;\s]+/).filter(Boolean);
      const isMatch = locParts.some(p => p.length > 2 && propLoc.includes(p));
      if (isMatch) score += 15;
      else score += 7;
    } else {
      score += 10;
    }

    // 4. BHK Match (15%)
    const propBhk = String(property.bhk || property.unit_type || property.property_subtype_name || '').toLowerCase();
    const tenBhk = String(tenant.preferred_bhk || '').toLowerCase();
    if (propBhk && tenBhk) {
      if (propBhk.includes(tenBhk) || tenBhk.includes(propBhk)) score += 15;
      else score += 5;
    } else {
      score += 10;
    }

    // 5. Move-in timeline (10%)
    if (tenant.move_in_date && property.available_from) {
      const dTen = new Date(tenant.move_in_date).getTime();
      const dProp = new Date(property.available_from).getTime();
      const diffDays = Math.abs(dTen - dProp) / (1000 * 3600 * 24);
      if (diffDays <= 30) score += 10;
      else if (diffDays <= 60) score += 6;
      else score += 3;
    } else {
      score += 8;
    }

    // 6. Food Preference (10%)
    const propFood = String(property.food_preference || property.restrictions || '').toLowerCase();
    const tenFood = String(tenant.food_preference || '').toLowerCase();
    if (propFood.includes('veg only') || propFood.includes('pure veg')) {
      if (tenFood.includes('veg only')) score += 10;
      else score += 3;
    } else {
      score += 10;
    }

    // 7. Pet policy (5%)
    const propPet = String(property.pet_friendly || property.pets_allowed || '').toLowerCase();
    const tenPet = String(tenant.has_pets || '').toLowerCase();
    if (tenPet === 'yes') {
      if (propPet === 'yes' || propPet === '1' || propPet === 'true' || propPet.includes('allowed')) score += 5;
      else score += 1;
    } else {
      score += 5;
    }

    return Math.min(99, Math.max(35, Math.round(score)));
  },

  // -------------------------------------------------------------
  // TENANT & OWNER INTEREST MANAGEMENT
  // -------------------------------------------------------------
  async createInterest(data, conn = null) {
    const { rental_property_id, tenant_id, owner_id, sender_type = 'tenant', message = '', match_score = 0 } = data;

    // Check existing active request
    const [existing] = await runQuery(
      conn,
      `SELECT * FROM tenant_owner_interests WHERE rental_property_id = ? AND tenant_id = ? AND status NOT IN ('CANCELLED', 'EXPIRED', 'OWNER_REJECTED', 'TENANT_DECLINED') LIMIT 1`,
      [rental_property_id, tenant_id]
    );

    if (existing && existing.length > 0) {
      return { success: false, isExisting: true, data: existing[0], message: "An active interest request already exists for this property." };
    }

    const sql = `
      INSERT INTO tenant_owner_interests (rental_property_id, tenant_id, owner_id, sender_type, status, match_score, message, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    const [res] = await runQuery(conn, sql, [rental_property_id, tenant_id, owner_id || null, sender_type, match_score || 0, message || null]);
    const insertId = res && (res.insertId || (Array.isArray(res) && res[0] && res[0].insertId));

    const [created] = await runQuery(conn, `SELECT * FROM tenant_owner_interests WHERE id = ?`, [insertId]);
    return { success: true, isExisting: false, data: created[0] || null };
  },

  async getInterestsForOwner(ownerId, conn = null) {
    const sql = `
      SELECT 
        toi.*,
        t.name AS tenant_name,
        t.email AS tenant_email,
        t.phone AS tenant_phone,
        t.whatsapp AS tenant_whatsapp,
        t.tenant_type,
        t.occupation_type,
        t.company_name,
        t.designation,
        t.monthly_income,
        t.office_location,
        t.food_preference,
        t.has_pets,
        t.smoking_habits,
        t.vehicle_type,
        t.expected_stay_duration,
        t.family_members_count,
        t.budget_min,
        t.budget_max,
        t.preferred_bhk,
        t.preferred_location,
        t.current_address,
        t.move_in_date,
        t.id_proof_type,
        t.id_proof_number,
        t.profile_completion_percentage,
        rp.property_type_name,
        rp.unit_type,
        rp.society_name,
        rp.location_name,
        rp.monthly_rent AS expected_rent,
        rp.monthly_rent,
        rp.owner_id
      FROM tenant_owner_interests toi
      JOIN tenants t ON toi.tenant_id = t.id
      JOIN rental_properties rp ON toi.rental_property_id = rp.id
      WHERE (toi.owner_id = ? OR rp.owner_id = ?)
      ORDER BY toi.id DESC
    `;
    const [rows] = await runQuery(conn, sql, [ownerId, ownerId]);
    return rows;
  },

  async getInterestsForTenant(tenantId, conn = null) {
    const sql = `
      SELECT 
        toi.*,
        rp.property_type_name,
        rp.property_subtype_name,
        rp.unit_type,
        rp.society_name,
        rp.location_name,
        rp.address,
        rp.monthly_rent AS expected_rent,
        rp.monthly_rent,
        rp.photos,
        o.name AS owner_name,
        o.phone AS owner_phone,
        o.email AS owner_email
      FROM tenant_owner_interests toi
      JOIN rental_properties rp ON toi.rental_property_id = rp.id
      LEFT JOIN owners o ON rp.owner_id = o.id
      WHERE toi.tenant_id = ?
      ORDER BY toi.id DESC
    `;
    const [rows] = await runQuery(conn, sql, [tenantId]);
    return rows;
  },

  /**
   * Owner confirms ONE candidate:
   * Sets chosen request to OWNER_CONFIRMED.
   * Automatically sets other active requests on same property to PROPERTY_SELECTED.
   */
  async confirmTenantForProperty(interestId, ownerId = null, conn = null) {
    const [rows] = await runQuery(conn, `SELECT * FROM tenant_owner_interests WHERE id = ? LIMIT 1`, [interestId]);
    if (!rows || rows.length === 0) return { success: false, message: "Interest request not found" };
    const current = rows[0];

    // 1. Confirm selected candidate
    await runQuery(
      conn,
      `UPDATE tenant_owner_interests SET status = 'OWNER_CONFIRMED', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [interestId]
    );

    // 2. Cascade other active requests for same property to PROPERTY_SELECTED
    await runQuery(
      conn,
      `UPDATE tenant_owner_interests 
       SET status = 'PROPERTY_SELECTED', updated_at = CURRENT_TIMESTAMP 
       WHERE rental_property_id = ? AND id != ? AND status IN ('PENDING')`,
      [current.rental_property_id, interestId]
    );

    const [updated] = await runQuery(conn, `SELECT * FROM tenant_owner_interests WHERE id = ?`, [interestId]);
    return { success: true, data: updated[0] };
  },

  /**
   * Owner rejects candidate
   */
  async rejectTenantForProperty(interestId, notes = '', conn = null) {
    await runQuery(
      conn,
      `UPDATE tenant_owner_interests SET status = 'OWNER_REJECTED', owner_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [notes || null, interestId]
    );
    const [updated] = await runQuery(conn, `SELECT * FROM tenant_owner_interests WHERE id = ?`, [interestId]);
    return { success: true, data: updated[0] };
  },

  /**
   * Tenant responds to OWNER_CONFIRMED:
   * - 'accept': status becomes TENANT_ACCEPTED / BOOKING_PENDING
   * - 'decline': status becomes TENANT_DECLINED and other candidates on property revert back to PENDING!
   */
  async respondToOwnerConfirmation(interestId, tenantId, action = 'accept', conn = null) {
    const [rows] = await runQuery(conn, `SELECT * FROM tenant_owner_interests WHERE id = ? AND tenant_id = ? LIMIT 1`, [interestId, tenantId]);
    if (!rows || rows.length === 0) return { success: false, message: "Interest request not found" };
    const current = rows[0];

    if (action === 'accept') {
      await runQuery(
        conn,
        `UPDATE tenant_owner_interests SET status = 'TENANT_ACCEPTED', tenant_responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [interestId]
      );
      // Automatically link property to tenant record so it appears in Linked Lease Property tab
      await runQuery(
        conn,
        `UPDATE tenants SET rental_property_id = ?, status = 'Interested', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [current.rental_property_id, tenantId]
      );
    } else {
      // Tenant declined -> Reopen property for others!
      await runQuery(
        conn,
        `UPDATE tenant_owner_interests SET status = 'TENANT_DECLINED', tenant_responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [interestId]
      );
      // Revert PROPERTY_SELECTED back to PENDING for other candidates
      await runQuery(
        conn,
        `UPDATE tenant_owner_interests 
         SET status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
         WHERE rental_property_id = ? AND status = 'PROPERTY_SELECTED'`,
        [current.rental_property_id]
      );
    }

    const [updated] = await runQuery(conn, `SELECT * FROM tenant_owner_interests WHERE id = ?`, [interestId]);
    return { success: true, data: updated[0] };
  },

  async delete(id, conn = null) {
    const [result] = await runQuery(conn, "DELETE FROM tenants WHERE id = ?", [id]);
    return result.affectedRows;
  },

  async bulkDelete(ids = [], conn = null) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const placeholders = ids.map(() => "?").join(",");
    const [result] = await runQuery(conn, `DELETE FROM tenants WHERE id IN (${placeholders})`, ids);
    return result.affectedRows;
  },

  async bulkImport(tenants = [], conn = null) {
    if (!Array.isArray(tenants) || tenants.length === 0) {
      return {
        success: true,
        inserted: 0,
        skipped: 0,
        skippedRows: [],
        updatedRows: [],
        insertedRows: [],
      };
    }

    const [existingRows] = await runQuery(conn, "SELECT id, email, phone FROM tenants");
    const existingEmails = new Set(
      existingRows.map((r) => (r.email ? String(r.email).toLowerCase().trim() : null)).filter(Boolean)
    );

    const normalizePhoneDigits = (ph) => {
      if (!ph) return null;
      const digits = String(ph).replace(/\D/g, "");
      return digits.slice(-10);
    };

    const existingPhones = new Set(
      existingRows.map((r) => normalizePhoneDigits(r.phone)).filter(Boolean)
    );

    const skippedRows = [];
    const insertedRows = [];
    let inserted = 0;

    const [maxIdRow] = await runQuery(conn, "SELECT MAX(id) as max_id FROM tenants");
    let nextId = (maxIdRow[0]?.max_id || 0) + 1;

    const lowerKeys = (obj) => {
      const result = {};
      Object.keys(obj || {}).forEach(k => {
        result[String(k).trim().toLowerCase()] = obj[k];
      });
      return result;
    };
    
    const emptyToNull = (v) => {
      if (v === undefined || v === null || String(v).trim() === "") return null;
      return String(v).trim();
    };

    for (const [index, raw] of tenants.entries()) {
      const rowNum = index + 2;
      const r = lowerKeys(raw || {});

      const name = (r.name ?? "").toString().trim();
      const phone = emptyToNull(r.phone);
      const email = emptyToNull(r.email ? String(r.email).toLowerCase().trim() : null);
      const whatsapp = emptyToNull(r.whatsapp ?? r.phone);
      
      const preferred_location = emptyToNull(r.preferred_location ?? r.location);
      const budget_min = emptyToNull(r.budget_min);
      const budget_max = emptyToNull(r.budget_max);
      const preferred_bhk = emptyToNull(r.preferred_bhk ?? r.bhk);
      const tenant_type = emptyToNull(r.tenant_type);
      const move_in_date = toDateOnly(r.move_in_date);
      const current_address = emptyToNull(r.current_address ?? r.address);
      const notes = emptyToNull(r.notes ?? r.remark);
      const status = emptyToNull(r.status) || 'Active Search';
      const rental_property_id = intOrNull(r.rental_property_id);
      const assigned_to = intOrNull(r.assigned_to ?? r.assigned_executive);

      if (!name || !phone) {
        skippedRows.push({
          row: rowNum,
          reason: "Missing required field(s): name/phone",
          data: raw,
          errors: [!name ? "Missing name" : null, !phone ? "Missing phone" : null].filter(Boolean),
        });
        continue;
      }

      const normPhone = normalizePhoneDigits(phone);

      if (email && existingEmails.has(email)) {
        skippedRows.push({ row: rowNum, reason: `Email already exists (${email})`, data: raw });
        continue;
      }
      if (normPhone && existingPhones.has(normPhone)) {
        skippedRows.push({ row: rowNum, reason: `Phone already exists (${phone})`, data: raw });
        continue;
      }

      try {
        const tenant_id = `TEN${String(nextId).padStart(4, '0')}`;
        nextId++;

        const payload = {
          tenant_id,
          name,
          email,
          phone,
          whatsapp,
          preferred_location,
          budget_min,
          budget_max,
          preferred_bhk,
          tenant_type,
          move_in_date,
          current_address,
          notes,
          status,
          rental_property_id,
          assigned_to,
          created_at: normalizeToMysqlDatetime(new Date()),
          updated_at: normalizeToMysqlDatetime(new Date())
        };

        const cols = Object.keys(payload);
        const placeholders = cols.map(() => "?").join(", ");
        const values = cols.map(k => payload[k]);

        const sql = `INSERT INTO tenants (${cols.join(", ")}) VALUES (${placeholders})`;
        const [res] = await runQuery(conn, sql, values);

        inserted++;
        if (normPhone) existingPhones.add(normPhone);
        if (email) existingEmails.add(email);

        const newId = res && (res.insertId || (Array.isArray(res) && res[0] && res[0].insertId))
          ? (res.insertId || res[0].insertId)
          : null;

        insertedRows.push({ id: newId, name, phone });
      } catch (err) {
        skippedRows.push({ row: rowNum, reason: `Database Error: ${err.message}`, data: raw });
      }
    }

    return {
      success: true,
      inserted,
      skipped: skippedRows.length,
      skippedRows,
      insertedRows
    };
  }
};

module.exports = Tenant;
