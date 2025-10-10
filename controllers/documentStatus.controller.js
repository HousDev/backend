// controllers/documentStatus.controller.js
// -----------------------------------------------------------------------------
// HTTP controller for the Document Status System
// -----------------------------------------------------------------------------

const Model = require("../models/documentStatus.model");
const bcrypt = require("bcryptjs");

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

// ===================== OTP REQUEST (fixed) =====================
exports.requestOtp = async (req, res) => {
  try {
    const document_id = toId(req.params.id);
    let { role, channel, to, name } = req.body || {};
    const created_by = req.user?.id ?? req.body?.created_by ?? null;

    role = String(role || '').toLowerCase();
    channel = String(channel || '').toLowerCase();

    if (!['buyer','seller'].includes(role)) return bad(res, "role must be 'buyer' or 'seller'");
    if (!['sms','email'].includes(channel)) return bad(res, "channel must be 'sms' or 'email'");
    if (!to) return bad(res, "recipient (to) is required");

    // basic recipient validation
    if (channel === 'sms'   && !/^\+?\d{10,15}$/.test(to))         return bad(res, "invalid phone number");
    if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return bad(res, "invalid email address");

    // simple cooldown (30s) against last session timestamp
    const last = await Model.getOtpSession(document_id, role);
    if (last) {
      const diff = (Date.now() - new Date(last.created_at).getTime()) / 1000;
      if (diff < 30) return bad(res, `Please wait ${Math.ceil(30 - diff)}s before requesting again.`, 429);
    }

    // 6-digit code (keep as string so leading zeros are possible if you change generation later)
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // send via provider (stub)
    let otp_ref = null;
    try {
      if (channel === 'sms') {
        // otp_ref = await smsProvider.send({ to, text: `Your OTP is ${code}` });
        otp_ref = `sms_${Date.now()}`;
      } else {
        // otp_ref = await emailProvider.send({ to, subject: 'Your OTP', text: `Your OTP is ${code}` });
        otp_ref = `email_${Date.now()}`;
      }
    } catch (sendErr) {
      await Model.logOtpEvent({
        document_id,
        sent_to: to,
        purpose: `${role}_verify`,
        status: 'failed',
        otp_ref: null,
        details: { error: String(sendErr) },
        created_by
      });
      return bad(res, "Failed to dispatch OTP");
    }

    // upsert active session
    await Model.createOtpSession({
      document_id,
      role,
      channel,
      sent_to: to,
      code_plain: code,
      ttl_seconds: 300,  // 5 min
      max_attempts: 5,
      created_by,
      otp_ref,
    });

    // dev helper: echo the OTP only in non-prod / when explicitly enabled
    const SHOULD_ECHO = process.env.OTP_DEV_ECHO === 'true' || process.env.NODE_ENV !== 'production';

    await Model.logOtpEvent({
      document_id,
      sent_to: to,
      purpose: `${role}_verify`,
      status: 'sent',
      otp_ref,
      details: { channel, name: name || null, ...(SHOULD_ECHO ? { dev_code: code } : {}) },
      created_by
    });

    return ok(res, {
      message: 'OTP sent',
      channel,
      to,
      role,
      ...(SHOULD_ECHO ? { dev_code: code } : {})
    });
  } catch (err) {
    return bad(res, err.message || "Failed to request OTP");
  }
};


// ===================== OTP VERIFY (fixed) =====================
exports.verifyOtp = async (req, res) => {
  try {
    const document_id = toId(req.params.id);
    let { role, code } = req.body || {};
    const changed_by = req.user?.id ?? req.body?.changed_by ?? null;

    role = String(role || '').toLowerCase();
    code = String(code || '');

    if (!['buyer','seller'].includes(role)) return bad(res, "role must be 'buyer' or 'seller'");
    if (!code || code.length < 4) return bad(res, "invalid code");

    const session = await Model.getOtpSession(document_id, role);
    if (!session) return bad(res, "No active OTP session found", 404);

    // already verified
    if (session.verified_at) {
      const flags = await Model.getVerificationFlags(document_id);
      return ok(res, { message: 'Already verified', flags });
    }

    // expired
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await Model.logOtpEvent({
        document_id,
        sent_to: session.sent_to,
        purpose: `${role}_verify`,
        status: 'failed',
        otp_ref: session.otp_ref,
        details: { reason: 'expired' },
        created_by: changed_by
      });
      return bad(res, "OTP expired", 410);
    }

    // attempts exhausted
    if (session.attempts >= session.max_attempts) {
      await Model.logOtpEvent({
        document_id,
        sent_to: session.sent_to,
        purpose: `${role}_verify`,
        status: 'failed',
        otp_ref: session.otp_ref,
        details: { reason: 'max_attempts' },
        created_by: changed_by
      });
      return bad(res, "Maximum attempts reached", 429);
    }

    // master override for QA/dev (do NOT increment attempts if master used)
    const MASTER = process.env.OTP_MASTER_CODE ? String(process.env.OTP_MASTER_CODE) : null;
    const isMaster = MASTER && code === MASTER;

    // secure compare
    const match = isMaster || await bcrypt.compare(code, session.code_hash);

    if (!match) {
      // bump attempts only on failure
      const after = await Model.bumpOtpAttempt(session.id);
      const remaining = Math.max(0, after.max_attempts - after.attempts);

      if (remaining === 0) {
        await Model.logOtpEvent({
          document_id,
          sent_to: session.sent_to,
          purpose: `${role}_verify`,
          status: 'failed',
          otp_ref: session.otp_ref,
          details: { reason: 'max_attempts' },
          created_by: changed_by
        });
        return bad(res, "OTP incorrect. Maximum attempts reached", 429);
      }

      return bad(res, `OTP incorrect. ${remaining} attempts left`, 400);
    }

    // success path (no attempts bump)
    await Model.markOtpVerified(session.id);
    await Model.logOtpEvent({
      document_id,
      sent_to: session.sent_to,
      purpose: `${role}_verify`,
      status: 'verified',
      otp_ref: session.otp_ref,
      details: { channel: session.channel, ...(isMaster ? { via: 'master_code' } : {}) },
      created_by: changed_by
    });

    // advance status if both roles verified
    const both = await Model.bothVerified(document_id);
    const snapshot = both
      ? await Model.setStatus({
          document_id,
          new_status: 'otp_verified',
          reason: 'Buyer & Seller verified',
          changed_by,
          details: { via: isMaster ? 'otp_both_roles_master' : 'otp_both_roles' }
        })
      : await Model.getOrInitSnapshot(document_id);

    const flags = await Model.getVerificationFlags(document_id);
    return ok(res, { message: 'Verified', flags, snapshot });
  } catch (err) {
    return bad(res, err.message || "Failed to verify OTP");
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