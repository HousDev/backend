const axios = require("axios");
const { sendMail, renderSigningEmail } = require("../utils/mailer"); // adjust path if needed

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

const safeLower = (v) => (typeof v === "string" ? v.toLowerCase() : "");

// Identifier hygiene
const normId = (v) => {
  if (!v) return "";
  const s = String(v).trim();
  return s.includes("@") ? s.toLowerCase() : s.replace(/\D/g, ""); // email→lower, phone→digits-only
};
const sameIdentifier = (a, b) => normId(a) === normId(b);

// Helper to get signing URL
function getSigningUrl(tokenId) {
  const baseUrl = isProd ? "https://app.digio.in" : "https://ext.digio.in:444";
  return `${baseUrl}/#/gateway/login/${tokenId}`;
}

// Current code - NOT correct for first-time users
// Corrected version for first-time users requiring OTP
function getWebSDKUrl(documentId, identifier) {
  const base = isProd ? "https://app.digio.in" : "https://ext-gateway.digio.in";
  const normalizedId = normId(identifier); // Normalize identifier
  return `${base}/#/gateway/login/${encodeURIComponent(documentId)}/${encodeURIComponent(normalizedId)}`;
}

// Helper to check if token is expiring soon (within 5 minutes)
function isTokenExpiringSoon(validTill) {
  try {
    const expiryTime = new Date(String(validTill).replace(" ", "T")); // Handle "YYYY-MM-DD HH:MM:SS" format
    const now = new Date();
    const minutesUntilExpiry = (expiryTime - now) / 1000 / 60;
    return minutesUntilExpiry <= 5;
  } catch (e) {
    return true; // If parsing fails, assume expiring
  }
}

// Enhanced helper to generate token for a signer with detailed logging
async function generateTokenForSigner(entityId, identifier) {
  try {
    const url = `${DIGIO_BASE}/user/auth/generate_token`;

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    };

    const payload = {
      entity_id: entityId,
      identifier: normId(identifier),
    };

    console.log(`\n🔑 [Digio] Generating token for ${identifier}...`);
    console.log(`📋 Request URL: ${url}`);
    console.log(`📦 Payload:`, JSON.stringify(payload, null, 2));

    const response = await axios.post(url, payload, {
      headers,
      timeout: 20000,
      validateStatus: () => true, // Don't throw on any status
    });

    const { data, status } = response;

    console.log(`📥 [Digio] Token API Response Status: ${status}`);
    console.log(`📄 Response Data:`, JSON.stringify(data, null, 2));

    if (status === 200 || status === 201) {
      const tokenData = data.response || data;

      // Validate token data structure
      if (!tokenData.id) {
        console.error(`❌ Token data missing 'id' field:`, tokenData);
        return {
          success: false,
          error: "Invalid token response - missing token ID",
          details: tokenData,
          status: status,
        };
      }

      console.log(`✅ [Digio] Token generated successfully for ${identifier}`);
      console.log(`🆔 Token ID: ${tokenData.id}`);
      console.log(`⏰ Valid Till: ${tokenData.valid_till}`);

      return {
        success: true,
        tokenId: tokenData.id,
        validTill: tokenData.valid_till,
        signingUrl: getSigningUrl(tokenData.id),
        entityId: tokenData.entity_id,
      };
    } else if (status === 404) {
      // Check if it's NO_USER_FOUND error
      const errorCode = data?.response?.code;
      if (errorCode === "NO_USER_FOUND") {
        console.log(`ℹ️ [Digio] User not found (first-time user): ${identifier}`);
        return {
          success: false,
          isNewUser: true,
          error: "User not registered on Digio",
          errorCode: "NO_USER_FOUND",
          details: data,
          status: status,
        };
      }
    }

    const errorMsg = data?.message || data?.error || data?.response?.message || `API returned status ${status}`;
    console.error(`❌ Token generation failed (${status}) for ${identifier}:`, errorMsg);
    console.error(`Full error data:`, data);

    return {
      success: false,
      error: errorMsg,
      status: status,
      details: data,
    };
  } catch (err) {
    console.error(`❌ Token generation exception for ${identifier}:`, err.message);
    console.error(`Stack trace:`, err.stack);

    if (err.response) {
      console.error(`HTTP Status:`, err.response.status);
      console.error(`Response data:`, err.response.data);

      // Check for NO_USER_FOUND in exception response
      if (err.response.status === 404 && err.response.data?.response?.code === "NO_USER_FOUND") {
        return {
          success: false,
          isNewUser: true,
          error: "User not registered on Digio",
          errorCode: "NO_USER_FOUND",
          status: err.response.status,
          details: err.response.data,
        };
      }

      return {
        success: false,
        error: err.response.data?.message || err.response.data?.error || "Token generation API error",
        status: err.response.status,
        details: err.response.data,
      };
    }

    if (err.code === "ECONNREFUSED") {
      return {
        success: false,
        error: "Cannot connect to Digio API - connection refused",
        details: { code: err.code, message: err.message },
      };
    }

    if (err.code === "ETIMEDOUT") {
      return {
        success: false,
        error: "Digio API request timeout",
        details: { code: err.code, message: err.message },
      };
    }

    return {
      success: false,
      error: err.message || "Token generation failed",
      details: { code: err.code, message: err.message },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* CONTROLLER METHODS                                                         */
/* -------------------------------------------------------------------------- */

const healthCheck = (req, res) => {
  res.json({
    ok: true,
    env: isProd ? "production" : "sandbox",
    base: DIGIO_BASE,
    path: DIGIO_SIGN_PATH,
    callback_url: process.env.DIGIO_CALLBACK_URL || "Not set",
    frontend_base: process.env.CORS_ORIGIN || "Not set",
  });
};

const authCheck = async (req, res) => {
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
};

const createSigning = async (req, res) => {
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
      sign_coordinates,
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
        error: "fileData or file_data (base64 PDF without data URI prefix) is required",
      });
    }

    if (!finalFileName) {
      return res.status(400).json({
        ok: false,
        error: "fileName or file_name is required",
      });
    }

    if (!Array.isArray(signers) || signers.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "signers array is required and must not be empty",
      });
    }

    // Validate each signer
    for (let i = 0; i < signers.length; i++) {
      const signer = signers[i];
      if (!signer.identifier || !signer.name) {
        return res.status(400).json({
          ok: false,
          error: `Signer at index ${i} must have 'identifier' and 'name'`,
        });
      }
      signer.identifier = normId(signer.identifier); // normalize in-place (email lower / phone digits)
    }

    // Generate unique reference_id if not provided
    const uniqueRefId =
      finalReferenceId || `REF_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const payload = {
      file_name: finalFileName,
      file_data: finalFileData,
      signers, // for backward compat if your account expects this key
      // Many Digio accounts expect "signing_parties" as well, we include both forms:
      signing_parties: signers.map((s) => ({
        name: s.name,
        type: s.type || "self",
        identifier: s.identifier,
        reason: s.reason || "Signature",
        signature_type: s.signature_type || "aadhaar",
      })),
      expire_in_days: parseInt(finalExpireInDays) || 30,
      display_on_page: finalDisplayOnPage,
      notify_signers: true,
      send_sign_link: true,
      customer_notification_mode: "ALL",
      // ✅ Ask for access tokens right away (preferred)
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
          error: "sign_coordinates required when display_on_page is 'custom'",
        });
      }
      payload.sign_coordinates = sign_coordinates;
    }

    const url = `${DIGIO_BASE}${DIGIO_SIGN_PATH}`;
    console.log("\n📤 [Digio] Creating signing request:", url);
    console.log("📋 Reference ID:", uniqueRefId);
    console.log("👥 Number of signers:", signers.length);

    const { data } = await axios.post(url, payload, {
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      timeout: 60000,
    });

    console.log("✅ [Digio] Signing request created successfully");
    console.log("🆔 Digio Document ID:", data.id);

    const documentId = data.id;

    // Immediately fetch status to see if access_token already exists per party
    console.log("🔎 Fetching status to read access_token(s)...");
    const statusUrl = `${DIGIO_BASE}/v2/client/document/${encodeURIComponent(documentId)}`;
    const { data: statusData } = await axios.get(statusUrl, {
      headers: { Authorization: getAuthHeader() },
      timeout: 15000,
    });
    const parties = Array.isArray(statusData?.signing_parties) ? statusData.signing_parties : [];
    console.log("📦 Current parties in status:", parties.length);

    // NOW GENERATE/ASSIGN LINKS FOR EACH SIGNER
    const signingLinks = {};
    const tokenErrors = [];
    const newUsers = []; // Track first-time users

    console.log("\n" + "=".repeat(60));
    console.log("🔑 [Digio] Starting token/link assignment for all signers...");
    console.log("=".repeat(60));

    // Add delay between token generation requests to avoid rate limiting
    for (let i = 0; i < signers.length; i++) {
      const signer = signers[i];
      const signerId = signer.identifier;
      console.log(`\n📍 Processing signer ${i + 1}/${signers.length}`);
      console.log(`   Name: ${signer.name}`);
      console.log(`   Identifier: ${signerId}`);

      // Try to match party from status by identifier
      const party = parties.find((p) => sameIdentifier(p.identifier, signerId));

      // If Digio already provided a valid access_token, use it
      const acc = party?.access_token || {};
      const hasValidToken = acc.id && acc.valid_till && !isTokenExpiringSoon(acc.valid_till);

      if (hasValidToken) {
        const url2 = getSigningUrl(acc.id);
        signingLinks[signerId] = {
          name: signer.name,
          url: url2,
          tokenId: acc.id,
          validTill: acc.valid_till,
          email: signerId.includes("@") ? signerId : null,
          mobile: /^\d+$/.test(signerId) ? signerId : null,
        };
        console.log(`   ✅ SUCCESS - Using access_token from create-status`);
        console.log(`   🔗 Signing URL: ${url2}`);
      } else {
        // Fallback: try manual token generation (works only if identifier is known to Digio)
        const tokenResult = await generateTokenForSigner(documentId, signerId);

        if (tokenResult.success) {
          signingLinks[signerId] = {
            name: signer.name,
            url: tokenResult.signingUrl,
            tokenId: tokenResult.tokenId,
            validTill: tokenResult.validTill,
            email: signerId.includes("@") ? signerId : null,
            mobile: /^\d+$/.test(signerId) ? signerId : null,
          };
          console.log(`   ✅ SUCCESS - Token generated`);
          console.log(`   🔗 Signing URL: ${tokenResult.signingUrl}`);
        } else if (tokenResult.isNewUser) {
          // Handle first-time users - provide Web SDK URL
          console.log(`   ℹ️ FIRST-TIME USER - Needs Web SDK OTP verification`);
          const webSDKUrl = getWebSDKUrl(documentId, signerId);
          signingLinks[signerId] = {
            name: signer.name,
            url: webSDKUrl,
            isNewUser: true,
            requiresOTP: true,
            webSDKUrl: webSDKUrl,
            email: signerId.includes("@") ? signerId : null,
            mobile: /^\d+$/.test(signerId) ? signerId : null,
            message: "First-time user - requires OTP verification via Web SDK",
          };
          newUsers.push({
            signer: signer.name,
            identifier: signerId,
            webSDKUrl: webSDKUrl,
            message: "First-time user - requires OTP verification via Web SDK",
          });
          console.log(`   🔗 Web SDK URL: ${webSDKUrl}`);
        } else {
          // Other errors
          console.error(`   ❌ FAILED - ${tokenResult.error}`);
          signingLinks[signerId] = {
            name: signer.name,
            url: null,
            error: tokenResult.error || "Token generation failed",
            errorDetails: tokenResult.details,
            status: tokenResult.status,
          };
          tokenErrors.push({
            signer: signer.name,
            identifier: signerId,
            error: tokenResult.error,
            details: tokenResult.details,
            status: tokenResult.status,
          });
        }
      }

      // Small delay between requests (500ms) to avoid rate limiting
      if (i < signers.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log("\n" + "=".repeat(60));
    const successCount = signers.length - tokenErrors.length;
    console.log(`✅ Token/link assignment completed: ${successCount}/${signers.length} successful`);
    if (newUsers.length > 0) {
      console.log(`ℹ️ First-time users requiring OTP: ${newUsers.length}`);
    }
    console.log("=".repeat(60) + "\n");

    // Prepare response message
    let message = "";
    if (tokenErrors.length === 0 && newUsers.length === 0) {
      message = "Signing request created successfully with all links generated";
    } else if (newUsers.length > 0 && tokenErrors.length === 0) {
      message = `Signing request created. ${newUsers.length} first-time user(s) need OTP verification via Web SDK`;
    } else if (tokenErrors.length > 0) {
      message = `Signing request created but ${tokenErrors.length} token(s) failed to generate`;
    }

    // Optional: email links to all email-identifiers
    const emailResults = {};
    const emailJobs = [];
    for (const [identifier, info] of Object.entries(signingLinks)) {
      if (!/@/.test(identifier)) continue;
      if (!info?.url) continue;

      const subject = `Action required: e-Signature for ${finalFileName}`;
      const html = renderSigningEmail({
        name: info.name,
        documentName: finalFileName,
        signingUrl: info.url,
        validTill: info.validTill,
        isNewUser: !!info.isNewUser,
      });

      emailJobs.push(
        sendMail({ to: identifier, subject, html })
          .then((r) => (emailResults[identifier] = { ok: true, messageId: r.messageId }))
          .catch((e) => (emailResults[identifier] = { ok: false, error: e.message }))
      );
    }
    if (emailJobs.length) await Promise.allSettled(emailJobs);

    // Prepare response
    const responseData = {
      ok: true,
      data,
      reference_id: uniqueRefId,
      document_id: documentId,
      signing_links: signingLinks,
      message: message,
    };

    if (Object.keys(emailResults).length) {
      responseData.email_results = emailResults;
    }

    // Add new users info if any
    if (newUsers.length > 0) {
      responseData.new_users = newUsers;
      responseData.info =
        "First-time users must complete OTP verification via Web SDK URL before signing";
    }

    // Add token errors if any
    if (tokenErrors.length > 0) {
      responseData.token_errors = tokenErrors;
      responseData.warning =
        "Some signing links could not be generated. Check token_errors for details.";
      console.warn(`⚠️ WARNING: ${tokenErrors.length} token(s) failed to generate`);
    }

    res.json(responseData);
  } catch (err) {
    console.error("\n❌ create-signing failed:", err.response?.data || err.message);
    console.error("Stack trace:", err.stack);

    const status = err.response?.status || 500;
    const errorData = err.response?.data || { message: err.message };

    res.status(status).json({
      ok: false,
      error: errorData.message || "Failed to create signing request",
      details: errorData,
    });
  }
};

const generateLink = async (req, res) => {
  try {
    const {
      document_id,
      documentId,
      identifier,
      email,
      mobile,
      send_email,
      name,
      document_name,
    } = req.body;

    const docId = document_id || documentId;
    const signerId = identifier || email || mobile;

    if (!docId) {
      return res.status(400).json({
        ok: false,
        error: "document_id is required",
      });
    }

    if (!signerId) {
      return res.status(400).json({
        ok: false,
        error: "identifier (email or mobile) is required",
      });
    }

    const normalizedId = normId(signerId);

    console.log("\n🔗 [Digio] Generating signing link...");
    console.log("📋 Document ID:", docId);
    console.log("👤 Identifier:", normalizedId);

    // First, check document status
    const statusUrl = `${DIGIO_BASE}/v2/client/document/${encodeURIComponent(docId)}`;
    const { data: statusData } = await axios.get(statusUrl, {
      headers: { Authorization: getAuthHeader() },
      timeout: 15000,
    });

    const parties = statusData.signing_parties || [];
    const party = parties.find((p) => sameIdentifier(p.identifier, normalizedId));

    if (!party) {
      return res.status(404).json({
        ok: false,
        error: `Signer with identifier '${signerId}' not found in document`,
      });
    }

    // Check if existing token is valid
    const hasValidToken =
      party.access_token?.id &&
      party.access_token?.valid_till &&
      !isTokenExpiringSoon(party.access_token.valid_till);

    if (hasValidToken) {
      const signingUrl = getSigningUrl(party.access_token.id);
      console.log("✅ Using existing valid token");
      console.log("🔗 Signing URL:", signingUrl);

      const payload = {
        ok: true,
        signingUrl,
        tokenId: party.access_token.id,
        validTill: party.access_token.valid_till,
        signerInfo: { name: party.name, identifier: party.identifier, status: party.status },
        message: "Existing signing link retrieved",
      };

      if (send_email && /@/.test(normalizedId)) {
        try {
          const html = renderSigningEmail({
            name: name || party.name,
            documentName: document_name || "Document",
            signingUrl,
            validTill: party.access_token.valid_till,
          });
          const subject = `Action required: e-Signature for ${document_name || "Document"}`;
          const r = await sendMail({ to: normalizedId, subject, html });
          payload.email = { ok: true, messageId: r.messageId };
        } catch (e) {
          payload.email = { ok: false, error: e.message };
        }
      }

      return res.json(payload);
    }

    // Try to generate new token
    const tokenResult = await generateTokenForSigner(docId, normalizedId);

    if (tokenResult.success) {
      console.log("✅ Token generated successfully");
      console.log("🔗 Signing URL:", tokenResult.signingUrl);

      const payload = {
        ok: true,
        signingUrl: tokenResult.signingUrl,
        tokenId: tokenResult.tokenId,
        validTill: tokenResult.validTill,
        signerInfo: { name: party.name, identifier: party.identifier, status: party.status },
        message: "New signing link generated",
      };

      if (send_email && /@/.test(normalizedId)) {
        try {
          const html = renderSigningEmail({
            name: name || party.name,
            documentName: document_name || "Document",
            signingUrl: tokenResult.signingUrl,
            validTill: tokenResult.validTill,
          });
          const subject = `Action required: e-Signature for ${document_name || "Document"}`;
          const r = await sendMail({ to: normalizedId, subject, html });
          payload.email = { ok: true, messageId: r.messageId };
        } catch (e) {
          payload.email = { ok: false, error: e.message };
        }
      }

      return res.json(payload);
    }

    if (tokenResult.isNewUser) {
      // First-time user - provide Web SDK URL
      const webSDKUrl = getWebSDKUrl(docId, normalizedId);
      console.log("ℹ️ First-time user - providing Web SDK URL");
      console.log("🔗 Web SDK URL:", webSDKUrl);

      const payload = {
        ok: true,
        isNewUser: true,
        requiresOTP: true,
        webSDKUrl: webSDKUrl,
        signerInfo: { name: party.name, identifier: party.identifier, status: party.status },
        message: "First-time user - requires OTP verification via Web SDK",
      };

      if (send_email && /@/.test(normalizedId)) {
        try {
          const html = renderSigningEmail({
            name: name || party.name,
            documentName: document_name || "Document",
            signingUrl: webSDKUrl,
            isNewUser: true,
          });
          const subject = `Start e-Signature (OTP Required) – ${document_name || "Document"}`;
          const r = await sendMail({ to: normalizedId, subject, html });
          payload.email = { ok: true, messageId: r.messageId };
        } catch (e) {
          payload.email = { ok: false, error: e.message };
        }
      }

      return res.json(payload);
    }

    // Token generation failed
    console.error("❌ Token generation failed:", tokenResult.error);

    return res.status(tokenResult.status || 500).json({
      ok: false,
      error: tokenResult.error,
      details: tokenResult.details,
      signerInfo: {
        name: party.name,
        identifier: party.identifier,
        status: party.status,
      },
    });
  } catch (err) {
    console.error("❌ Generate link error:", err.message);
    const status = err.response?.status || 500;
    res.status(status).json({
      ok: false,
      error: "Failed to generate signing link",
      details: err.response?.data || err.message,
    });
  }
};

const regenerateToken = async (req, res) => {
  try {
    const entity_id = req.body?.entity_id || req.body?.entityId || process.env.DIGIO_ENTITY_ID;
    const identifier = req.body?.identifier; // Optional - specific signer identifier

    if (!entity_id) {
      return res.status(400).json({
        ok: false,
        error: "entity_id is required (document ID from signing request)",
      });
    }

    const url = `${DIGIO_BASE}/user/auth/generate_token`;

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    };

    const payload = { entity_id };
    if (identifier) {
      payload.identifier = normId(identifier);
    }

    console.log("🔄 [Digio] Token regeneration request:", url);
    console.log("📋 Entity ID:", entity_id);
    if (identifier) console.log("👤 Identifier:", payload.identifier);

    const response = await axios.post(url, payload, {
      headers,
      timeout: 20000,
      validateStatus: () => true,
    });

    const { data, status } = response;
    console.log("🔁 [Digio] Token API Response Status:", status);
    console.log("📄 Response Data:", JSON.stringify(data, null, 2));

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
        expiresIn: tokenData.valid_till
          ? Math.floor((new Date(String(tokenData.valid_till).replace(" ", "T")) - new Date()) / 1000 / 60)
          : null, // Minutes until expiry
      };

      console.log("✅ [Digio] Token regenerated successfully");
      console.log("🔗 Signing URL:", tokenInfo.signingUrl);
      console.log("⏰ Valid for:", tokenInfo.expiresIn, "minutes");

      return res.json({
        ok: true,
        data,
        message: "Token regenerated successfully",
        tokenInfo,
      });
    } else if (status === 404 && data?.response?.code === "NO_USER_FOUND") {
      // First-time user
      const webSDKUrl = getWebSDKUrl(entity_id, identifier);
      return res.json({
        ok: true,
        isNewUser: true,
        requiresOTP: true,
        webSDKUrl: webSDKUrl,
        message: "First-time user - requires OTP verification via Web SDK",
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

    if (err.code === "ECONNREFUSED") {
      return res.status(503).json({
        ok: false,
        error: "Digio service unavailable - connection refused",
      });
    }

    if (err.code === "ETIMEDOUT") {
      return res.status(504).json({
        ok: false,
        error: "Digio service timeout",
      });
    }

    if (err.response) {
      // Check for NO_USER_FOUND in error response
      if (err.response.status === 404 && err.response.data?.response?.code === "NO_USER_FOUND") {
        const webSDKUrl = getWebSDKUrl(entity_id, identifier);
        return res.json({
          ok: true,
          isNewUser: true,
          requiresOTP: true,
          webSDKUrl: webSDKUrl,
          message: "First-time user - requires OTP verification via Web SDK",
        });
      }

      return res.status(err.response.status).json({
        ok: false,
        error: err.response.data?.message || "Digio API error",
        details: err.response.data,
      });
    }

    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: err.message,
    });
  }
};

const getSigningLink = async (req, res) => {
  try {
    const { entity_id, entityId, identifier } = (req.method === "GET" ? req.query : req.body) || {};
    const docId = entity_id || entityId;

    if (!docId) {
      return res.status(400).json({
        ok: false,
        error: "entity_id (document ID) is required",
      });
    }

    // Get current status to check if token exists
    const statusUrl = `${DIGIO_BASE}/v2/client/document/${encodeURIComponent(docId)}`;
    console.log("📊 [Digio] Status check for signing-link:", statusUrl);
    const { data: statusData } = await axios.get(statusUrl, {
      headers: { Authorization: getAuthHeader() },
      timeout: 15000,
    });

    const signingParties = statusData.signing_parties || [];
    if (!signingParties.length) {
      return res.status(404).json({
        ok: false,
        error: "No signing parties found",
      });
    }

    // If identifier provided, find specific party (case/format-insensitive)
    const party = identifier
      ? signingParties.find((p) => sameIdentifier(p.identifier, identifier))
      : signingParties[0]; // Default to first party

    if (!party) {
      return res.status(404).json({
        ok: false,
        error: identifier ? `Signer with identifier '${identifier}' not found` : "Signer not found",
      });
    }

    // Check if token exists and is valid
    const hasValidToken =
      party.access_token?.id &&
      party.access_token?.valid_till &&
      !isTokenExpiringSoon(party.access_token.valid_till);

    if (hasValidToken) {
      const tokenInfo = {
        entityId: docId,
        tokenId: party.access_token.id,
        validTill: party.access_token.valid_till,
        signingUrl: getSigningUrl(party.access_token.id),
        regenerated: false,
      };
      console.log("✅ Using existing valid token for", party.identifier);
      return res.json({
        ok: true,
        action: "use_token",
        tokenInfo,
        signerInfo: {
          name: party.name,
          identifier: party.identifier,
          status: party.status,
          type: party.type,
        },
        message: "Existing signing link retrieved",
      });
    }

    // Try to regenerate token for known users
    console.log("🔄 Token expired or missing, attempting regeneration...");
    const regenUrl = `${DIGIO_BASE}/user/auth/generate_token`;
    const payload = {
      entity_id: docId,
      identifier: normId(identifier || party.identifier),
    };
    console.log("📨 Regen payload:", payload);

    const resp = await axios.post(regenUrl, payload, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      timeout: 20000,
      validateStatus: () => true,
    });

    if (resp.status === 200 || resp.status === 201) {
      const token = resp.data?.response || resp.data || {};
      const tokenInfo = {
        entityId: token.entity_id,
        tokenId: token.id,
        validTill: token.valid_till,
        signingUrl: getSigningUrl(token.id),
        regenerated: true,
      };
      console.log("✅ Token regenerated successfully for", party.identifier);
      return res.json({
        ok: true,
        action: "use_token",
        tokenInfo,
        signerInfo: {
          name: party.name,
          identifier: party.identifier,
          status: party.status,
          type: party.type,
        },
        message: "New signing link generated",
      });
    }

    // If user is unknown, advise client to open Web SDK (no token)
    const code = resp.data?.response?.code;
    if (resp.status === 404 && code === "NO_USER_FOUND") {
      console.log("ℹ️ NO_USER_FOUND → advise Web SDK OTP for", party.identifier);
      const webSDKUrl = getWebSDKUrl(docId, party.identifier);
      return res.json({
        ok: true,
        action: "open_sdk",
        isNewUser: true,
        requiresOTP: true,
        webSDKUrl: webSDKUrl,
        sdkInit: {
          entity_id: docId,
          identifier: normId(identifier || party.identifier),
          environment: isProd ? "production" : "sandbox",
        },
        signerInfo: {
          name: party.name,
          identifier: party.identifier,
          status: party.status,
          type: party.type,
        },
        message: "First-time user - requires OTP verification via Web SDK",
      });
    }

    // Other API errors
    return res.status(resp.status || 500).json({
      ok: false,
      error: resp.data?.response?.message || resp.data?.message || "Digio token API error",
      details: resp.data,
    });
  } catch (err) {
    console.error("❌ Get signing link error:", err.message);
    const status = err.response?.status || 500;
    res.status(status).json({
      ok: false,
      error: "Failed to get signing link",
      details: err.response?.data || err.message,
    });
  }
};

const handleRedirect = (req, res) => {
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
  const target = frontendBase ? `${frontendBase.replace(/\/$/, "")}${path}` : path;

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
      note: "Would redirect (302) in browser.",
    });
  }

  console.log("↪️  [Digio] Redirecting user to:", target);
  return res.redirect(302, target);
};

const handleCallback = async (req, res) => {
  // ACK first to avoid retries piling up
  res.json({ ok: true, received: true });

  try {
    const body = req.body || {};

    // Optional shared secret check
    try {
      const expected = process.env.DIGIO_WEBHOOK_TOKEN;
      if (expected) {
        const got = req.get("x-webhook-token");
        if (!got || got !== expected) {
          console.warn("🔒 [Digio] Webhook token mismatch or missing");
          return;
        }
      }
    } catch {}

    // Idempotency (best-effort)
    const deliveryId =
      req.get("x-digio-delivery-id") ||
      body?.event_id ||
      body?.payload?.event_id ||
      (body?.payload?.id && (body?.payload?.event || body?.event)
        ? `${body.payload.id}:${body.payload.event || body.event}`
        : null);

    // TODO: if you keep an idempotency store, check & mark deliveryId here.

    // Extract document and reference IDs
    const docId =
      body?.payload?.id ||
      body?.payload?.document_id ||
      body?.payload?.digio_doc_id ||
      body?.document_id ||
      body?.digio_doc_id ||
      body?.id ||
      null;

    const referenceId = body?.payload?.reference_id || body?.reference_id || null;

    // Map status
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
        : "pending";

    console.log("📬 [Digio] Webhook received:", {
      docId,
      referenceId,
      mappedStatus,
      rawStatus,
      deliveryId,
      timestamp: new Date().toISOString(),
    });

    // TODO: Upsert into DB
    // await db.signingRequests.updateOne(
    //   { $or: [{ digio_doc_id: docId }, { reference_id: referenceId }] },
    //   {
    //     $set: {
    //       status: mappedStatus,
    //       webhook_json: body,
    //       updated_at: new Date(),
    //       last_delivery_id: deliveryId || null
    //     }
    //   },
    //   { upsert: true }
    // );

    // Example: on completion, you can download/store PDF or notify via email
    if (mappedStatus === "completed" && docId) {
      try {
        const statusUrl = `${DIGIO_BASE}/v2/client/document/${encodeURIComponent(docId)}`;
        const { data: sdata } = await axios.get(statusUrl, {
          headers: { Authorization: getAuthHeader() },
          timeout: 15000,
        });
        const signers = Array.isArray(sdata?.signing_parties) ? sdata.signing_parties : [];
        const signerEmails = signers
          .map((p) => p?.identifier)
          .filter((id) => typeof id === "string" && /@/.test(id));
        if (signerEmails.length && typeof sendMail === "function") {
          const subject = `e-Signature Completed – ${referenceId || docId}`;
          const html = `
            <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:auto;padding:16px;">
              <h3 style="margin:0 0 12px;">Your document is completed</h3>
              <p style="margin:8px 0;"><b>Document:</b> ${referenceId || docId}</p>
              <p style="margin:8px 0;"><b>When:</b> ${new Date().toLocaleString()}</p>
            </div>
          `;
          const jobs = [];
          for (const to of signerEmails) {
            jobs.push(
              sendMail({ to, subject, html }).catch((e) =>
                console.warn("✉️ email fail:", to, e.message)
              )
            );
          }
          if (process.env.MAIL_REPLY_TO) {
            jobs.push(
              sendMail({ to: process.env.MAIL_REPLY_TO, subject, html }).catch((e) =>
                console.warn("✉️ internal email fail:", e.message)
              )
            );
          }
          if (jobs.length) await Promise.allSettled(jobs);
        }
      } catch (e) {
        console.warn("ℹ️ post-completion follow-up skipped:", e.message);
      }
    }
  } catch (e) {
    console.error("❌ Webhook error (post-ACK):", e.message);
  }
};

const getStatus = async (req, res) => {
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
    const enhancedParties = signingParties.map((party) => ({
      ...party,
      signingUrl: party.access_token?.id ? getSigningUrl(party.access_token.id) : null,
      tokenExpired: party.access_token?.valid_till ? isTokenExpiringSoon(party.access_token.valid_till) : true,
    }));

    res.json({
      ok: true,
      data: {
        ...data,
        signing_parties: enhancedParties,
      },
    });
  } catch (e) {
    console.error("❌ Status failed:", e.response?.data || e.message);
    const status = e.response?.status || 500;
    res.status(status).json({
      ok: false,
      error: "Failed to fetch status",
      details: e.response?.data || e.message,
    });
  }
};

const downloadDocument = async (req, res) => {
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
    res.setHeader("Content-Disposition", `attachment; filename="document_${docId}.pdf"`);
    res.send(response.data);
  } catch (e) {
    console.error("❌ Download failed:", e.response?.data || e.message);
    const status = e.response?.status || 500;
    res.status(status).json({
      ok: false,
      error: "Failed to download document",
      details: e.response?.data || e.message,
    });
  }
};

const cancelDocument = async (req, res) => {
  try {
    const docId = req.params.docId;
    if (!docId) {
      return res.status(400).json({ ok: false, error: "Document ID required" });
    }

    const url = `${DIGIO_BASE}/v2/client/document/${encodeURIComponent(docId)}/cancel`;
    console.log("🛑 [Digio] Cancel:", url);

    const { data } = await axios.delete(url, {
      headers: { Authorization: getAuthHeader() },
      timeout: 15000,
    });

    res.json({ ok: true, data, message: "Document cancelled successfully" });
  } catch (e) {
    console.error("❌ Cancel failed:", e.response?.data || e.message);
    const status = e.response?.status || 500;
    res.status(status).json({
      ok: false,
      error: "Failed to cancel document",
      details: e.response?.data || e.message,
    });
  }
};

module.exports = {
  healthCheck,
  authCheck,
  createSigning,
  generateLink,
  regenerateToken,
  getSigningLink,
  handleRedirect,
  handleCallback,
  getStatus,
  downloadDocument,
  cancelDocument,
};
