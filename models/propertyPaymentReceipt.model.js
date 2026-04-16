const pool = require('../config/database');

const TABLE = 'property_payment_receipts';
const SEQ_TABLE = 'receipt_sequences';
const USERS_TABLE = 'users'; // change if your table name differs
// ---- date helpers (DATE columns ke liye) ----
function toSQLDate(v) {
  if (v == null || v === '') return null;

  // ✅ already in full MySQL DATETIME format?
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v)) {
    // add seconds if missing
    return v.length === 16 ? v + ':00' : v;
  }

  // ✅ only date provided (no time)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return v + ' 00:00:00';
  }

  // ✅ try to parse ISO / timestamp / JS Date
  const d = new Date(v);
  if (isNaN(d)) return null;

  // format to local time (not UTC)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  const SS = String(d.getSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;
}


// JSON columns in DB
const JSON_FIELDS = new Set(['property_details', 'transaction_details', 'ledger_entries']);

// Columns allowed for ORDER BY
const SORTABLE = new Set([
  'id', 'receipt_id', 'payment_date', 'receipt_date',
  'amount', 'status', 'payment_status', 'created_at', 'updated_at'
]);

function parseRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (JSON_FIELDS.has(key) && out[key]) {
      try { out[key] = JSON.parse(out[key]); } catch (_) {}
    }
  }
  return out;
}

function toDbPayload(payload = {}) {
  const copy = { ...payload };

  // normalize DATE fields (agar table me DATE type hai)
  if ('receipt_date' in copy) copy.receipt_date = toSQLDate(copy.receipt_date);
  if ('payment_date' in copy) copy.payment_date = toSQLDate(copy.payment_date);

  // stringify JSON fields
  for (const key of Object.keys(copy)) {
    if (JSON_FIELDS.has(key) && copy[key] != null && typeof copy[key] !== 'string') {
      copy[key] = JSON.stringify(copy[key]);
    }
  }
  return copy;
}


// --- Sequence generator (atomic) ---
async function generateSequentialReceiptId(prefix = 'PPR') {
  const year = new Date().getFullYear();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO ${SEQ_TABLE} (prefix, \`year\`, last_number)
       VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE last_number = last_number`,
      [prefix, year]
    );

    const [rows] = await conn.query(
      `SELECT last_number FROM ${SEQ_TABLE}
       WHERE prefix = ? AND \`year\` = ? FOR UPDATE`,
      [prefix, year]
    );

    const next = Number(rows[0]?.last_number || 0) + 1;
    await conn.query(
      `UPDATE ${SEQ_TABLE}
       SET last_number = ? WHERE prefix = ? AND \`year\` = ?`,
      [next, prefix, year]
    );

    const id = `${prefix}-${year}-${String(next).padStart(6, '0')}`;
    const [dup] = await conn.query(
      `SELECT 1 FROM ${TABLE} WHERE receipt_id = ? LIMIT 1`,
      [id]
    );
    if (dup.length) throw new Error('Sequence collision detected');

    await conn.commit();
    return id;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Create */
async function createReceipt(data, userId) {
  const now = new Date();
  const receipt_id = data.receipt_id || await generateSequentialReceiptId('PPR');

  const payload = toDbPayload({
    ...data,
    receipt_id,
    created_at: data.created_at || now,
    updated_at: data.updated_at || now,
    created_by: data.created_by ?? userId ?? null,
    updated_by: data.updated_by ?? userId ?? null,
  });

  const cols = Object.keys(payload).filter(k => payload[k] !== undefined);
  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map(c => payload[c]);

  const sql = `INSERT INTO ${TABLE} (${cols.join(', ')}) VALUES (${placeholders})`;
  const [res] = await pool.query(sql, values);
  return getById(res.insertId);
}

/** Get by numeric id + full names */
async function getById(id) {
  const [rows] = await pool.query(
    `SELECT r.*,
            CONCAT(
              COALESCE(CONCAT(cu.salutation, ' '), ''),
              COALESCE(cu.first_name, ''),
              CASE WHEN cu.last_name IS NOT NULL AND cu.last_name <> ''
                   THEN CONCAT(' ', cu.last_name)
                   ELSE '' END
            ) AS created_by_name,
            CONCAT(
              COALESCE(CONCAT(uu.salutation, ' '), ''),
              COALESCE(uu.first_name, ''),
              CASE WHEN uu.last_name IS NOT NULL AND uu.last_name <> ''
                   THEN CONCAT(' ', uu.last_name)
                   ELSE '' END
            ) AS updated_by_name
     FROM ${TABLE} AS r
     LEFT JOIN ${USERS_TABLE} AS cu ON cu.id = r.created_by
     LEFT JOIN ${USERS_TABLE} AS uu ON uu.id = r.updated_by
     WHERE r.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ? parseRow(rows[0]) : null;
}

/** Get by receipt_id */
async function getByReceiptId(receipt_id) {
  const [rows] = await pool.query(
    `SELECT r.*,
            CONCAT(
              COALESCE(CONCAT(cu.salutation, ' '), ''),
              COALESCE(cu.first_name, ''),
              CASE WHEN cu.last_name IS NOT NULL AND cu.last_name <> ''
                   THEN CONCAT(' ', cu.last_name)
                   ELSE '' END
            ) AS created_by_name,
            CONCAT(
              COALESCE(CONCAT(uu.salutation, ' '), ''),
              COALESCE(uu.first_name, ''),
              CASE WHEN uu.last_name IS NOT NULL AND uu.last_name <> ''
                   THEN CONCAT(' ', uu.last_name)
                   ELSE '' END
            ) AS updated_by_name
     FROM ${TABLE} AS r
     LEFT JOIN ${USERS_TABLE} AS cu ON cu.id = r.created_by
     LEFT JOIN ${USERS_TABLE} AS uu ON uu.id = r.updated_by
     WHERE r.receipt_id = ? LIMIT 1`,
    [receipt_id]
  );
  return rows[0] ? parseRow(rows[0]) : null;
}

/** Get ALL (no pagination) */
async function getAllReceipts() {
  const [rows] = await pool.query(
    `SELECT r.*,
            CONCAT(
              COALESCE(CONCAT(cu.salutation, ' '), ''),
              COALESCE(cu.first_name, ''),
              CASE WHEN cu.last_name IS NOT NULL AND cu.last_name <> ''
                   THEN CONCAT(' ', cu.last_name)
                   ELSE '' END
            ) AS created_by_name,
            CONCAT(
              COALESCE(CONCAT(uu.salutation, ' '), ''),
              COALESCE(uu.first_name, ''),
              CASE WHEN uu.last_name IS NOT NULL AND uu.last_name <> ''
                   THEN CONCAT(' ', uu.last_name)
                   ELSE '' END
            ) AS updated_by_name
     FROM ${TABLE} AS r
     LEFT JOIN ${USERS_TABLE} AS cu ON cu.id = r.created_by
     LEFT JOIN ${USERS_TABLE} AS uu ON uu.id = r.updated_by
     ORDER BY r.created_at DESC`
  );
  return rows.map(parseRow);
}

/** List with filters + user joins */
async function listReceipts({
  page = 1,
  limit = 20,
  sortBy = 'created_at',
  sortDir = 'DESC',
  q,
  status,
  payment_status,
  payment_type,
  payment_method,
  seller_id,
  buyer_id,
  property_id,
  from_date,
  to_date,
} = {}) {
  const where = [];
  const params = [];

  if (q) {
    where.push(`(
      r.receipt_id LIKE ? OR
      r.seller_name LIKE ? OR
      r.buyer_name LIKE ? OR
      r.payment_reference LIKE ? OR
      r.property_address LIKE ?
    )`);
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (status) { where.push(`r.status = ?`); params.push(status); }
  if (payment_status) { where.push(`r.payment_status = ?`); params.push(payment_status); }
  if (payment_type) { where.push(`r.payment_type = ?`); params.push(payment_type); }
  if (payment_method) { where.push(`r.payment_method = ?`); params.push(payment_method); }
  if (seller_id) { where.push(`r.seller_id = ?`); params.push(seller_id); }
  if (buyer_id) { where.push(`r.buyer_id = ?`); params.push(buyer_id); }
  if (property_id) { where.push(`r.property_id = ?`); params.push(property_id); }
  if (from_date) { where.push(`r.payment_date >= ?`); params.push(from_date); }
  if (to_date) { where.push(`r.payment_date <= ?`); params.push(to_date); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderCol = SORTABLE.has(sortBy) ? sortBy : 'created_at';
  const orderDir = String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (p - 1) * l;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM ${TABLE} AS r ${whereSql}`,
    params
  );
  const total = countRows[0]?.total || 0;

  const dataParams = params.slice();
  dataParams.push(l, offset);

  const [rows] = await pool.query(
    `SELECT r.*,
            CONCAT(
              COALESCE(CONCAT(cu.salutation, ' '), ''),
              COALESCE(cu.first_name, ''),
              CASE WHEN cu.last_name IS NOT NULL AND cu.last_name <> ''
                   THEN CONCAT(' ', cu.last_name)
                   ELSE '' END
            ) AS created_by_name,
            CONCAT(
              COALESCE(CONCAT(uu.salutation, ' '), ''),
              COALESCE(uu.first_name, ''),
              CASE WHEN uu.last_name IS NOT NULL AND uu.last_name <> ''
                   THEN CONCAT(' ', uu.last_name)
                   ELSE '' END
            ) AS updated_by_name
     FROM ${TABLE} AS r
     LEFT JOIN ${USERS_TABLE} AS cu ON cu.id = r.created_by
     LEFT JOIN ${USERS_TABLE} AS uu ON uu.id = r.updated_by
     ${whereSql}
     ORDER BY r.${orderCol} ${orderDir}
     LIMIT ? OFFSET ?`,
    dataParams
  );

  return {
    page: p,
    limit: l,
    total,
    items: rows.map(parseRow),
  };
}

/** Update (PATCH style) */
async function updateReceipt(id, data, userId) {
  if (!id) throw new Error('id is required');
  const current = await getById(id);
  if (!current) return null;

  const payload = toDbPayload({
    ...data,
    updated_at: new Date(),
    updated_by: userId ?? data.updated_by ?? current.updated_by ?? null,
  });

  const cols = Object.keys(payload).filter(k => payload[k] !== undefined);
  if (!cols.length) return getById(id);

  const sets = cols.map(c => `${c} = ?`).join(', ');
  const values = cols.map(c => payload[c]);
  values.push(id);

  await pool.query(`UPDATE ${TABLE} SET ${sets} WHERE id = ?`, values);
  return getById(id);
}

/** Delete */
async function deleteReceipt(id) {
  const [res] = await pool.query(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
  return res.affectedRows > 0;
}

module.exports = {
  generateSequentialReceiptId,
  createReceipt,
  getById,
  getByReceiptId,
  getAllReceipts,
  listReceipts,
  updateReceipt,
  deleteReceipt,
};
