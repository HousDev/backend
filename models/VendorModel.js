const pool = require("../config/database");

let tableReady = false;

const parseJson = (value, fallback) => {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") {
    if (Array.isArray(fallback) && !Array.isArray(value)) return fallback;
    return value;
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
};

const toJson = (value, fallback) => {
  if (value == null) return JSON.stringify(fallback);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(fallback);
  }
};

const boolToInt = (value) => (value ? 1 : 0);

const emptyToNull = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
};

const pad = (part) => String(part).padStart(2, "0");

const toMysqlDateTime = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const ensureVendorsTable = async () => {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      salutation VARCHAR(50) DEFAULT NULL,
      name VARCHAR(255) NOT NULL,
      business_name VARCHAR(255) NOT NULL,
      category VARCHAR(255) DEFAULT NULL,
      country_code VARCHAR(20) DEFAULT '+91',
      phone VARCHAR(20) NOT NULL,
      whatsapp VARCHAR(20) DEFAULT NULL,
      email VARCHAR(255) NOT NULL,
      address TEXT,
      rating DECIMAL(3,2) DEFAULT 0,
      experience INT DEFAULT 0,
      verified TINYINT(1) DEFAULT 0,
      re_expert_verified TINYINT(1) DEFAULT 0,
      re_suggested TINYINT(1) DEFAULT 0,
      services JSON,
      tags JSON,
      rate_idea VARCHAR(255) DEFAULT NULL,
      description TEXT,
      availability JSON,
      languages JSON,
      certifications JSON,
      completed_projects INT DEFAULT 0,
      response_time VARCHAR(100) DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'active',
      last_active DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_vendors_email (email),
      INDEX idx_vendors_phone (phone),
      INDEX idx_vendors_category (category)
    )
  `);
  tableReady = true;
};

const mapRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    salutation: row.salutation || "",
    name: row.name || "",
    businessName: row.business_name || "",
    category: row.category || "",
    countryCode: row.country_code || "+91",
    phone: row.phone || "",
    whatsapp: row.whatsapp || "",
    email: row.email || "",
    address: row.address || "",
    rating: row.rating != null ? Number(row.rating) : 0,
    experience: row.experience != null ? Number(row.experience) : 0,
    verified: !!row.verified,
    reExpertVerified: !!row.re_expert_verified,
    reSuggested: !!row.re_suggested,
    services: parseJson(row.services, []),
    tags: parseJson(row.tags, []),
    rateIdea: row.rate_idea || "",
    description: row.description || "",
    availability: parseJson(row.availability, {
      days: [],
      startTime: "09:00",
      endTime: "18:00",
      weeklyOff: "",
    }),
    languages: parseJson(row.languages, []),
    certifications: parseJson(row.certifications, []),
    completedProjects:
      row.completed_projects != null ? Number(row.completed_projects) : 0,
    responseTime: row.response_time || "",
    status: row.status || "active",
    created_at: row.created_at,
    lastActive: row.last_active,
  };
};

const fromPayload = (body = {}) => ({
  salutation: emptyToNull(body.salutation),
  name: (body.name || "").trim(),
  business_name: (body.businessName || body.business_name || "").trim(),
  category: emptyToNull(body.category),
  country_code: emptyToNull(body.countryCode || body.country_code) || "+91",
  phone: String(body.phone || "").replace(/\D/g, ""),
  whatsapp: String(body.whatsapp || "").replace(/\D/g, "") || null,
  email: (body.email || "").trim().toLowerCase(),
  address: emptyToNull(body.address),
  rating: Number.isFinite(Number(body.rating)) ? Number(body.rating) : 0,
  experience: Number.isFinite(Number(body.experience))
    ? Number(body.experience)
    : 0,
  verified: boolToInt(body.verified),
  re_expert_verified: boolToInt(
    body.reExpertVerified ?? body.re_expert_verified,
  ),
  re_suggested: boolToInt(body.reSuggested ?? body.re_suggested),
  services: toJson(body.services, []),
  tags: toJson(body.tags, []),
  rate_idea: emptyToNull(body.rateIdea || body.rate_idea),
  description: emptyToNull(body.description),
  availability: toJson(body.availability, {}),
  languages: toJson(body.languages, []),
  certifications: toJson(body.certifications, []),
  completed_projects: Number.isFinite(
    Number(body.completedProjects ?? body.completed_projects),
  )
    ? Number(body.completedProjects ?? body.completed_projects)
    : 0,
  response_time: emptyToNull(body.responseTime || body.response_time),
  status: emptyToNull(body.status) || "active",
  last_active: toMysqlDateTime(body.lastActive || body.last_active),
});

const VendorModel = {
  async getAll() {
    await ensureVendorsTable();
    const [rows] = await pool.query("SELECT * FROM vendors ORDER BY id DESC");
    return rows.map(mapRow);
  },

  async getById(id) {
    await ensureVendorsTable();
    const [rows] = await pool.query(
      "SELECT * FROM vendors WHERE id = ? LIMIT 1",
      [id],
    );
    return mapRow(rows[0]);
  },

  async create(payload) {
    await ensureVendorsTable();
    const data = fromPayload(payload);
    const [result] = await pool.query(
      `INSERT INTO vendors (
        salutation, name, business_name, category, country_code, phone, whatsapp, email, address,
        rating, experience, verified, re_expert_verified, re_suggested, services, tags, rate_idea,
        description, availability, languages, certifications, completed_projects, response_time,
        status, last_active
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.salutation,
        data.name,
        data.business_name,
        data.category,
        data.country_code,
        data.phone,
        data.whatsapp,
        data.email,
        data.address,
        data.rating,
        data.experience,
        data.verified,
        data.re_expert_verified,
        data.re_suggested,
        data.services,
        data.tags,
        data.rate_idea,
        data.description,
        data.availability,
        data.languages,
        data.certifications,
        data.completed_projects,
        data.response_time,
        data.status,
        data.last_active,
      ],
    );
    return this.getById(result.insertId);
  },

  async update(id, payload) {
    await ensureVendorsTable();
    const data = fromPayload(payload);
    const [result] = await pool.query(
      `UPDATE vendors SET
        salutation = ?, name = ?, business_name = ?, category = ?, country_code = ?, phone = ?,
        whatsapp = ?, email = ?, address = ?, rating = ?, experience = ?, verified = ?,
        re_expert_verified = ?, re_suggested = ?, services = ?, tags = ?, rate_idea = ?,
        description = ?, availability = ?, languages = ?, certifications = ?, completed_projects = ?,
        response_time = ?, status = ?, last_active = ?
      WHERE id = ?`,
      [
        data.salutation,
        data.name,
        data.business_name,
        data.category,
        data.country_code,
        data.phone,
        data.whatsapp,
        data.email,
        data.address,
        data.rating,
        data.experience,
        data.verified,
        data.re_expert_verified,
        data.re_suggested,
        data.services,
        data.tags,
        data.rate_idea,
        data.description,
        data.availability,
        data.languages,
        data.certifications,
        data.completed_projects,
        data.response_time,
        data.status,
        data.last_active,
        id,
      ],
    );
    if (!result.affectedRows) return null;
    return this.getById(id);
  },

  async remove(id) {
    await ensureVendorsTable();
    const [result] = await pool.query("DELETE FROM vendors WHERE id = ?", [id]);
    return result.affectedRows;
  },

  async getVendorCategoryCounts() {
    await ensureVendorsTable();

    const [rows] = await pool.query(`
    SELECT
      category,
      COUNT(*) AS count
    FROM vendors
    GROUP BY category
    ORDER BY category ASC
  `);

    const [totalRows] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM vendors
  `);

    return {
      total: totalRows[0].total,
      categories: rows,
    };
  },
};

module.exports = VendorModel;
