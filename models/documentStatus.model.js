// models/documentStatus.model.js
// -----------------------------------------------------------------------------
// Production-ready model for the Document Status System (MySQL 8+)
// Depends on: ../config/database (mysql2/promise pool)
// -----------------------------------------------------------------------------

const pool = require("../config/database");
const bcrypt = require("bcryptjs");
/** Run a query and return rows */
async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Run within a dedicated connection (transaction helpers) */
async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

/** Catalog helpers */
async function getCatalog() {
  return q(
    `SELECT code, seq, is_final
       FROM document_status_catalog
      ORDER BY seq ASC`
  );
}
function totalSteps(catalog) {
  return Array.isArray(catalog) ? catalog.length : 0;
}

/** Ensure snapshot row exists; seed as 'created' if missing */
async function ensureSnapshot(document_id) {
  const exists = await q(
    `SELECT 1 FROM document_status_snapshot WHERE document_id=?`,
    [document_id]
  );
  if (exists.length) return;

  // validate document exists
  const doc = await q(
    `SELECT id, created_by FROM documents_generated WHERE id=?`,
    [document_id]
  );
  if (!doc.length) {
    const err = new Error("Document not found");
    err.status = 404;
    throw err;
  }

  const catalog = await getCatalog();
  const tsteps = totalSteps(catalog) || 1;

  await q(
    `INSERT INTO document_status_snapshot
       (document_id, current_status, completed_statuses, steps_done, progress_pct, reason, changed_by, changed_at, updated_at)
     VALUES (?, 'created', JSON_ARRAY('created'), 1, ROUND(100/?, 0), NULL, ?, NOW(3), NOW(3))`,
    [document_id, tsteps, doc[0].created_by ?? null]
  );

  // initial event
  await q(
    `INSERT INTO document_status_events
       (document_id, old_status, new_status, reason, details, changed_by, changed_at)
     VALUES (?, NULL, 'created', 'auto-init snapshot', JSON_OBJECT(), ?, NOW(3))`,
    [document_id, doc[0].created_by ?? null]
  );
}

/** Plain snapshot (nullable) */
async function getSnapshot(document_id) {
  const rows = await q(
    `SELECT s.*, dg.created_by
       FROM documents_generated dg
  LEFT JOIN document_status_snapshot s ON s.document_id = dg.id
      WHERE dg.id=?`,
    [document_id]
  );
  return rows[0] || null;
}

/** Snapshot but ensures init first */
async function getOrInitSnapshot(document_id) {
  await ensureSnapshot(document_id);
  return getSnapshot(document_id);
}

/** History (audit) */
async function getHistory(document_id) {
  await ensureSnapshot(document_id);
  return q(
    `SELECT id, document_id, old_status, new_status, reason, details, changed_by, changed_at
       FROM document_status_events
      WHERE document_id=?
      ORDER BY changed_at ASC, id ASC`,
    [document_id]
  );
}

/** Unified timeline (view) */
async function getTimeline(document_id) {
  await ensureSnapshot(document_id);
  return q(
    `SELECT source, document_id, at_time, old_status, new_status, reason, details
       FROM v_document_timeline
      WHERE document_id=?
      ORDER BY at_time ASC`,
    [document_id]
  );
}

/** Call stored procedure to set status */
async function setStatus({ document_id, new_status, reason = null, changed_by = null, details = null }) {
  await ensureSnapshot(document_id);
  const d = details ? JSON.stringify(details) : null;

  try {
    await q(`CALL sp_document_set_status(?, ?, ?, ?, ?)`, [
      document_id,
      new_status,
      reason,
      changed_by,
      d
    ]);
  } catch (err) {
    // Surface clearer message if SP missing or custom SIGNAL thrown
    if (err && (err.code === 'ER_SP_DOES_NOT_EXIST' || /sp_document_set_status/i.test(err.sqlMessage || ''))) {
      err.message = "Stored procedure sp_document_set_status is missing or failed. Re-run the SQL setup.";
    }
    throw err;
  }

  return getSnapshot(document_id);
}

/** Create a share batch (+ recipients) and (safeguard) auto-advance to 'shared' */
async function createShareBatch({ document_id, channels, message = null, public_link = null, created_by = null, recipients = [] }) {
  return withTx(async (conn) => {
    // ensure snapshot inside tx
    const [snap] = await conn.query(
      `SELECT 1 FROM document_status_snapshot WHERE document_id=?`,
      [document_id]
    );
    if (!snap.length) {
      const [[{ tsteps }]] = await conn.query(
        `SELECT GREATEST(COUNT(*),1) AS tsteps FROM document_status_catalog`
      );
      await conn.query(
        `INSERT INTO document_status_snapshot
           (document_id, current_status, completed_statuses, steps_done, progress_pct, reason, changed_by, changed_at, updated_at)
         VALUES (?, 'created', JSON_ARRAY('created'), 1, ROUND(100/?,0), NULL, ?, NOW(3), NOW(3))`,
        [document_id, tsteps, created_by]
      );
      await conn.query(
        `INSERT INTO document_status_events
           (document_id, old_status, new_status, reason, details, changed_by, changed_at)
         VALUES (?, NULL, 'created', 'auto-init snapshot (via share)', JSON_OBJECT(), ?, NOW(3))`,
        [document_id, created_by]
      );
    }

    // insert batch
    const [ins] = await conn.query(
      `INSERT INTO document_share_batch (document_id, channels, message, public_link, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [document_id, JSON.stringify(channels || []), message, public_link, created_by]
    );
    const batchId = ins.insertId;

    // recipients (bulk insert if provided)
    if (Array.isArray(recipients) && recipients.length) {
      const values = recipients.map(r => ([
        batchId,
        r.recipient_name || 'Unknown',
        r.recipient_type,                 // 'phone' | 'email'
        r.recipient_value,
        r.role || 'Custom',               // 'Seller' | 'Buyer' | 'Custom'
        r.channel || 'unknown',
        r.status || 'generated',          // 'sent' | 'generated' | 'failed'
        r.gateway_ref || null,
        r.details ? JSON.stringify(r.details) : null
      ]));
      await conn.query(
        `INSERT INTO document_share_recipient
           (share_batch_id, recipient_name, recipient_type, recipient_value, role, channel, status, gateway_ref, details)
         VALUES ?`,
        [values]
      );
    }

    // Safe-guard: advance status to 'shared' (DB trigger will also fire; SP handles idempotency)
    await conn.query(
      `CALL sp_document_set_status(?, 'shared', 'shared via API', ?, JSON_OBJECT('channels', JSON_ARRAY(), 'public_link', ?))`,
      [document_id, created_by, public_link]
    );

    const [batch]  = await conn.query(`SELECT * FROM document_share_batch WHERE id=?`, [batchId]);
    const [recips] = await conn.query(`SELECT * FROM document_share_recipient WHERE share_batch_id=? ORDER BY id ASC`, [batchId]);

    return { batch: batch[0], recipients: recips };
  });
}

/** Listing helpers */
async function listShareBatches(document_id) {
  await ensureSnapshot(document_id);
  return q(
    `SELECT * FROM document_share_batch
      WHERE document_id=?
      ORDER BY created_at ASC, id ASC`,
    [document_id]
  );
}

async function getShareRecipients(share_batch_id) {
  return q(
    `SELECT * FROM document_share_recipient
      WHERE share_batch_id=?
      ORDER BY id ASC`,
    [share_batch_id]
  );
}

/** OTP / E-sign logs */
async function logOtpEvent({ document_id, sent_to, purpose, status, otp_ref = null, details = null, created_by = null }) {
  await ensureSnapshot(document_id);
  const [res] = await pool.query(
    `INSERT INTO document_otp_events (document_id, sent_to, otp_ref, purpose, status, details, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [document_id, sent_to, otp_ref, purpose, status, details ? JSON.stringify(details) : null, created_by]
  );
  return { id: res.insertId };
}

async function logEsignEvent({ document_id, provider, event, actor = null, status = null, details = null, created_by = null }) {
  await ensureSnapshot(document_id);
  const [res] = await pool.query(
    `INSERT INTO document_esign_events (document_id, provider, event, actor, status, details, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [document_id, provider, event, actor, status, details ? JSON.stringify(details) : null, created_by]
  );
  return { id: res.insertId };
}


async function getSnapshotsFor(document_ids = []) {
  if (!Array.isArray(document_ids) || document_ids.length === 0) return [];
  const placeholders = document_ids.map(() => '?').join(',');
  return q(
    `SELECT s.*, dg.created_by
       FROM documents_generated dg
  LEFT JOIN document_status_snapshot s ON s.document_id = dg.id
      WHERE dg.id IN (${placeholders})
      ORDER BY dg.id ASC`,
    document_ids
  );
}

/** Bulk set status (transaction). Returns updated snapshots (in same order as ids) */
async function bulkSetStatus({ document_ids, new_status, reason = null, changed_by = null, details = null }) {
  if (!Array.isArray(document_ids) || document_ids.length === 0) {
    const err = new Error("document_ids must be a non-empty array");
    err.status = 400;
    throw err;
  }
  if (!new_status) {
    const err = new Error("new_status is required");
    err.status = 400;
    throw err;
  }

  const d = details ? JSON.stringify(details) : null;

  return withTx(async (conn) => {
    // ensure snapshots + call SP for each id (all-or-nothing)
    for (const id of document_ids) {
      // ensure snapshot (inline, same as createShareBatch path)
      const [snap] = await conn.query(
        `SELECT 1 FROM document_status_snapshot WHERE document_id=?`,
        [id]
      );
      if (!snap.length) {
        const [[{ tsteps }]] = await conn.query(
          `SELECT GREATEST(COUNT(*),1) AS tsteps FROM document_status_catalog`
        );

        // resolve created_by from documents_generated
        const [doc] = await conn.query(
          `SELECT id, created_by FROM documents_generated WHERE id=?`,
          [id]
        );
        if (!doc.length) {
          const err = new Error(`Document not found: ${id}`);
          err.status = 404;
          throw err;
        }

        await conn.query(
          `INSERT INTO document_status_snapshot
             (document_id, current_status, completed_statuses, steps_done, progress_pct, reason, changed_by, changed_at, updated_at)
           VALUES (?, 'created', JSON_ARRAY('created'), 1, ROUND(100/?,0), NULL, ?, NOW(3), NOW(3))`,
          [id, tsteps, doc[0].created_by ?? changed_by]
        );
        await conn.query(
          `INSERT INTO document_status_events
             (document_id, old_status, new_status, reason, details, changed_by, changed_at)
           VALUES (?, NULL, 'created', 'auto-init snapshot (via bulk)', JSON_OBJECT(), ?, NOW(3))`,
          [id, doc[0].created_by ?? changed_by]
        );
      }

      // advance via stored procedure
      try {
        await conn.query(
          `CALL sp_document_set_status(?, ?, ?, ?, ?)`,
          [id, new_status, reason, changed_by, d]
        );
      } catch (err) {
        if (err && (err.code === 'ER_SP_DOES_NOT_EXIST' || /sp_document_set_status/i.test(err.sqlMessage || ''))) {
          err.message = "Stored procedure sp_document_set_status is missing or failed. Re-run the SQL setup.";
        }
        throw err;
      }
    }

    // fetch updated snapshots (preserve input order)
    const rows = await getSnapshotsFor(document_ids);
    const byId = new Map(rows.map(r => [r.document_id, r]));
    return document_ids.map(id => byId.get(id) || null);
  });
}

/** Create/replace an OTP session for a role (upsert by document_id+role) */
async function createOtpSession({
  document_id,
  role,          // 'buyer' | 'seller'
  channel,       // 'sms' | 'email'
  sent_to,
  code_plain,    // raw code to hash
  ttl_seconds = 300,            // 5 minutes
  max_attempts = 5,
  created_by = null,
  otp_ref = null,
}) {
  await ensureSnapshot(document_id);

  const expires_at = new Date(Date.now() + ttl_seconds * 1000);
  const code_hash = await bcrypt.hash(String(code_plain), 10);

  // upsert (one active per role)
  await q(
    `INSERT INTO document_otp_sessions
       (document_id, role, channel, sent_to, code_hash, otp_ref, expires_at, attempts, max_attempts, verified_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, ?)
     ON DUPLICATE KEY UPDATE
       channel=VALUES(channel),
       sent_to=VALUES(sent_to),
       code_hash=VALUES(code_hash),
       otp_ref=VALUES(otp_ref),
       expires_at=VALUES(expires_at),
       attempts=0,
       max_attempts=VALUES(max_attempts),
       verified_at=NULL,
       created_by=VALUES(created_by),
       created_at=CURRENT_TIMESTAMP(3)`,
    [document_id, role, channel, sent_to, code_hash, otp_ref, expires_at, max_attempts, created_by]
  );

  return { document_id, role, channel, sent_to, expires_at };
}

/** Read active session (if any) */
async function getOtpSession(document_id, role) {
  const rows = await q(
    `SELECT * FROM document_otp_sessions WHERE document_id=? AND role=?`,
    [document_id, role]
  );
  return rows[0] || null;
}

/** Increment attempts; returns updated row */
async function bumpOtpAttempt(id) {
  await q(`UPDATE document_otp_sessions SET attempts=attempts+1 WHERE id=?`, [id]);
  const rows = await q(`SELECT * FROM document_otp_sessions WHERE id=?`, [id]);
  return rows[0] || null;
}

/** Mark session verified now */
async function markOtpVerified(id) {
  await q(`UPDATE document_otp_sessions SET verified_at=NOW(3) WHERE id=?`, [id]);
}

/** Return verification flags for both roles */
async function getVerificationFlags(document_id) {
  const rows = await q(
    `SELECT role, verified_at FROM document_otp_sessions WHERE document_id=?`,
    [document_id]
  );
  const flags = { buyer: false, seller: false };
  for (const r of rows) if (r.verified_at) flags[r.role] = true;
  return flags;
}

/** Are both roles verified? */
async function bothVerified(document_id) {
  const flags = await getVerificationFlags(document_id);
  return !!(flags.buyer && flags.seller);
}

/* =========================
   OTP session list readers
   ========================= */

/**
 * Build WHERE clause safely from filters.
 * Supported filters:
 *  - document_id: number
 *  - role: 'buyer' | 'seller'
 *  - channel: 'sms' | 'email'
 *  - verified: true|false      (verified_at IS/IS NOT NULL)
 *  - onlyActive: boolean       (expires_at>NOW and attempts<max_attempts and verified_at IS NULL)
 *  - sent_to_like: string      (LIKE '%...%')
 */
function buildOtpWhere(filters = {}) {
  const where = [];
  const params = [];

  if (filters.document_id != null) {
    where.push(`document_id = ?`);
    params.push(Number(filters.document_id));
  }
  if (filters.role) {
    where.push(`role = ?`);
    params.push(String(filters.role));
  }
  if (filters.channel) {
    where.push(`channel = ?`);
    params.push(String(filters.channel));
  }
  if (typeof filters.verified === 'boolean') {
    if (filters.verified) where.push(`verified_at IS NOT NULL`);
    else where.push(`verified_at IS NULL`);
  }
  if (filters.onlyActive) {
    where.push(`expires_at > NOW(3)`);
    where.push(`verified_at IS NULL`);
    where.push(`attempts < max_attempts`);
  }
  if (filters.sent_to_like) {
    where.push(`sent_to LIKE ?`);
    params.push(`%${filters.sent_to_like}%`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { clause, params };
}

/**
 * GET ALL (paginated)
 * @param {Object} opts
 *  - filters: see buildOtpWhere
 *  - page: 1-based page (default 1)
 *  - pageSize: items per page (default 25, max 200)
 *  - orderBy: column to order (default 'id')
 *  - orderDir: 'ASC'|'DESC' (default 'DESC')
 */
async function listOtpSessions(opts = {}) {
  const {
    filters = {},
    page = 1,
    pageSize = 25,
    orderBy = 'id',
    orderDir = 'DESC',
  } = opts;

  const safeOrderBy = ['id', 'document_id', 'role', 'channel', 'expires_at', 'created_at', 'verified_at', 'attempts']
    .includes(orderBy) ? orderBy : 'id';
  const safeOrderDir = String(orderDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const limit = Math.max(1, Math.min(Number(pageSize) || 25, 200));
  const offset = Math.max(0, ((Number(page) || 1) - 1) * limit);

  const { clause, params } = buildOtpWhere(filters);

  const rows = await q(
    `SELECT *
       FROM document_otp_sessions
       ${clause}
      ORDER BY ${safeOrderBy} ${safeOrderDir}
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [{ total }] = await q(
    `SELECT COUNT(*) AS total
       FROM document_otp_sessions
       ${clause}`,
    params
  );

  return {
    page: Number(page) || 1,
    pageSize: limit,
    total,
    rows,
  };
}

/**
 * GET BY document_id (optionally filter role/channel/verified/onlyActive)
 * Returns all rows for that document (e.g., historical regenerations).
 */
async function getOtpSessionsByDocument(document_id, filters = {}) {
  const { clause, params } = buildOtpWhere({ ...filters, document_id });
  return q(
    `SELECT *
       FROM document_otp_sessions
       ${clause}
      ORDER BY id DESC`,
    params
  );
}

/** GET one OTP session by its primary key id */
async function getOtpSessionById(id) {
  const rows = await q(
    `SELECT *
       FROM document_otp_sessions
      WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

/** Bulk: GET sessions for multiple docs (grouped by document_id) */
async function getOtpSessionsForDocuments(document_ids = [], filters = {}) {
  if (!Array.isArray(document_ids) || document_ids.length === 0) return [];
  const placeholders = document_ids.map(() => '?').join(',');

  // Merge base filters, but ignore document_id in filters (we supply IN list)
  const f = { ...filters };
  delete f.document_id;

  const { clause, params } = buildOtpWhere(f);
  const where = clause ? `${clause} AND document_id IN (${placeholders})`
                       : `WHERE document_id IN (${placeholders})`;

  const rows = await q(
    `SELECT *
       FROM document_otp_sessions
       ${where}
      ORDER BY document_id ASC, id DESC`,
    [...params, ...document_ids]
  );

  // Optionally return grouped map by doc id:
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.document_id)) map.set(r.document_id, []);
    map.get(r.document_id).push(r);
  }
  return { rows, byDocumentId: map };
}

function buildOtpEventWhere(filters = {}) {
  const where = [];
  const params = [];

  if (filters.document_id != null) {
    where.push(`document_id = ?`);
    params.push(Number(filters.document_id));
  }
  if (filters.purpose) {
    where.push(`purpose = ?`);
    params.push(String(filters.purpose));
  }
  if (filters.status) {
    where.push(`status = ?`);
    params.push(String(filters.status));
  }
  if (filters.sent_to_like) {
    where.push(`sent_to LIKE ?`);
    params.push(`%${filters.sent_to_like}%`);
  }
  if (filters.from) {
    where.push(`created_at >= ?`);
    params.push(new Date(filters.from));
  }
  if (filters.to) {
    where.push(`created_at <= ?`);
    params.push(new Date(filters.to));
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { clause, params };
}

/** GET ALL otp events (paginated) */
async function listOtpEvents(opts = {}) {
  const {
    filters = {},
    page = 1,
    pageSize = 25,
    orderBy = 'created_at',
    orderDir = 'DESC',
    fields = ['*'],
  } = opts;

  const safeOrderBy = ['id','document_id','purpose','status','created_at'].includes(orderBy) ? orderBy : 'created_at';
  const safeOrderDir = String(orderDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const limit = Math.max(1, Math.min(Number(pageSize) || 25, 200));
  const offset = Math.max(0, ((Number(page) || 1) - 1) * limit);

  const { clause, params } = buildOtpEventWhere(filters);
  const sel = Array.isArray(fields) && fields.length ? fields.join(', ') : '*';

  const rows = await q(
    `SELECT ${sel}
       FROM document_otp_events
       ${clause}
      ORDER BY ${safeOrderBy} ${safeOrderDir}
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [{ total }] = await q(
    `SELECT COUNT(*) AS total
       FROM document_otp_events
       ${clause}`,
    params
  );

  return { page: Number(page) || 1, pageSize: limit, total, rows };
}

/** GET events by document_id (optionally filter purpose/status & time-range), newest first */
async function getOtpEventsByDocument(document_id, filters = {}, fields = ['*']) {
  const { clause, params } = buildOtpEventWhere({ ...filters, document_id });
  const sel = Array.isArray(fields) && fields.length ? fields.join(', ') : '*';
  return q(
    `SELECT ${sel}
       FROM document_otp_events
       ${clause}
      ORDER BY created_at DESC, id DESC`,
    params
  );
}

/** GET latest event for a document (optionally by purpose) */
async function getLatestOtpEvent(document_id, purpose = null, fields = ['*']) {
  const filters = { document_id };
  if (purpose) filters.purpose = purpose;
  const { clause, params } = buildOtpEventWhere(filters);
  const sel = Array.isArray(fields) && fields.length ? fields.join(', ') : '*';
  const rows = await q(
    `SELECT ${sel}
       FROM document_otp_events
       ${clause}
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    params
  );
  return rows[0] || null;
}

/** BULK: latest event per document (optionally purpose) — 1 row per doc_id */
async function listLatestOtpEventForDocuments(document_ids = [], purpose = null, fields = ['document_id','purpose','status','created_at']) {
  if (!Array.isArray(document_ids) || document_ids.length === 0) return [];
  const placeholders = document_ids.map(() => '?').join(',');
  const params = [...document_ids];
  let extra = '';
  if (purpose) { extra = ' AND e.purpose = ?'; params.push(String(purpose)); }

  const sel = Array.isArray(fields) && fields.length ? fields.join(', ') : 'document_id, purpose, status, created_at';

  return q(
    `SELECT ${sel}
       FROM (
         SELECT
           e.*,
           ROW_NUMBER() OVER (PARTITION BY e.document_id ORDER BY e.created_at DESC, e.id DESC) AS rn
         FROM document_otp_events e
        WHERE e.document_id IN (${placeholders}) ${extra}
       ) t
      WHERE t.rn = 1
      ORDER BY t.document_id ASC`,
    params
  );
}
/** =========================
 *  GET ALL (bundle) by document_id
 *  Returns snapshot, history, timeline, shares, otp sessions, otp events, flags
 *  ========================= */
async function getAllByDocument(document_id, opts = {}) {
  const {
    includeRecipients = false,                        // also fetch recipients per share batch
    otpEventsFields = ['id','document_id','status','purpose','sent_to','created_at','otp_ref','details','created_by'],
    otpSessionsFilters = {},                          // e.g. { onlyActive: true }
    timelineLimit = null,                             // e.g. 200
  } = opts;

  await ensureSnapshot(document_id);

  // base fetches in parallel
  const [
    snapshot,
    history,
    timelineAll,
    shareBatches,
    otpSessions,
    otpEvents,
    verification
  ] = await Promise.all([
    getOrInitSnapshot(document_id),
    getHistory(document_id),
    (async () => {
      const rows = await getTimeline(document_id);
      if (timelineLimit && Number.isFinite(timelineLimit)) {
        return rows.slice(-Number(timelineLimit));
      }
      return rows;
    })(),
    listShareBatches(document_id),
    getOtpSessionsByDocument(document_id, otpSessionsFilters),
    getOtpEventsByDocument(document_id, {}, otpEventsFields),
    getVerificationFlags(document_id),
  ]);

  // optionally attach recipients for each share batch
  let recipientsByBatch = {};
  if (includeRecipients && Array.isArray(shareBatches) && shareBatches.length) {
    const all = await Promise.all(shareBatches.map(b => getShareRecipients(b.id)));
    recipientsByBatch = shareBatches.reduce((acc, b, i) => {
      acc[b.id] = all[i] || [];
      return acc;
    }, {});
  }

  return {
    document_id,
    snapshot,
    history,
    timeline: timelineAll,
    shareBatches,
    ...(includeRecipients ? { recipientsByBatch } : {}),
    otpSessions,
    otpEvents,
    verification, // { buyer: boolean, seller: boolean }
  };
}


module.exports = {
  // core
  setStatus,
  getSnapshot,
  getOrInitSnapshot,
  getHistory,
  getTimeline,
  // shares
  createShareBatch,
  listShareBatches,
  getShareRecipients,
  // events
  logOtpEvent,
  logEsignEvent,
};

module.exports.getCatalog = getCatalog;

// expose OTP helpers
module.exports.createOtpSession = createOtpSession;
module.exports.getOtpSession = getOtpSession;
module.exports.bumpOtpAttempt = bumpOtpAttempt;
module.exports.markOtpVerified = markOtpVerified;
module.exports.getVerificationFlags = getVerificationFlags;
module.exports.bothVerified = bothVerified;
// OTP readers
module.exports.listOtpSessions = listOtpSessions;
module.exports.getOtpSessionsByDocument = getOtpSessionsByDocument;
module.exports.getOtpSessionById = getOtpSessionById;
module.exports.getOtpSessionsForDocuments = getOtpSessionsForDocuments;

// OTP event readers
module.exports.listOtpEvents = listOtpEvents;
module.exports.getOtpEventsByDocument = getOtpEventsByDocument;
module.exports.getLatestOtpEvent = getLatestOtpEvent;
module.exports.listLatestOtpEventForDocuments = listLatestOtpEventForDocuments;
module.exports.getAllByDocument = getAllByDocument;



