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
