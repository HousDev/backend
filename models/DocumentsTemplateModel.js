// // models/DocumentsTemplateModel.js
// const db = require('../config/database'); // your mysql2/promise connection

// const DocumentsTemplate = {
//   // CREATE
//   async create(data) {
//    const sql = `
//   INSERT INTO documents_templates
//   (name, description, category, content, variables, status, created_by, updated_by, last_used_at, usage_count)
//   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
// `;
// const params = [
//   data.name,
//   data.description || null,
//   data.category || null,
//   data.content,
//   data.variables ? JSON.stringify(data.variables) : null,
//   data.status || 'draft',
//   data.created_by || null,
//   data.updated_by || null,
//   data.last_used_at || null,
//   data.usage_count || 0   // 👈 naya field
// ];


//     const [result] = await db.query(sql, params);
//     return result;
//   },

//   // GET BY ID
//   async getById(id) {
//     const sql = `SELECT * FROM documents_templates WHERE id = ?`;
//     const [rows] = await db.query(sql, [id]);
//     return rows;
//   },

//   // GET ALL
//   async getAll(filters = {}) {
//     let sql = `SELECT * FROM documents_templates WHERE 1=1`;
//     const params = [];

//     if (filters.status) {
//       sql += ` AND status = ?`;
//       params.push(filters.status);
//     }

//     if (filters.category) {
//       sql += ` AND category = ?`;
//       params.push(filters.category);
//     }

//     const [rows] = await db.query(sql, params);
//     return rows;
//   },

//   // UPDATE
//   async update(id, data) {
//    const sql = `
//   UPDATE documents_templates
//   SET name = ?, description = ?, category = ?, content = ?, variables = ?, status = ?, updated_by = ?, last_used_at = ?, usage_count = ?
//   WHERE id = ?
// `;
// const params = [
//   data.name,
//   data.description || null,
//   data.category || null,
//   data.content,
//   data.variables ? JSON.stringify(data.variables) : null,
//   data.status || 'draft',
//   data.updated_by || null,
//   data.last_used_at || null,
//   data.usage_count ?? 0,   // 👈 default 0 agar undefined ho
//   id
// ];


//     const [result] = await db.query(sql, params);
//     return result;
//   },

//   // DELETE
//   async delete(id) {
//     const sql = `DELETE FROM documents_templates WHERE id = ?`;
//     const [result] = await db.query(sql, [id]);
//     return result;
//   }
//   ,
//   async incrementUsage(id) {
//   const sql = `
//     UPDATE documents_templates
//     SET usage_count = usage_count + 1, last_used_at = NOW()
//     WHERE id = ?
//   `;
//   const [result] = await db.query(sql, [id]);
//   return result;
// }

// };

// module.exports = DocumentsTemplate;

// models/DocumentsTemplateModel.js
const db = require('../config/database'); // mysql2/promise pool

/* ---------- helpers ---------- */
function toMySQLDateTime(val, withMs = true, useUTC = true) {
  if (val == null || val === '') return null;
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return null;

  const pad2 = (n) => String(n).padStart(2, '0');
  const Y = useUTC ? d.getUTCFullYear() : d.getFullYear();
  const M = pad2((useUTC ? d.getUTCMonth() : d.getMonth()) + 1);
  const D = pad2(useUTC ? d.getUTCDate() : d.getDate());
  const h = pad2(useUTC ? d.getUTCHours() : d.getHours());
  const m = pad2(useUTC ? d.getUTCMinutes() : d.getMinutes());
  const s = pad2(useUTC ? d.getUTCSeconds() : d.getSeconds());
  if (withMs) {
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}.${ms}`;
  }
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

function jsonOrNull(v) {
  try {
    if (v == null) return null;
    if (typeof v === 'string') return v; // assume already JSON string
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

/* ---------- model ---------- */
const DocumentsTemplate = {
  // CREATE
async create(data) {
    const sql = `
      INSERT INTO documents_templates
      (name, description, category, content, variables, status, created_by, updated_by, last_used_at, usage_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, UTC_TIMESTAMP(3)), ?)
      --                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      --  if param is NULL -> use current UTC time (ms precision)
    `;

    const lastUsed =
      data.last_used_at === undefined || data.last_used_at === null || data.last_used_at === ''
        ? null
        : toMySQLDateTime(data.last_used_at, true, true); // normalize if provided

    const params = [
      data.name,
      data.description ?? null,
      data.category ?? null,
      data.content,
      jsonOrNull(data.variables),
      data.status ?? 'draft',
      data.created_by ?? null,
      data.updated_by ?? null,
      lastUsed,                 // <- COALESCE will turn NULL into UTC_TIMESTAMP(3)
      data.usage_count ?? 0,
    ];

    const [result] = await db.query(sql, params);
    return result;
  },

  // GET BY ID
  async getById(id) {
    const sql = `SELECT * FROM documents_templates WHERE id = ? LIMIT 1`;
    const [rows] = await db.query(sql, [id]);
    return rows && rows[0] ? rows[0] : null;
  },

  // GET ALL
  async getAll(filters = {}) {
    let sql = `SELECT * FROM documents_templates WHERE 1=1`;
    const params = [];

    if (filters.status) {
      sql += ` AND status = ?`;
      params.push(filters.status);
    }

    if (filters.category) {
      sql += ` AND category = ?`;
      params.push(filters.category);
    }

    const [rows] = await db.query(sql, params);
    return rows;
  },

  // UPDATE (only sets provided fields; last_used_at handled carefully)
  async update(id, data) {
    const sets = [];
    const params = [];

    if (data.name !== undefined) {
      sets.push('name = ?');
      params.push(data.name);
    }
    if (data.description !== undefined) {
      sets.push('description = ?');
      params.push(data.description ?? null);
    }
    if (data.category !== undefined) {
      sets.push('category = ?');
      params.push(data.category ?? null);
    }
    if (data.content !== undefined) {
      sets.push('content = ?');
      params.push(data.content);
    }
    if (data.variables !== undefined) {
      sets.push('variables = ?');
      params.push(jsonOrNull(data.variables));
    }
    if (data.status !== undefined) {
      sets.push('status = ?');
      params.push(data.status ?? 'draft');
    }
    if (data.updated_by !== undefined) {
      sets.push('updated_by = ?');
      params.push(data.updated_by ?? null);
    }
    if (data.usage_count !== undefined) {
      sets.push('usage_count = ?');
      params.push(data.usage_count ?? 0);
    }

    // --- last_used_at rules ---
    if (data.hasOwnProperty('last_used_at')) {
      // case 1: client wants DB to set current time
      if (data.last_used_at === 'auto' || data.last_used_at === true) {
        sets.push('last_used_at = UTC_TIMESTAMP(3)');
        // no param pushed
      }
      // case 2: explicit null
      else if (data.last_used_at === null || data.last_used_at === '') {
        sets.push('last_used_at = NULL');
      }
      // case 3: normalize any date-ish value
      else {
        const norm = toMySQLDateTime(data.last_used_at, true, true);
        if (norm) {
          sets.push('last_used_at = ?');
          params.push(norm);
        }
        // invalid value → don't touch column
      }
    }
    // if key absent → don't touch last_used_at

    if (sets.length === 0) {
      // nothing to update
      return { affectedRows: 0 };
    }

    const sql = `
      UPDATE documents_templates
      SET ${sets.join(', ')}
      WHERE id = ?
    `;
    params.push(id);

    const [result] = await db.query(sql, params);
    return result; // has affectedRows
  },

  // DELETE (hard delete)
  async delete(id) {
    const sql = `DELETE FROM documents_templates WHERE id = ?`;
    const [result] = await db.query(sql, [id]);
    return result;
  },

  // increment usage & set last_used_at to current UTC time
  async incrementUsage(id) {
    const sql = `
      UPDATE documents_templates
      SET usage_count = usage_count + 1,
          last_used_at = UTC_TIMESTAMP(3)
      WHERE id = ?
    `;
    const [result] = await db.query(sql, [id]);
    return result;
  },
};

module.exports = DocumentsTemplate;

