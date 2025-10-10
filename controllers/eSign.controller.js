// controllers/esign.controller.js
const crypto = require("crypto");
const pool = require("../config/database");
const DocumentStatus = require("../models/documentStatus.model");

// ------------------------------- tiny helpers ------------------------------- //
const ok  = (res, data) => res.json({ ok: true, ...data });
const bad = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const q = async (sql, params = []) => (await pool.query(sql, params))[0];

const isProd = process.env.NODE_ENV === "production";

function uid() {
  return crypto.randomBytes(12).toString("hex"); // 24-char
}
function genOtp(n = 6) {
  const min = 10 ** (n - 1);
  const max = (10 ** n) - 1;
  return String(Math.floor(Math.random() * (max - min + 1) + min));
}
function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60 * 1000);
}
function tSafeEq(a, b) {
  if (a == null || b == null) return false;
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

// ------------------------------- MIGRATION NOTE ------------------------------ //
// Make sure your table has these columns (run once):
// ALTER TABLE document_esign_sessions
//   ADD COLUMN otp_code VARCHAR(10) NULL,
//   ADD COLUMN otp_expires_at DATETIME(3) NULL,
//   ADD COLUMN otp_attempts INT NOT NULL DEFAULT 0,
//   ADD COLUMN otp_max_attempts INT NOT NULL DEFAULT 5,
//   ADD COLUMN updated_at DATETIME(3) NULL,
//   ADD COLUMN signed_at DATETIME(3) NULL;

// --------------------------------- INIT ------------------------------------ //
/** POST /esign/init */
/** POST /esign/init */
exports.init = async (req, res) => {
  try {
    const {
      document_id,
      party_role, // 'Buyer' | 'Seller'
      name,
      email = null,
      phone = null,
      aadhaar,
      consent_text
    } = req.body || {};

    if (!document_id) return bad(res, "document_id is required");
    if (!party_role || !["Buyer", "Seller"].includes(party_role)) return bad(res, "party_role must be Buyer or Seller");
    if (!name || !String(name).trim()) return bad(res, "name is required");
    if (!aadhaar || !/^\d{12}$/.test(String(aadhaar))) return bad(res, "aadhaar must be 12 digits");
    if (!consent_text) return bad(res, "consent_text is required");

    // ensure doc exists (also ensures snapshot)
    await DocumentStatus.getOrInitSnapshot(document_id);

    // 🚧 Sequential Rule: Seller cannot start until Buyer is signed
    if (party_role === "Seller") {
      const [buyerRow] = await q(
        `SELECT status FROM document_esign_sessions
         WHERE document_id=? AND party_role='Buyer'
         ORDER BY id DESC LIMIT 1`,
        [document_id]
      );
      if (!buyerRow || String(buyerRow.status) !== "signed") {
        return bad(res, "Buyer must complete e-sign before starting Seller.", 409);
      }
    }

    // 🔒 Single active session per (document_id, party_role)
    // If there is an existing ACTIVE session (otp_sent/otp_verified/redirected), reuse it by rotating OTP.
    const [existing] = await q(
      `SELECT * FROM document_esign_sessions
       WHERE document_id=? AND party_role=? 
       ORDER BY id DESC LIMIT 1`,
      [document_id, party_role]
    );

    const isActive = existing &&
      ["otp_sent", "otp_verified", "redirected"].includes(String(existing.status));

    // helper to (re)issue OTP on an existing row
    const reissueOtpOn = async (row) => {
      const otp   = genOtp(6);
      const expAt = addMinutes(new Date(), 5);
      await q(
        `UPDATE document_esign_sessions
           SET otp_code=?, otp_expires_at=?, otp_attempts=0,
               status='otp_sent', updated_at=NOW(3)
         WHERE id=?`,
        [otp, expAt, row.id]
      );
      await DocumentStatus.logEsignEvent({
        document_id,
        provider: "mock",
        event: "otp_rotated",
        actor: `${party_role}:${row.name || name}`,
        status: "otp_sent",
        details: { session_id: row.session_id },
        created_by: req.user?.id ?? null
      });
      return { otp, expAt };
    };

    if (isActive) {
      // ♻️ Reuse: do NOT create a new session. Just rotate OTP and return the same session_id.
      const { otp, expAt } = await reissueOtpOn(existing);
      return ok(res, {
        session_id: existing.session_id,
        redirect_url: existing.redirect_url || null,
        reused: true,
        ...(isProd ? {} : { mock_otp: otp, mock_otp_expires_at: expAt.toISOString() })
      });
    }

    // If the last session is 'signed', we are allowed to create next role (or retry new cycle)
    // Else (failed/cancelled/expired), we create a fresh session row.
    const session_id   = uid();
    const created_by   = req.user?.id ?? null;
    const redirect_url = null; // will be set after OTP flow or via /redirect-url

    // Generate OTP (valid 5 minutes)
    const otp   = genOtp(6);
    const expAt = addMinutes(new Date(), 5);

    await q(
      `INSERT INTO document_esign_sessions
        (session_id, document_id, party_role, name, email, phone, aadhaar_last4,
         status, redirect_url, provider, created_by, otp_code, otp_expires_at, otp_attempts, otp_max_attempts, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'otp_sent', ?, 'mock', ?, ?, ?, 0, 5, NOW(3))`,
      [
        session_id, document_id, party_role, name, email, phone, String(aadhaar).slice(-4),
        redirect_url, created_by, otp, expAt
      ]
    );

    await DocumentStatus.logEsignEvent({
      document_id,
      provider: "mock",
      event: "request_sent",
      actor: `${party_role}:${name}`,
      status: "otp_sent",
      details: { session_id, email, phone, aadhaar_last4: String(aadhaar).slice(-4) },
      created_by
    });

    // ❌ No doc status change here — FE will set `esign_pending` on Continue.

    return ok(res, {
      session_id,
      redirect_url, // currently null
      ...(isProd ? {} : { mock_otp: otp, mock_otp_expires_at: expAt.toISOString() })
    });
  } catch (err) {
    return bad(res, err.message || "Failed to init eSign");
  }
};

// ------------------------------- RESEND OTP -------------------------------- //
/** POST /esign/resend-otp */
exports.resendOtp = async (req, res) => {
  try {
    const { session_id } = req.body || {};
    if (!session_id) return bad(res, "session_id is required");

    const [s] = await q(`SELECT * FROM document_esign_sessions WHERE session_id=?`, [session_id]);
    if (!s) return bad(res, "Unknown session", 404);

    // basic cooldown: 30s since last update
    const last = new Date(s.updated_at || s.created_at || Date.now());
    if (Date.now() - last.getTime() < 30 * 1000) {
      return bad(res, "Please wait before requesting another OTP", 429);
    }

    // re-issue OTP (valid 5 minutes from now)
    const otp   = genOtp(6);
    const expAt = addMinutes(new Date(), 5);

    await q(
      `UPDATE document_esign_sessions
          SET otp_code=?, otp_expires_at=?, otp_attempts=0, status='otp_sent', updated_at=NOW(3)
        WHERE id=?`,
      [otp, expAt, s.id]
    );

    await DocumentStatus.logEsignEvent({
      document_id: s.document_id,
      provider: "mock",
      event: "otp_resent",
      actor: `${s.party_role}:${s.name}`,
      status: "otp_sent",
      details: { session_id },
      created_by: req.user?.id ?? null
    });

    return ok(res, {
      resent: true,
      ...(isProd ? {} : { mock_otp: otp, mock_otp_expires_at: expAt.toISOString() })
    });
  } catch (err) {
    return bad(res, err.message || "Failed to resend OTP");
  }
};

// ------------------------------- VERIFY OTP -------------------------------- //
/** POST /esign/verify-otp */
// ------------------------------- VERIFY OTP -------------------------------- //
/** POST /esign/verify-otp */
exports.verifyOtp = async (req, res) => {
  try {
    const { session_id, otp } = req.body || {};
    if (!session_id) return bad(res, "session_id is required");
    if (!otp || !/^\d{6}$/.test(String(otp))) return bad(res, "otp must be 6 digits");

    const [s] = await q(`SELECT * FROM document_esign_sessions WHERE session_id=?`, [session_id]);
    if (!s) return bad(res, "Unknown session", 404);

    if (s.otp_attempts >= (s.otp_max_attempts || 5)) {
      return bad(res, "Maximum verification attempts exceeded", 429);
    }
    if (!s.otp_code || !s.otp_expires_at) {
      return bad(res, "OTP not generated for this session", 400);
    }
    if (new Date(s.otp_expires_at).getTime() < Date.now()) {
      return bad(res, "OTP expired", 400);
    }

    // compare (timing-safe)
    const isMatch = tSafeEq(s.otp_code, otp);
    if (!isMatch) {
      await q(
        `UPDATE document_esign_sessions
            SET otp_attempts = otp_attempts + 1, updated_at = NOW(3)
          WHERE id = ?`,
        [s.id]
      );
      return bad(res, "Invalid OTP", 400);
    }

    // ✅ SUCCESS: reset attempts, mark otp_verified only if still in pre-OTP states
    // NOTE: this prevents DOWNGRADING from 'redirected' or 'signed'
    await q(
      `UPDATE document_esign_sessions
          SET
            otp_attempts = 0,
            -- optional column; create if you want it. If not present, remove this line.
            -- otp_verified_at = COALESCE(otp_verified_at, NOW(3)),
            status = CASE
                      WHEN status IN ('created','otp_sent') THEN 'otp_verified'
                      ELSE status
                    END,
            updated_at = NOW(3)
        WHERE id = ?`,
      [s.id]
    );

    await DocumentStatus.logEsignEvent({
      document_id: s.document_id,
      provider: "mock",
      event: "otp_verified",
      actor: `${s.party_role}:${s.name}`,
      status: "otp_verified",
      details: { session_id },
      created_by: req.user?.id ?? null
    });

    // keep response minimal; FE will call /redirect-url next
    return ok(res, { verified: true });
  } catch (err) {
    return bad(res, err.message || "OTP verification failed");
  }
};


// ------------------------------ REDIRECT URL ------------------------------- //
/** GET /esign/redirect-url?session_id=... */

exports.getRedirectUrl = async (req, res) => {
  try {
    const { session_id } = req.query || {};
    if (!session_id) return bad(res, "session_id is required");

    const [s] = await q(`SELECT * FROM document_esign_sessions WHERE session_id=?`, [session_id]);
    if (!s) return bad(res, "Unknown session", 404);

    const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:5173';
    const finalUrl = s.redirect_url || `${origin}/session/${encodeURIComponent(session_id)}`;

    if (['created','otp_sent','otp_verified'].includes(String(s.status))) {
      await q(
        `UPDATE document_esign_sessions
            SET redirect_url = ?, status = 'redirected', updated_at = NOW(3)
          WHERE id = ?`,
        [finalUrl, s.id]
      );

      await DocumentStatus.logEsignEvent({
        document_id: s.document_id,
        provider: "mock",
        event: "redirect_created",
        actor: `${s.party_role}:${s.name}`,
        status: "redirected",
        details: { session_id, redirect_url: finalUrl },
        created_by: req.user?.id ?? null
      });
    }

    return ok(res, { redirect_url: finalUrl });
  } catch (err) {
    return bad(res, err.message || "Failed to get redirect url");
  }
};





// -------------------------------- STATUS ----------------------------------- //
/** GET /esign/status?session_id=... */
exports.status = async (req, res) => {
  try {
    const { session_id } = req.query || {};
    if (!session_id) return bad(res, "session_id is required");

    const [s] = await q(`SELECT * FROM document_esign_sessions WHERE session_id=?`, [session_id]);
    if (!s) return bad(res, "Unknown session", 404);

    console.log("[DEBUG] status check:", session_id, s.status, "updated_at:", s.updated_at);

    // 🧩 Auto-promote to redirected first
    if (s.status === "otp_verified") {
      const redirectUrl = s.redirect_url || `http://localhost:5173/session/${session_id}`;
      await q(
        `UPDATE document_esign_sessions
           SET status='redirected', redirect_url=?, updated_at=NOW(3)
         WHERE id=?`,
        [redirectUrl, s.id]
      );

      await DocumentStatus.logEsignEvent({
        document_id: s.document_id,
        provider: "mock",
        event: "redirect_created",
        actor: `${s.party_role}:${s.name}`,
        status: "redirected",
        details: { session_id, redirect_url: redirectUrl },
        created_by: req.user?.id ?? null
      });

      // reload latest row after update
      s.status = "redirected";
      s.redirect_url = redirectUrl;
      s.updated_at = new Date();
    }

    // 🧩 Auto-complete mock sign after 3 s if redirected
    if (s.status === "redirected") {
      const now = Date.now();
      const updated = s.updated_at ? new Date(s.updated_at).getTime() : 0;
      if (now - updated > 3000 && !s.signed_at) {
        await q(
          `UPDATE document_esign_sessions
             SET status='signed', signed_at=NOW(3), updated_at=NOW(3)
           WHERE id=?`,
          [s.id]
        );

        await DocumentStatus.logEsignEvent({
          document_id: s.document_id,
          provider: "mock",
          event: "signed",
          actor: `${s.party_role}:${s.name}`,
          status: "signed",
          details: { session_id },
          created_by: req.user?.id ?? null
        });

        s.status = "signed";
        s.signed_at = new Date();
      }
    }

    const [row2] = await q(
      `SELECT status, signed_at, redirect_url
         FROM document_esign_sessions
        WHERE session_id=?`,
      [session_id]
    );

    return ok(res, {
      status: row2.status,
      signed_at: row2.signed_at || null,
      redirect_url: row2.redirect_url || null
    });
  } catch (err) {
    return bad(res, err.message || "Failed to fetch status");
  }
};



// ------------------------------- WEBHOOK SIGN ------------------------------- //
/** POST /esign/webhook */
exports.webhookSigned = async (req, res) => {
  try {
    const { session_id } = req.body || {};
    if (!session_id) return bad(res, "session_id is required");

    const [s] = await q(`SELECT * FROM document_esign_sessions WHERE session_id=?`, [session_id]);
    if (!s) return bad(res, "Unknown session", 404);

    await q(`UPDATE document_esign_sessions SET status='signed', signed_at=NOW(3), updated_at=NOW(3) WHERE id=?`, [s.id]);

    await DocumentStatus.logEsignEvent({
      document_id: s.document_id,
      provider: "mock",
      event: "signed",
      actor: `${s.party_role}:${s.name}`,
      status: "signed",
      details: { session_id },
      created_by: null
    });

    return ok(res, { message: "marked signed" });
  } catch (err) {
    return bad(res, err.message || "Failed to mark signed");
  }
};

// -------------------------------- ARTIFACTS -------------------------------- //
/** GET /esign/artifacts?session_id=... */
exports.artifacts = async (req, res) => {
  try {
    const { session_id } = req.query || {};
    if (!session_id) return bad(res, "session_id is required");

    const [s] = await q(`SELECT * FROM document_esign_sessions WHERE session_id=?`, [session_id]);
    if (!s) return bad(res, "Unknown session", 404);

    if (s.status !== "signed") {
      return ok(res, { signed_pdf_url: null, audit_trail_url: null });
    }

    // In real life, fetch from provider / S3
    // const base = `http://investordeal.in/artifacts/${encodeURIComponent(session_id)}`;
    const base = `http://localhost:5173/artifacts/${encodeURIComponent(session_id)}`;
    return ok(res, {
      signed_pdf_url: `${base}/signed.pdf`,
      audit_trail_url: `${base}/audit.json`
    });
  } catch (err) {
    return bad(res, err.message || "Failed to fetch artifacts");
  }
};

// ------------------------------- OPTIONAL: GET ------------------------------ //
// Handy for polling from FE
/** GET /esign/session?session_id=... */
exports.getSession = async (req, res) => {
  try {
    const { session_id } = req.query || {};
    if (!session_id) return bad(res, "session_id is required");
    const [s] = await q(`SELECT session_id, status, redirect_url, signed_at FROM document_esign_sessions WHERE session_id=?`, [session_id]);
    if (!s) return bad(res, "Unknown session", 404);
    return ok(res, s);
  } catch (err) {
    return bad(res, err.message || "Failed to fetch session");
  }
};