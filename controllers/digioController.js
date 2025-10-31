// controllers/digioController.js
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { DIGIO_BASE, getAuthHeader } = require("../config/digio");
const DigioDocument = require("../models/DigioDocument");

// coerce "true"/"false"/1/0 → boolean
const toBool = (v) => (typeof v === "boolean" ? v : /^true|1$/i.test(String(v || "").trim()));

// Parse filename from headers
function getFilenameFromHeaders(headers, fallback) {
  const cd = headers["content-disposition"] || "";
  const m = cd.match(/filename\*?=(?:UTF-8''|")?([^\";\n]+)/i);
  if (m && m[1]) return decodeURIComponent(m[1].replace(/"/g, ""));
  return fallback;
}

/**
 * POST /api/digio/uploadpdf
 * Body: { local_document_id?, file_name, file_data(base64), signers[], expire_in_days?, display_on_page?, notify_signers?, ... }
 */
exports.uploadPdf = async (req, res) => {
  try {
    const body = req.body || {};
    const localDocumentId = body.local_document_id ?? null; // <-- ✅ ADDED

    // required
    if (!body.file_name) {
      return res.status(400).json({ success: false, message: "file_name is required" });
    }
    if (!body.file_data) {
      return res.status(400).json({ success: false, message: "file_data (base64) is required" });
    }
    if (!Array.isArray(body.signers) || body.signers.length === 0) {
      return res.status(400).json({ success: false, message: "signers[] is required" });
    }

    const payload = {
      signers: body.signers,                                          // 1..N signers
      expire_in_days: Number(body.expire_in_days ?? 10),
      display_on_page: body.display_on_page || "custom",
      notify_signers: toBool(body.notify_signers),
      send_sign_link: toBool(body.send_sign_link),
      file_name: body.file_name,
      generate_access_token: toBool(body.generate_access_token),
      include_authentication_url: toBool(body.include_authentication_url),
      file_data: body.file_data,                                      // pure base64
      sign_coordinates: body.sign_coordinates || undefined,
    };

    // Optional: verify sign_coordinates keys
    if (payload.sign_coordinates) {
      const ids = new Set(payload.signers.map((s) => s.identifier));
      for (const k of Object.keys(payload.sign_coordinates)) {
        if (!ids.has(k)) {
          return res.status(400).json({
            success: false,
            message: `sign_coordinates key "${k}" not present in signers[].identifier`,
          });
        }
      }
    }

    // Call Digio
    const { data } = await axios.post(
      `${DIGIO_BASE}/v2/client/document/uploadpdf`,
      payload,
      {
        headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
        timeout: 60000,
      }
    );

    // Save to DB (✅ pass local_document_id)
    await DigioDocument.upsertFromResponse(data, localDocumentId);

    return res.status(200).json({
      success: true,
      digio_id: data.id,
      status: data.agreement_status,
      local_document_id: localDocumentId, // optional echo
      data,
    });
  } catch (err) {
    const e = err.response?.data || { message: err.message };
    return res.status(500).json({ success: false, error: e });
  }
};

/**
 * GET /api/digio/document/:documentId
 * Optional: ?local_document_id=123
 * Digio Details API: GET /v2/client/document/{id}
 */
exports.getDetails = async (req, res) => {
  try {
    const { documentId } = req.params;

    // 1) query param को लो (optional)
    const hintedLocalIdRaw = req.query?.local_document_id ?? null;
    const hintedLocalId = hintedLocalIdRaw != null && hintedLocalIdRaw !== ''
      ? Number(hintedLocalIdRaw)
      : null;

    if (!documentId) {
      return res.status(400).json({ success: false, message: "documentId is required" });
    }

    // 2) DB से पहले से mapped local_document_id निकालने की कोशिश
    const rowBefore = await DigioDocument.getByDigioId(documentId);
    const derivedLocalId = hintedLocalId ?? rowBefore?.local_document_id ?? null;

    // 3) Digio से latest details
    const { data } = await axios.get(
      `${DIGIO_BASE}/v2/client/document/${encodeURIComponent(documentId)}`,
      { headers: { Authorization: getAuthHeader() }, timeout: 60000 }
    );

    // 4) Upsert + mapping (अगर derivedLocalId null नहीं है तो save कर दो)
    await DigioDocument.upsertFromDetails(data, derivedLocalId);

    // 5) अब DB से final row पढ़ो (ताकि latest mapping मिल जाए)
    const rowAfter = await DigioDocument.getByDigioId(documentId);

    // 6) Response में local_document_id भी भेजो
    return res.status(200).json({
      success: true,
      digio_id: data.id,
      status: data.agreement_status || data.status || null,
      local_document_id: rowAfter?.local_document_id ?? derivedLocalId ?? null,
      data,           // raw Digio payload
      db: rowAfter || null, // optional: आपकी DB snapshot/debug के लिए उपयोगी
    });
  } catch (err) {
    const e = err.response?.data || { message: err.message };
    return res.status(err.response?.status || 500).json({ success: false, error: e });
  }
};


/**
 * POST /api/digio/document/:documentId/cancel
 * Digio Cancel API: POST /v2/client/document/{id}/cancel
 * Body (optional): { reason: "..." }
 */
exports.cancelDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const reason = req.body?.reason || undefined;
    if (!documentId) return res.status(400).json({ success: false, message: "documentId is required" });

    const { data } = await axios.post(
      `${DIGIO_BASE}/v2/client/document/${encodeURIComponent(documentId)}/cancel`,
      reason ? { reason } : {},
      { headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" }, timeout: 60000 }
    );

    // Digio typically returns updated details or a minimal object; try to persist status
    const newStatus = data?.agreement_status || data?.status || "cancelled";
    await DigioDocument.setStatusAndSnapshot(documentId, newStatus, data);

    return res.status(200).json({ success: true, status: newStatus, data });
  } catch (err) {
    const e = err.response?.data || { message: err.message };
    return res.status(err.response?.status || 500).json({ success: false, error: e });
  }
};


// controllers/digioController.js
exports.getStatusByLocalId = async (req, res) => {
  try {
    const localId = Number(req.params.local_document_id);
    if (!localId) {
      return res.status(400).json({ success: false, message: "local_document_id is required" });
    }

    const row = await DigioDocument.getByLocalId(localId);
    if (!row) {
      return res.status(404).json({ success: false, message: "No digio document mapped with this local_document_id" });
    }

    // Optionally: Digio से refresh कर सकते हैं (latest status)
    // const { data } = await axios.get(`${DIGIO_BASE}/v2/client/document/${encodeURIComponent(row.digio_id)}`, { headers: { Authorization: getAuthHeader() }});
    // await DigioDocument.upsertFromDetails(data, localId);
    // const refreshed = await DigioDocument.getByDigioId(row.digio_id);

    return res.status(200).json({
      success: true,
      local_document_id: localId,
      digio_id: row.digio_id,
      status: row.status,
      row,
    });
  } catch (err) {
    const e = err.response?.data || { message: err.message };
    return res.status(err.response?.status || 500).json({ success: false, error: e });
  }
};


/**
 * GET /api/digio/document/:documentId/download?inline=0&save=0
 * Digio Download API: GET /v2/client/document/download?document_id={id}
 */
exports.downloadDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const inline = String(req.query.inline || "0") === "1";
    const saveToDisk = String(req.query.save || "0") === "1";

    if (!documentId) {
      return res.status(400).json({ success: false, message: "documentId is required" });
    }

    const url = `${DIGIO_BASE}/v2/client/document/download?document_id=${encodeURIComponent(documentId)}`;

    const digioRes = await axios.get(url, {
      headers: { Authorization: getAuthHeader() },
      responseType: "arraybuffer",
      timeout: 60000,
    });

    const contentType = digioRes.headers["content-type"] || "application/pdf";
    const fileName = getFilenameFromHeaders(digioRes.headers, `${documentId}.pdf`);
    const dispositionType = inline ? "inline" : "attachment";

    if (saveToDisk) {
      const outDir = path.join(process.cwd(), "digio_downloads");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, fileName);
      fs.writeFileSync(outPath, digioRes.data);
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `${dispositionType}; filename="${fileName}"`);
    res.status(200).send(digioRes.data);
  } catch (err) {
    const e = err.response?.data || { message: err.message };
    // if Digio returned JSON error as buffer, try to forward
    if (Buffer.isBuffer(e)) {
      try {
        const s = e.toString();
        if (s.startsWith("{")) return res.status(err.response?.status || 500).json(JSON.parse(s));
      } catch (_) {}
    }
    return res.status(err.response?.status || 500).json({ success: false, error: e });
  }
};



// exports.webhook = async (req, res) => {
//   try {
//     const body = req.body || {};
//     const digio_id = body.id || body.document_id;

//     if (!digio_id) {
//       return res.status(400).json({ success: false, message: "Missing digio_id" });
//     }

//     // Typical webhook fields: id, status, agreement_status, event_type, etc.
//     const newStatus = body.agreement_status || body.status || body.event || "unknown";

//     // Update DB
//     await DigioDocument.setStatusAndSnapshot(digio_id, newStatus, body);

//     console.log("✅ Digio webhook received:", digio_id, newStatus);

//     return res.status(200).json({ success: true });
//   } catch (err) {
//     console.error("❌ Webhook error:", err.message);
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };


// controllers/digioController.js
exports.webhook = async (req, res) => {
  try {
    // Verify webhook signature (if Digio provides)
    const signature = req.headers['x-digio-signature'];
    if (!verifyWebhookSignature(signature, req.body)) {
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const body = req.body || {};
    const digio_id = body.id || body.document_id;

    if (!digio_id) {
      return res.status(400).json({ success: false, message: "Missing digio_id" });
    }

    // Process different webhook events
    await processWebhookEvent(body);

    console.log("✅ Digio webhook processed:", digio_id, body.event_type);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

async function processWebhookEvent(event) {
  const { id: digio_id, event_type, agreement_status } = event;
  
  switch (event_type) {
    case 'document.completed':
      // Handle completed document
      await DigioDocument.setStatusAndSnapshot(digio_id, 'completed', event);
      await triggerPostCompletionActions(digio_id);
      break;
      
    case 'document.expired':
      await DigioDocument.setStatusAndSnapshot(digio_id, 'expired', event);
      break;
      
    case 'document.declined':
      await DigioDocument.setStatusAndSnapshot(digio_id, 'declined', event);
      break;
      
    default:
      await DigioDocument.setStatusAndSnapshot(digio_id, agreement_status, event);
  }
}

exports.listDocuments = async (req, res) => {
  try {
    const {
      page,
      limit,
      q,
      status,
      from,
      to,
      orderBy,
      order,
    } = req.query;

    const result = await DigioDocument.list({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q,
      status,
      from,
      to,
      orderBy,
      order,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("listDocuments error:", err);
    res.status(500).json({
      success: false,
      error: err?.message || "Failed to fetch digio documents",
    });
  }
};

exports.getAllDocuments = async (req, res) => {
  try {
    const docs = await DigioDocument.getAll();
    res.json({ success: true, data: docs });
  } catch (error) {
    console.error("Error fetching Digio documents:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};