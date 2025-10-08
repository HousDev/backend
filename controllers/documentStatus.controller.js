// controllers/documentStatus.controller.js
// -----------------------------------------------------------------------------
// HTTP controller for the Document Status System
// -----------------------------------------------------------------------------

const Model = require("../models/documentStatus.model");

const ok  = (res, data) => res.json({ ok: true, data });
const bad = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });

function toId(x) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error("Invalid ID");
    err.status = 400;
    throw err;
  }
  return n;
}

/** POST /documents/:id/status */
exports.setStatus = async (req, res) => {
  try {
    const document_id = toId(req.params.id);
    const { new_status, reason = null, details = null } = req.body || {};
    const changed_by = req.user?.id ?? req.body?.changed_by ?? null;

    if (!new_status) return bad(res, "new_status is required");

    // short-circuit: if already same status, just return snapshot
    const current = await Model.getSnapshot(document_id);
    if (current?.current_status === new_status) {
      return ok(res, current);
    }

    const snapshot = await Model.setStatus({ document_id, new_status, reason, changed_by, details });
    return ok(res, snapshot);
  } catch (err) {
    return bad(res, err.message || "Failed to set status", err.status || 400);
  }
};

/** GET /documents/:id/snapshot */
exports.getSnapshot = async (req, res) => {
  try {
    const document_id = toId(req.params.id);
    const row = await Model.getOrInitSnapshot(document_id);
    return ok(res, row);
  } catch (err) {
    return bad(res, err.message || "Failed to fetch snapshot", err.status === 404 ? 404 : 400);
  }
};

/** GET /documents/:id/history */
exports.getHistory = async (req, res) => {
  try {
    const document_id = toId(req.params.id);
    const rows = await Model.getHistory(document_id);
    return ok(res, rows);
  } catch (err) {
    return bad(res, err.message || "Failed to fetch history");
  }
};

/** GET /documents/:id/timeline */
exports.getTimeline = async (req, res) => {
  try {
    const document_id = toId(req.params.id);
    const rows = await Model.getTimeline(document_id);
    return ok(res, rows);
  } catch (err) {
    return bad(res, err.message || "Failed to fetch timeline");
  }
};

/** POST /documents/:id/share-batches */
exports.createShareBatch = async (req, res) => {
  try {
    const document_id = toId(req.params.id);
    const {
      channels = [],        // ['whatsapp','email']
      message = null,
      public_link = null,
      recipients = [],      // array of recipient objects
    } = req.body || {};
    const created_by = req.user?.id ?? req.body?.created_by ?? null;

    if (!Array.isArray(channels)) return bad(res, "channels must be an array");

    const data = await Model.createShareBatch({
      document_id, channels, message, public_link, created_by, recipients
    });
    return ok(res, data);
  } catch (err) {
    return bad(res, err.message || "Failed to create share batch");
  }
};

/** GET /documents/:id/share-batches */
exports.listShareBatches = async (req, res) => {
  try {
    const document_id = toId(req.params.id);
    const rows = await Model.listShareBatches(document_id);
    return ok(res, rows);
  } catch (err) {
    return bad(res, err.message || "Failed to fetch share batches");
  }
};

/** GET /share-batches/:batchId/recipients */
exports.getShareRecipients = async (req, res) => {
  try {
    const share_batch_id = toId(req.params.batchId);
    const rows = await Model.getShareRecipients(share_batch_id);
    return ok(res, rows);
  } catch (err) {
    return bad(res, err.message || "Failed to fetch recipients");
  }
};

/** POST /documents/:id/otp-events */
exports.logOtpEvent = async (req, res) => {
  try {
    const document_id = toId(req.params.id);
    const { sent_to, purpose, status, otp_ref = null, details = null } = req.body || {};
    const created_by = req.user?.id ?? req.body?.created_by ?? null;

    if (!sent_to) return bad(res, "sent_to is required");
    if (!purpose) return bad(res, "purpose is required");
    if (!status) return bad(res, "status is required"); // 'sent' | 'verified' | 'failed'

    const data = await Model.logOtpEvent({ document_id, sent_to, purpose, status, otp_ref, details, created_by });
    return ok(res, data);
  } catch (err) {
    return bad(res, err.message || "Failed to log OTP event");
  }
};

/** POST /documents/:id/esign-events */
exports.logEsignEvent = async (req, res) => {
  try {
    const document_id = toId(req.params.id);
    const { provider, event, actor = null, status = null, details = null } = req.body || {};
    const created_by = req.user?.id ?? req.body?.created_by ?? null;

    if (!provider) return bad(res, "provider is required");
    if (!event) return bad(res, "event is required"); // 'request_sent','viewed','signed','declined', etc.

    const data = await Model.logEsignEvent({ document_id, provider, event, actor, status, details, created_by });
    return ok(res, data);
  } catch (err) {
    return bad(res, err.message || "Failed to log e-sign event");
  }
};


exports.bulkSetStatus = async (req, res) => {
  try {
    const { ids, new_status, reason = null, details = null } = req.body || {};
    const changed_by = req.user?.id ?? req.body?.changed_by ?? null;

    if (!Array.isArray(ids) || ids.length === 0) {
      return bad(res, "ids must be a non-empty array");
    }
    // validate IDs early
    const document_ids = ids.map(toId);

    if (!new_status) return bad(res, "new_status is required");

    const snapshots = await Model.bulkSetStatus({ document_ids, new_status, reason, changed_by, details });
    return ok(res, { count: snapshots.length, snapshots });
  } catch (err) {
    return bad(res, err.message || "Failed to bulk set status", err.status || 400);
  }
};
exports.getCatalog = async (_req, res) => {
  try {
    const rows = await Model.getCatalog();
    return res.json({ ok: true, data: rows });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || "Failed to fetch catalog" });
  }
};
