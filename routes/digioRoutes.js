// routes/digioRoutes.js
const express = require("express");
const axios = require("axios");

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* CONFIG & HELPERS                                                           */
/* -------------------------------------------------------------------------- */

// DIGIO_ENV: "prod" | "production" => production, anything else => sandbox
const isProd = /^(prod|production)$/i.test(process.env.DIGIO_ENV || "");
const DIGIO_BASE = isProd ? "https://api.digio.in" : "https://ext.digio.in:444";

// Digio API paths
const DIGIO_SIGN_PATH = process.env.DIGIO_SIGN_PATH || "/v2/client/document/uploadpdf";

function getAuthHeader() {
  const clientId = process.env.DIGIO_CLIENT_ID || "";
  const clientSecret = process.env.DIGIO_CLIENT_SECRET || "";
  
  if (!clientId || !clientSecret) {
    throw new Error("DIGIO_CLIENT_ID and DIGIO_CLIENT_SECRET are required");
  }
  
  const token = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return "Basic " + token;
}

const CORS_ORIGIN = process.env.CORS_ORIGIN || "";
const safeLower = (v) => (typeof v === "string" ? v.toLowerCase() : "");

// Helper to get signing URL
function getSigningUrl(tokenId) {
  const baseUrl = isProd 
    ? "https://app.digio.in" 
    : "https://ext.digio.in:444";
  return `${baseUrl}/#/gateway/login/${tokenId}`;
}

// Helper to check if token is expiring soon (within 5 minutes)
function isTokenExpiringSoon(validTill) {
  try {
    const expiryTime = new Date(validTill.replace(' ', 'T')); // Handle "YYYY-MM-DD HH:MM:SS" format
    const now = new Date();
    const minutesUntilExpiry = (expiryTime - now) / 1000 / 60;
    return minutesUntilExpiry <= 5;
  } catch (e) {
    return true; // If parsing fails, assume expiring
  }
}

/* -------------------------------------------------------------------------- */
/* HEALTH & AUTH CHECK                                                        */
/* -------------------------------------------------------------------------- */

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    env: isProd ? "production" : "sandbox",
    base: DIGIO_BASE,
    path: DIGIO_SIGN_PATH,
    callback_url: process.env.DIGIO_CALLBACK_URL || "Not set",
    frontend_base: process.env.CORS_ORIGIN || "Not set",
  });
});

router.get("/auth-check", async (req, res) => {
  console.log("🔍 [Digio] Auth-check started...");
  try {
    const url = `${DIGIO_BASE}${DIGIO_SIGN_PATH}`;
    console.log("🔗 Testing auth with:", url);
    
    const headers = {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    };

    // Intentionally send empty body; Digio replies 400 when auth OK but body invalid
    await axios.post(url, {}, { headers, timeout: 10000 });

    // If we ever get 2xx here, unexpected but OK
    return res.json({ ok: true, note: "Unexpected 2xx - Auth successful" });
  } catch (err) {
    const sc = err.response?.status;
    const data = err.response?.data;
    console.log("🔁 Auth-check response code:", sc);
    
    if (sc === 400) {
      return res.json({
        ok: true,
        auth: true,
        status: 400,
        note: "Auth OK — body empty (expected).",
        data,
      });
    }
    
    if (sc === 401 || sc === 403) {
      return res.json({
        ok: false,
        auth: false,
        status: sc,
        reason: "Invalid client_id/secret",
        data,
      });
    }
    
    return res.json({
      ok: false,
      auth: "unknown",
      status: sc || "no-status",
      message: data || err.message,
    });
  }
});

/* -------------------------------------------------------------------------- */
/* CREATE SIGNING (fileData ONLY)                                             */
/* -------------------------------------------------------------------------- */

router.post("/create-signing", async (req, res) => {
  try {
    const {
      fileName,
      file_name,
      fileData,
      file_data,
      signers,
      displayOnPage,
      display_on_page,
      expireInDays,
      expire_in_days,
      referenceId,
      reference_id,
      sign_coordinates
    } = req.body;

    // Support both camelCase and snake_case
    const finalFileName = fileName || file_name;
    const finalFileData = fileData || file_data;
    const finalDisplayOnPage = displayOnPage || display_on_page || "last";
    const finalExpireInDays = expireInDays || expire_in_days || 30;
    const finalReferenceId = referenceId || reference_id;

    // Validation
    if (!finalFileData) {
      return res.status(400).json({ 
        ok: false, 
        error: "fileData or file_data (base64 PDF without data URI prefix) is required" 
      });
    }
    
    if (!finalFileName) {
      return res.status(400).json({ 
        ok: false, 
        error: "fileName or file_name is required" 
      });
    }
    
    if (!Array.isArray(signers) || signers.length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: "signers array is required and must not be empty" 
      });
    }

    // Validate each signer
    for (let i = 0; i < signers.length; i++) {
      const signer = signers[i];
      if (!signer.identifier || !signer.name) {
        return res.status(400).json({
          ok: false,
          error: `Signer at index ${i} must have 'identifier' and 'name'`
        });
      }
    }

    // Generate unique reference_id if not provided
    const uniqueRefId = finalReferenceId || `REF_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const payload = {
      file_name: finalFileName,
      file_data: finalFileData,
      signers,
      expire_in_days: parseInt(finalExpireInDays) || 30,
      display_on_page: finalDisplayOnPage,
      notify_signers: true,
      send_sign_link: true,
      customer_notification_mode: "ALL",
      generate_access_token: true,
      reference_id: uniqueRefId,
    };

    // Add callback (webhook URL) if configured
    if (process.env.DIGIO_CALLBACK_URL) {
      payload.callback = process.env.DIGIO_CALLBACK_URL;
    }

    // If custom coordinates are requested, enforce presence
    if (safeLower(finalDisplayOnPage) === "custom") {
      if (!sign_coordinates) {
        return res.status(400).json({ 
          ok: false, 
          error: "sign_coordinates required when display_on_page is 'custom'" 
        });
      }
      payload.sign_coordinates = sign_coordinates;
    }

    const url = `${DIGIO_BASE}${DIGIO_SIGN_PATH}`;
    console.log("📤 [Digio] Creating signing request:", url);
    console.log("📋 Reference ID:", uniqueRefId);
    
    const { data } = await axios.post(url, payload, {
      headers: { 
        Authorization: getAuthHeader(), 
        "Content-Type": "application/json" 
      },
      timeout: 60000,
    });

    console.log("✅ [Digio] Signing created successfully");
    console.log("🆔 Digio Document ID:", data.id);
    
    // Extract signing URLs and access tokens from response
    const signingParties = data.signing_parties || [];
    const signingLinks = {};
    
    signingParties.forEach(party => {
      if (party.access_token?.id) {
        signingLinks[party.identifier] = {
          name: party.name,
          url: getSigningUrl(party.access_token.id),
          tokenId: party.access_token.id,
          validTill: party.access_token.valid_till,
          email: party.identifier.includes('@') ? party.identifier : null,
          mobile: party.identifier.match(/^\d+$/) ? party.identifier : null
        };
      }
    });

    res.json({ 
      ok: true, 
      data,
      reference_id: uniqueRefId,
      document_id: data.id,
      signing_links: signingLinks, // Easy access to signing URLs
      message: "Signing request created successfully"
    });
  } catch (err) {
    console.error("❌ create-signing failed:", err.response?.data || err.message);
    
    const status = err.response?.status || 500;
    const errorData = err.response?.data || { message: err.message };
    
    res.status(status).json({ 
      ok: false, 
      error: errorData.message || "Failed to create signing request",
      details: errorData 
    });
  }
});

/* -------------------------------------------------------------------------- */
/* TOKEN REGENERATION                                                         */
/* -------------------------------------------------------------------------- */

router.post("/token/regenerate", async (req, res) => {
  try {
    const entity_id = req.body?.entity_id || 
                      req.body?.entityId || 
                      process.env.DIGIO_ENTITY_ID;

    const identifier = req.body?.identifier; // Optional - specific signer identifier

    if (!entity_id) {
      return res.status(400).json({
        ok: false,
        error: "entity_id is required (document ID from signing request)",
      });
    }

    const url = `${DIGIO_BASE}/user/auth/generate_token`;
    
    const headers = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": getAuthHeader(),
    };
    
    const payload = { entity_id };
    if (identifier) {
      payload.identifier = identifier;
    }

    console.log("🔄 [Digio] Token regeneration request:", url);
    console.log("📋 Entity ID:", entity_id);
    if (identifier) console.log("👤 Identifier:", identifier);

    const response = await axios.post(url, payload, {
      headers,
      timeout: 20000,
      validateStatus: () => true,
    });

    const { data, status } = response;
    console.log("🔁 [Digio] Token API Response Status:", status);

    if (status === 200 || status === 201) {
      // Extract from nested response object
      const tokenData = data.response || data;
      
      const tokenInfo = {
        entityId: tokenData.entity_id,
        tokenId: tokenData.id,
        validTill: tokenData.valid_till,
        createdAt: tokenData.created_at,
        sessionId: data.session?.sid,
        isLoggedIn: data.session?.is_logged_in,
        signingUrl: getSigningUrl(tokenData.id),
        expiresIn: tokenData.valid_till ? 
          Math.floor((new Date(tokenData.valid_till.replace(' ', 'T')) - new Date()) / 1000 / 60) : 
          null // Minutes until expiry
      };

      console.log("✅ [Digio] Token regenerated successfully");
      console.log("🔗 Signing URL:", tokenInfo.signingUrl);
      console.log("⏰ Valid for:", tokenInfo.expiresIn, "minutes");
      
      return res.json({ 
        ok: true, 
        data,
        message: "Token regenerated successfully",
        tokenInfo
      });
    } else {
      return res.status(status).json({
        ok: false,
        error: data?.response?.message || data?.message || data?.error || `Digio API error ${status}`,
        code: data?.response?.code || data?.code,
        details: data?.response?.details || data,
      });
    }
    
  } catch (err) {
    console.error("❌ Token regeneration error:", err.message);
    console.error("Full error:", err.response?.data || err);
    
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({
        ok: false,
        error: "Digio service unavailable - connection refused"
      });
    }
    
    if (err.code === 'ETIMEDOUT') {
      return res.status(504).json({
        ok: false,
        error: "Digio service timeout"
      });
    }

    if (err.response) {
      return res.status(err.response.status).json({
        ok: false,
        error: err.response.data?.message || "Digio API error",
        details: err.response.data
      });
    }
    
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: err.message
    });
  }
});

/* -------------------------------------------------------------------------- */
/* GET SIGNING LINK (for a specific signer or document)                      */
/* -------------------------------------------------------------------------- */

router.post("/signing-link", async (req, res) => {
  try {
    const { entity_id, entityId, identifier } = req.body;
    const docId = entity_id || entityId;

    if (!docId) {
      return res.status(400).json({
        ok: false,
        error: "entity_id (document ID) is required"
      });
    }

    // Get current status to check if token exists
    const statusUrl = `${DIGIO_BASE}/v2/client/document/${encodeURIComponent(docId)}`;
    const { data: statusData } = await axios.get(statusUrl, {
      headers: { Authorization: getAuthHeader() },
      timeout: 15000,
    });

    const signingParties = statusData.signing_parties || [];
    
    // If identifier provided, find specific party
    let party = identifier 
      ? signingParties.find(p => p.identifier === identifier)
      : signingParties[0]; // Default to first party

    if (!party) {
      return res.status(404).json({
        ok: false,
        error: identifier 
          ? `Signer with identifier '${identifier}' not found`
          : "No signing parties found"
      });
    }

    // Check if token exists and is valid
    const hasValidToken = party.access_token?.id && 
                          party.access_token?.valid_till &&
                          !isTokenExpiringSoon(party.access_token.valid_till);

    let tokenInfo;

    if (hasValidToken) {
      // Use existing token
      tokenInfo = {
        entityId: docId,
        tokenId: party.access_token.id,
        validTill: party.access_token.valid_till,
        signingUrl: getSigningUrl(party.access_token.id),
        regenerated: false
      };
      console.log("✅ Using existing valid token");
    } else {
      // Regenerate token
      console.log("🔄 Token expired or missing, regenerating...");
      const regenUrl = `${DIGIO_BASE}/user/auth/generate_token`;
      const payload = { entity_id: docId };
      if (identifier) payload.identifier = identifier;

      const { data: tokenData } = await axios.post(regenUrl, payload, {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": getAuthHeader(),
        },
        timeout: 20000,
      });

      const token = tokenData.response || tokenData;
      tokenInfo = {
        entityId: token.entity_id,
        tokenId: token.id,
        validTill: token.valid_till,
        signingUrl: getSigningUrl(token.id),
        regenerated: true
      };
      console.log("✅ Token regenerated successfully");
    }

    res.json({
      ok: true,
      tokenInfo,
      signerInfo: {
        name: party.name,
        identifier: party.identifier,
        status: party.status,
        type: party.type
      },
      message: tokenInfo.regenerated 
        ? "New signing link generated" 
        : "Existing signing link retrieved"
    });

  } catch (err) {
    console.error("❌ Get signing link error:", err.message);
    const status = err.response?.status || 500;
    res.status(status).json({
      ok: false,
      error: "Failed to get signing link",
      details: err.response?.data || err.message
    });
  }
});

/* -------------------------------------------------------------------------- */
/* REDIRECT HANDLER (GET)                                                     */
/* After signer completes/rejects, Digio sends the user to this URL.          */
/* We then 302 to the front-end route with ?document_id=&status=              */
/* -------------------------------------------------------------------------- */

router.get("/redirect", (req, res) => {
  const frontendBase = process.env.CORS_ORIGIN || "";

  const docId = String(req.query.document_id || req.query.digio_doc_id || "");
  const rawStatus = String(req.query.status || "");
  const s = rawStatus.toLowerCase();
  
  const status = /^(success|completed)$/.test(s)
    ? "completed"
    : /^(rejected|reject|failed|fail|cancelled|canceled|expired)$/.test(s)
    ? "rejected"
    : rawStatus || "pending";

  const path = `/digio/success?document_id=${encodeURIComponent(docId)}&status=${encodeURIComponent(status)}`;
  const target = frontendBase
    ? `${frontendBase.replace(/\/$/, "")}${path}`
    : path;

  // Check if client wants JSON response
  const wantsJson =
    /\bapplication\/json\b/i.test(req.headers.accept || "") ||
    req.get("X-Requested-With") === "XMLHttpRequest" ||
    req.get("X-Api-Client") === "postman";

  if (wantsJson) {
    return res.json({ 
      ok: true, 
      target, 
      document_id: docId,
      status,
      note: "Would redirect (302) in browser." 
    });
  }

  console.log("↪️  [Digio] Redirecting user to:", target);
  return res.redirect(302, target);
});

/* -------------------------------------------------------------------------- */
/* CALLBACK / WEBHOOK (POST)                                                  */
/* Digio server -> your server. Use to persist status to DB, etc.             */
/* -------------------------------------------------------------------------- */

router.post("/callback", express.json({ type: "*/*" }), async (req, res) => {
  try {
    const body = req.body || {};
    
    // Extract document ID from various possible locations
    const docId =
      body?.payload?.id ||
      body?.payload?.document_id ||
      body?.payload?.digio_doc_id ||
      body?.document_id ||
      body?.digio_doc_id ||
      body?.id ||
      null;

    const referenceId = body?.payload?.reference_id || body?.reference_id || null;

    const rawStatus =
      body?.payload?.agreement_status ||
      body?.payload?.status ||
      body?.status ||
      body?.event ||
      "unknown";

    const sl = safeLower(rawStatus);
    const mappedStatus =
      sl === "completed" || sl === "success"
        ? "completed"
        : /(reject|fail|cancel|expire)/.test(sl)
        ? "rejected"
        : rawStatus;

    console.log("📬 [Digio] Webhook received:", {
      docId,
      referenceId,
      status: mappedStatus,
      rawStatus,
      timestamp: new Date().toISOString()
    });

    // TODO: Upsert into your DB here
    // Example:
    // await db.signingRequests.updateOne(
    //   { 
    //     $or: [
    //       { digio_doc_id: docId },
    //       { reference_id: referenceId }
    //     ]
    //   },
    //   { 
    //     status: mappedStatus, 
    //     webhook_json: body,
    //     updated_at: new Date()
    //   },
    //   { upsert: true }
    // );

    // Optionally: auto-download & store PDF once completed
    // if (mappedStatus === "completed" && docId) {
    //   await downloadAndStorePDF(docId);
    // }

    // Always reply 200 (many providers retry on non-2xx)
    return res.json({ ok: true, received: true });
  } catch (e) {
    console.error("❌ Webhook error:", e.message);
    // Still respond 200 to avoid retry storms
    return res.json({ ok: false, error: "Internal error" });
  }
});

/* -------------------------------------------------------------------------- */
/* STATUS / DOWNLOAD / CANCEL                                                 */
/* -------------------------------------------------------------------------- */

router.get("/status/:docId", async (req, res) => {
  try {
    const docId = req.params.docId;
    if (!docId) {
      return res.status(400).json({ ok: false, error: "Document ID required" });
    }

    const url = `${DIGIO_BASE}/v2/client/document/${encodeURIComponent(docId)}`;
    console.log("📊 [Digio] Status check:", url);
    
    const { data } = await axios.get(url, {
      headers: { Authorization: getAuthHeader() },
      timeout: 15000,
    });

    // Enhance response with signing links if needed
    const signingParties = data.signing_parties || [];
    const enhancedParties = signingParties.map(party => ({
      ...party,
      signingUrl: party.access_token?.id ? getSigningUrl(party.access_token.id) : null,
      tokenExpired: party.access_token?.valid_till ? 
        isTokenExpiringSoon(party.access_token.valid_till) : 
        true
    }));
    
    res.json({ 
      ok: true, 
      data: {
        ...data,
        signing_parties: enhancedParties
      }
    });
  } catch (e) {
    console.error("❌ Status failed:", e.response?.data || e.message);
    const status = e.response?.status || 500;
    res.status(status).json({ 
      ok: false,
      error: "Failed to fetch status", 
      details: e.response?.data || e.message 
    });
  }
});

router.get("/download/:docId", async (req, res) => {
  try {
    const docId = req.params.docId;
    if (!docId) {
      return res.status(400).json({ ok: false, error: "Document ID required" });
    }

    const url = `${DIGIO_BASE}/v2/client/document/download?document_id=${encodeURIComponent(docId)}`;
    console.log("⬇️ [Digio] Downloading:", url);

    const response = await axios.get(url, {
      headers: { Authorization: getAuthHeader() },
      responseType: "arraybuffer",
      timeout: 30000,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="document_${docId}.pdf"`
    );
    res.send(response.data);
  } catch (e) {
    console.error("❌ Download failed:", e.response?.data || e.message);
    const status = e.response?.status || 500;
    res.status(status).json({ 
      ok: false,
      error: "Failed to download document", 
      details: e.response?.data || e.message 
    });
  }
});

router.delete("/cancel/:docId", async (req, res) => {
  try {
    const docId = req.params.docId;
    if (!docId) {
      return res.status(400).json({ ok: false, error: "Document ID required" });
    }

    const url = `${DIGIO_BASE}/v2/client/document/${encodeURIComponent(docId)}/cancel`;
    console.log("🛑 [Digio] Cancel:", url);
    
    const { data } = await axios.get(url, {
      headers: { Authorization: getAuthHeader() },
      timeout: 15000,
    });
    
    res.json({ ok: true, data });
  } catch (e) {
    console.error("❌ Cancel failed:", e.response?.data || e.message);
    const status = e.response?.status || 500;
    res.status(status).json({ 
      ok: false,
      error: "Failed to cancel document", 
      details: e.response?.data || e.message 
    });
  }
});

module.exports = router;