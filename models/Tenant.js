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
  if (!v) return null;
  const d = new Date(v);
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
        CONCAT_WS(' ', rp.property_type_name, rp.unit_type, rp.property_subtype_name, 'at', rp.society_name) AS property_title,
        rp.owner_id,
        o.name AS owner_name,
        CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS assigned_to_name,
        u.email AS assigned_to_email,
        u.phone AS assigned_to_phone
      FROM tenants t
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
        CONCAT_WS(' ', rp.property_type_name, rp.unit_type, rp.property_subtype_name, 'at', rp.society_name) AS property_title,
        rp.owner_id,
        o.name AS owner_name,
        CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS assigned_to_name,
        u.email AS assigned_to_email,
        u.phone AS assigned_to_phone
      FROM tenants t
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
    const fieldMappings = {
      name: (v) => v || null,
      email: (v) => v || null,
      phone: (v) => v || null,
      whatsapp: (v) => v || null,
      preferred_location: (v) => v || null,
      preferred_locations_coords: (v) => v ? (typeof v === 'string' ? v : JSON.stringify(v)) : null,
      budget_min: (v) => v || null,
      budget_max: (v) => v || null,
      preferred_bhk: (v) => v || null,
      tenant_type: (v) => v || null,
      move_in_date: (v) => toDateOnly(v),
      current_address: (v) => v || null,
      notes: (v) => v || null,
      status: (v) => v || 'Active Search',
      rental_property_id: (v) => intOrNull(v),
      rentalPropertyId: (v) => intOrNull(v),
      assigned_to: (v) => intOrNull(v),
    };

    const fields = [];
    const params = [];

    Object.keys(data).forEach((key) => {
      if (data[key] !== undefined && fieldMappings[key]) {
        const dbCol = key === 'rentalPropertyId' ? 'rental_property_id' : key;
        fields.push(`${dbCol} = ?`);
        params.push(fieldMappings[key](data[key]));
      }
    });

    if (fields.length === 0) return 0;

    fields.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);

    const sql = `UPDATE tenants SET ${fields.join(", ")} WHERE id = ?`;
    const [result] = await runQuery(conn, sql, params);
    return result ? result.affectedRows : 0;
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
