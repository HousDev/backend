// controllers/eSign.controller.js
// Aadhaar OKYC (Sandbox + Mock) — OTP-only KYC
// Safe against "Document not found" & with extra debugging.

require('dotenv').config();
const crypto = require('crypto');
const axios  = require('axios').default;
const pool   = require('../config/database');
const DocumentStatus = require('../models/documentStatus.model');

const ok  = (res, data) => res.json({ ok: true, ...data });
const bad = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const q   = async (sql, params = []) => (await pool.query(sql, params))[0];

const BASE_URL = process.env.SANDBOX_BASE_URL || 'https://test-api.sandbox.co.in';
const API_KEY  = process.env.SANDBOX_API_KEY || '';
const API_SEC  = process.env.SANDBOX_API_SECRET || '';
const API_VER  = process.env.SANDBOX_API_VERSION || '2.0';

const USE_MOCK =
  String(process.env.SANDBOX_MODE || '').toLowerCase() === 'mock' ||
  String(API_KEY).startsWith('key_test_');

const uid = () => crypto.randomBytes(12).toString('hex');
const maskLast4 = (a) => String(a).slice(-4);


// ----------------------------- token cache -------------------------------- //
const tokenCache = { token: null, exp: 0 };
async function getAccessToken() {
  if (USE_MOCK) return 'mock-token';
  const now = Date.now();
  if (tokenCache.token && tokenCache.exp - 60_000 > now) return tokenCache.token;

  const url = `${BASE_URL}/authenticate`;
  const { data } = await axios.post(url, {}, {
    headers: {
      'x-api-key': API_KEY,
      'x-api-secret': API_SEC,
      'x-api-version': API_VER,
      'content-type': 'application/json',
    },
    timeout: 15_000,
  });

  const token = data?.access_token || data?.data?.access_token;
  if (!token) throw new Error('Sandbox auth failed: no access_token');

  const ttlSec = Number(data?.expires_in || 1200);
  tokenCache.token = token;
  tokenCache.exp   = now + ttlSec * 1000;
  return token;
}

// ------------------------------ provider ---------------------------------- //
async function providerGenerateOtp({ aadhaar_number, consent = 'Y', reason = 'KYC for agreement' }) {
  if (USE_MOCK) {
    const ref = `mock_${Date.now()}`;
    return { reference_id: ref, message: 'OTP sent (mock). Use 123456 to verify.' };
  }
  const token = await getAccessToken();
  const url = `${BASE_URL}/kyc/aadhaar/okyc/otp`;
  const { data } = await axios.post(url, { aadhaar_number, consent, reason }, {
    headers: {
      authorization: token, // NOTE: no "Bearer"
      'x-api-key': API_KEY,
      'x-api-version': API_VER,
      'content-type': 'application/json',
    },
    timeout: 20_000,
  });

  const ref = data?.data?.reference_id ?? data?.reference_id;
  const msg = (data?.data?.message ?? data?.message) || 'OTP sent';
  if (!ref) throw new Error(msg || 'OTP send failed');
  return { reference_id: String(ref), message: msg };
}

async function providerVerifyOtp({ ref_id, otp }) {
  if (USE_MOCK) {
    if (String(otp) !== '123456') {
      const e = new Error('Invalid OTP (mock)'); e.statusCode = 400; throw e;
    }
    return { kyc: { name: null }, message: 'verified (mock)' };
  }
  const token = await getAccessToken();
  const url = `${BASE_URL}/kyc/aadhaar/okyc/otp/verify`;

  const { data } = await axios.post(url, { ref_id, otp }, {
    headers: {
      authorization: token,
      'x-api-key': API_KEY,
      'x-api-version': API_VER,
      'content-type': 'application/json',
    },
    timeout: 25_000,
    validateStatus: () => true,
  });

  const code = Number(data?.code || 200);
  if (code !== 200) {
    const errMsg = data?.message || data?.errors?.[0]?.message || 'Verification failed';
    const e = new Error(errMsg); e.statusCode = code; throw e;
  }
  const kyc = data?.data || data?.aadhaar_data || {};
  return { kyc, message: data?.message || 'verified' };
}

// ----------------------- helpers: safe snapshot init ---------------------- //
async function ensureDocumentAndSnapshot(document_id, created_by = null) {
  // 1) Document must exist
  const [doc] = await q(`SELECT id FROM documents_generated WHERE id=?`, [document_id]);
  if (!doc) throw new Error('Document not found');

  // 2) Make sure snapshot row exists (even if model helper throws)
  await q(`INSERT IGNORE INTO document_status_snapshot (document_id) VALUES (?)`, [document_id]);

  // 3) Try model helper (it may enrich), but don't let it crash
  try {
    await DocumentStatus.getOrInitSnapshot(document_id);
  } catch (e) {
    dlog('getOrInitSnapshot warning:', e?.message || e);
  }

  return true;
}

// --------------------------------- INIT ------------------------------------ //
/** POST /aadhaar/init */
exports.init = async (req, res) => {
  try {
    const {
      document_id,
      party_role, // 'Buyer'|'Seller'
      name,
      email = null,
      phone = null,
      aadhaar,
      consent_text,
    } = req.body || {};

    if (!document_id) return bad(res, 'document_id is required');
    if (!party_role || !['Buyer', 'Seller'].includes(party_role)) return bad(res, 'party_role must be Buyer or Seller');
    if (!name || !String(name).trim()) return bad(res, 'name is required');
    if (!aadhaar || !/^\d{12}$/.test(String(aadhaar))) return bad(res, 'aadhaar must be 12 digits');
    if (!consent_text) return bad(res, 'consent_text is required');

    // ✅ fix: verify document & bootstrap snapshot
    try {
      await ensureDocumentAndSnapshot(document_id, req.user?.id ?? null);
    } catch (e) {
      return bad(res, e.message || 'Document not found', 404);
    }

    const { reference_id, message } = await providerGenerateOtp({
      aadhaar_number: String(aadhaar),
      consent: 'Y',
      reason: 'KYC for agreement',
    });

    const session_id = uid();
    const created_by = req.user?.id ?? null;

    await q(
      `INSERT INTO document_esign_sessions
         (session_id, document_id, party_role, name, email, phone,
          aadhaar_txn_id, aadhaar_masked_last4,
          status, provider, created_by,
          aadhaar_consent_at, aadhaar_otp_sent_at, kyc_status, updated_at)
       VALUES (?,?,?,?,?,?,?,?, 'otp_sent', ?, ?, NOW(3), NOW(3), 'pending', NOW(3))`,
      [
        session_id, document_id, party_role, name, email, phone,
        reference_id, maskLast4(aadhaar),
        USE_MOCK ? 'mock' : 'sandbox',
        created_by,
      ]
    );

    await DocumentStatus.logEsignEvent({
      document_id,
      provider: USE_MOCK ? 'mock' : 'sandbox',
      event: 'aadhaar_kyc_initiated',
      actor: `${party_role}:${name}`,
      status: 'otp_sent',
      details: { session_id, reference_id, aadhaar_last4: maskLast4(aadhaar), message },
      created_by,
    });

    dlog('INIT ok', { document_id, session_id, reference_id, last4: maskLast4(aadhaar), mock: USE_MOCK });
    return ok(res, {
      session_id,
      masked_last4: maskLast4(aadhaar),
      reference_id,
      message,
      mock: USE_MOCK,
    });
  } catch (err) {
    console.error('[AADHAAR_INIT_ERROR]', err?.response?.data || err?.message || err);
    return bad(res, err?.response?.data?.message || err?.message || 'Failed to init Aadhaar KYC');
  }
};

// ------------------------------- RESEND OTP -------------------------------- //
/** POST /aadhaar/resend-otp */
exports.resendOtp = async (req, res) => {
  try {
    const { session_id } = req.body || {};
    if (!session_id) return bad(res, 'session_id is required');

    const [s] = await q(`SELECT * FROM document_esign_sessions WHERE session_id=?`, [session_id]);
    if (!s) return bad(res, 'Unknown session', 404);

    // sanity: document exists
    try { await ensureDocumentAndSnapshot(s.document_id, req.user?.id ?? null); } catch (_) {}

    const last = new Date(s.updated_at || s.created_at || Date.now());
    if (Date.now() - last.getTime() < 30_000) {
      return bad(res, 'Please wait before requesting another OTP', 429);
    }

    const { reference_id, message } = await providerGenerateOtp({
      aadhaar_number: String(s.aadhaar_masked_last4).padStart(12, 'X'),
      consent: 'Y',
      reason: 'KYC resend OTP',
    });

    await q(
      `UPDATE document_esign_sessions
          SET aadhaar_txn_id=?, status='otp_sent', kyc_status='pending',
              aadhaar_otp_sent_at=NOW(3), updated_at=NOW(3), provider=?
        WHERE id=?`,
      [reference_id, USE_MOCK ? 'mock' : 'sandbox', s.id]
    );

    await DocumentStatus.logEsignEvent({
      document_id: s.document_id,
      provider: USE_MOCK ? 'mock' : 'sandbox',
      event: 'aadhaar_otp_sent',
      actor: `${s.party_role}:${s.name}`,
      status: 'otp_sent',
      details: { session_id, reference_id, message },
      created_by: req.user?.id ?? null,
    });

    return ok(res, { resent: true, reference_id, message });
  } catch (err) {
    return bad(res, err.message || 'Failed to resend OTP');
  }
};

// ------------------------------- VERIFY OTP -------------------------------- //
/** POST /aadhaar/verify-otp */
// ------------------------------- VERIFY OTP -------------------------------- //
// POST /aadhaar/verify-otp
// ------------------------------- VERIFY OTP -------------------------------- //
// POST /aadhaar/verify-otp
exports.verifyOtp = async (req, res) => {
  try {
    const { session_id, otp } = req.body || {};
    if (!session_id) return bad(res, "session_id is required");
    if (!otp || !/^\d{6}$/.test(String(otp))) return bad(res, "otp must be 6 digits");

    // 1) Load session
    const [s] = await q(`SELECT * FROM document_esign_sessions WHERE session_id=?`, [session_id]);
    if (!s) return bad(res, "Unknown session", 404);
    if (!s.aadhaar_txn_id) return bad(res, "OTP was not initiated for this session", 400);

    // 2) Attempts guard
    const attempts = Number(s.otp_attempts ?? 0);
    const maxAttempts = Number(s.otp_max_attempts ?? 5);
    if (attempts >= maxAttempts) return bad(res, "Maximum verification attempts exceeded", 429);

    // 3) Provider verify (mock or sandbox)
    let resp;
    try {
      resp = await providerVerifyOtp({ ref_id: s.aadhaar_txn_id, otp: String(otp) }); // <-- FIXED NAME
    } catch (e) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("invalid otp")) {
        await q(`UPDATE document_esign_sessions SET otp_attempts=otp_attempts+1, updated_at=NOW(3) WHERE id=?`, [s.id]);
        return bad(res, "Invalid OTP", 400);
      }
      if (msg.includes("expired")) return bad(res, "OTP Expired", 400);
      if (msg.includes("invalid reference")) return bad(res, "Invalid Reference Id", 400);
      if (msg.includes("missing") && msg.includes("otp")) return bad(res, "OTP missing in the request", 422);
      if (msg.includes("under process")) return bad(res, "Request under process. Try again in a moment.", 409);
      return bad(res, e?.message || "Verification failed", e?.statusCode || 400);
    }

    // 4) Normalize KYC
    const kycData   = resp?.kyc || {};
    const kyc_name  = kycData?.name || kycData?.full_name || s.name || null;
    const kyc_gender= kycData?.gender || null;
    const kyc_dob   = kycData?.dob || kycData?.date_of_birth || null;
    const kyc_addr  = kycData?.address || kycData?.aadhaar_address || null;

    // 5) Persist verification snapshot
    await q(
      `UPDATE document_esign_sessions
         SET otp_attempts=0,
             aadhaar_otp_verified_at = COALESCE(aadhaar_otp_verified_at, NOW(3)),
             status='otp_verified',
             kyc_status='done',
             aadhaar_kyc_name=?,
             aadhaar_kyc_gender=?,
             aadhaar_kyc_dob=?,
             aadhaar_kyc_address_json=?,
             aadhaar_kyc_raw=?,
             aadhaar_kyc_verified_at=COALESCE(aadhaar_kyc_verified_at, NOW(3)),
             updated_at=NOW(3)
       WHERE id=?`,
      [
        kyc_name,
        kyc_gender,
        kyc_dob,
        JSON.stringify(kyc_addr),
        JSON.stringify(kycData || null),
        s.id,
      ]
    );

    // 6) Best-effort status updates (never block success)
    try {
      let snap = null;
      try { snap = await DocumentStatus.getOrInitSnapshot(s.document_id); } catch {}
      const partyKey = String(s.party_role).toLowerCase() === "seller" ? "seller_verified" : "buyer_verified";
      const alreadyBuyer  = !!snap?.buyer_verified;
      const alreadySeller = !!snap?.seller_verified;

      try {
        await DocumentStatus.setStatus(s.document_id, {
          new_status: "otp_partial",
          details: { [partyKey]: true, session_id },
        });
      } catch {}

      const buyerNow  = partyKey === "buyer_verified"  ? true : alreadyBuyer;
      const sellerNow = partyKey === "seller_verified" ? true : alreadySeller;
      if (buyerNow && sellerNow) {
        try {
          await DocumentStatus.setStatus(s.document_id, {
            new_status: "kyc_verified",
            details: { buyer_verified: true, seller_verified: true },
          });
        } catch {}
      }
    } catch {}

    // 7) Log event (best effort)
    try {
      await DocumentStatus.logEsignEvent({
        document_id: s.document_id,
        provider: USE_MOCK ? "mock" : "sandbox",
        event: "aadhaar_otp_verified",
        actor: `${s.party_role}:${s.name}`,
        status: "otp_verified",
        details: { session_id, reference_id: s.aadhaar_txn_id, mock: USE_MOCK },
        created_by: req.user?.id ?? null,
      });
    } catch {}

    // 8) Done
    return ok(res, {
      verified: true,
      kyc: { name: kyc_name, gender: kyc_gender, dob: kyc_dob, address: kyc_addr },
      mock: USE_MOCK,
    });
  } catch (err) {
    console.error("[AADHAAR_VERIFY_ERROR]", err?.response?.data || err?.message || err);
    return bad(res, err?.message || "OTP verification failed");
  }
};



// ------------------------------- GET KYC ----------------------------------- //
exports.getKyc = async (req, res) => {
  try {
    const { session_id } = req.query || {};
    if (!session_id) return bad(res, 'session_id is required');

    const [s] = await q(
      `SELECT party_role, name, aadhaar_masked_last4, aadhaar_consent_at, aadhaar_otp_sent_at, aadhaar_otp_verified_at,
              aadhaar_kyc_name, aadhaar_kyc_gender, aadhaar_kyc_dob, aadhaar_kyc_address_json, aadhaar_kyc_verified_at
         FROM document_esign_sessions
        WHERE session_id=?`,
      [session_id]
    );
    if (!s) return bad(res, 'Unknown session', 404);

    return ok(res, {
      party_role: s.party_role,
      name      : s.name,
      aadhaar_last4 : s.aadhaar_masked_last4,
      consent_at    : s.aadhaar_consent_at,
      otp_sent_at   : s.aadhaar_otp_sent_at,
      otp_verified_at: s.aadhaar_otp_verified_at,
      kyc_verified_at: s.aadhaar_kyc_verified_at,
      kyc: {
        name: s.aadhaar_kyc_name,
        gender: s.aadhaar_kyc_gender,
        dob: s.aadhaar_kyc_dob,
        address: (() => { try { return JSON.parse(s.aadhaar_kyc_address_json || 'null'); } catch { return null; } })(),
      },
    });
  } catch (err) {
    return bad(res, err.message || 'Failed to fetch KYC');
  }
};
