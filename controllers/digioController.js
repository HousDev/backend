// controllers/digioController.js
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { DIGIO_BASE, getAuthHeader } = require("../config/digio");
const DigioDocument = require("../models/DigioDocument");
const os = require("os");
const { execFile } = require("child_process");
const DigioFile = require("../models/DigioFile");
function sendInlineHeaders(res, fileName = "document.pdf", mime = "application/pdf") {
  res.setHeader("Content-Type", mime || "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${String(fileName).replace(/"/g, "")}"`);
  res.setHeader("Cache-Control", "no-store");
  // If helmet/frameguard sets X-Frame-Options, remove or override:
  // res.setHeader("X-Frame-Options", "ALLOWALL");
}
// coerce "true"/"false"/1/0 → boolean
const toBool = (v) => (typeof v === "boolean" ? v : /^true|1$/i.test(String(v || "").trim()));

const { UPLOAD_ROOT, makeUploadTarget } = require("../middleware/upload"); // ⬅️ reuse your multer helpers

function safeFileName(name, fallback = "document.pdf") {
  const n = String(name || fallback).replace(/[^a-zA-Z0-9._-]/g, "_");
  return n.toLowerCase().endsWith(".pdf") ? n : `${n}.pdf`;
}

function resolveDiskAbs(disk_path) {
  if (!disk_path) return null;
  // Prefer relative stored paths like "/documents/..../file.pdf"
  if (path.isAbsolute(disk_path) && fs.existsSync(disk_path)) return disk_path; // old absolute
  return path.join(UPLOAD_ROOT, disk_path); // relative → absolute
}


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



// new apis 

// POST /api/digio/document/:documentId/save?storage=db|disk&local_document_id=123
exports.saveSignedPdf = async (req, res) => {
  try {
    const { documentId } = req.params;
    if (!documentId) return res.status(400).json({ success: false, message: "documentId required" });

    const storage = String(req.query.storage || "db").toLowerCase(); // 'db' | 'disk'
    const hintedLocalIdRaw = req.query?.local_document_id ?? null;
    const local_document_id = hintedLocalIdRaw != null && hintedLocalIdRaw !== "" ? Number(hintedLocalIdRaw) : null;

    // 1) Pull the signed PDF from Digio
    const url = `${DIGIO_BASE}/v2/client/document/download?document_id=${encodeURIComponent(documentId)}`;
    const digioRes = await axios.get(url, {
      headers: { Authorization: getAuthHeader() },
      responseType: "arraybuffer",
      timeout: 60000,
    });

    const contentType = digioRes.headers["content-type"] || "application/pdf";
    const fileName = getFilenameFromHeaders(digioRes.headers, `${documentId}.pdf`);
    const buf = Buffer.from(digioRes.data);
    const size = buf.length;

    // 2) Persist as requested
    let result;
   if (storage === "disk") {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm   = String(now.getMonth() + 1).padStart(2, "0");

  const fileNameSafe = safeFileName(fileName, `${documentId}.pdf`);

  // e.g. /var/www/uploads/documents/digio/YYYY/MM/<fileName>
  const { absPath, publicUrl } = makeUploadTarget("documents", "digio", yyyy, mm, fileNameSafe);
  await fs.promises.writeFile(absPath, buf);

  // store relative path (better for portability/backups)
  const disk_path = absPath.replace(UPLOAD_ROOT, "").replace(/\\/g, "/");

  result = await DigioFile.upsertDiskCopy({
    digio_id: documentId,
    local_document_id,
    file_name: fileNameSafe,
    mime_type: contentType,
    bytes: size,
    disk_path, // ✅ relative
  });

  // return me helpful info
  result.public_url = publicUrl;
} else {
  // default: db
  result = await DigioFile.upsertDbCopy({
    digio_id: documentId,
    local_document_id,
    file_name: safeFileName(fileName, `${documentId}.pdf`),
    mime_type: contentType,
    buffer: buf,
  });
}


    return res.status(200).json({
      success: true,
      ...result,
      file_name: fileName,
      mime_type: contentType,
      byte_size: size,
    });
  } catch (err) {
    const e = err.response?.data || { message: err.message };
    return res.status(err.response?.status || 500).json({ success: false, error: e });
  }
};

// GET /api/digio/saved/:documentId (inline stream from DB or disk)
exports.getSavedPdf = async (req, res) => {
  try {
    const { documentId } = req.params;
    if (!documentId) return res.status(400).json({ success: false, message: "documentId required" });

    const row = await DigioFile.getByDigioId(documentId);
    if (!row) return res.status(404).json({ success: false, message: "No saved copy for this digio_id" });

    const fileName = row.file_name || `${documentId}.pdf`;
    const mime = row.mime_type || "application/pdf";

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);

  if (row.storage === "disk" && row.disk_path) {
  const abs = resolveDiskAbs(row.disk_path); // ⬅️ NEW
  if (!abs || !fs.existsSync(abs)) {
    return res.status(404).json({ success: false, message: "Saved file not found on disk" });
  }
  return fs.createReadStream(abs).pipe(res);
}


    if (row.storage === "db" && row.pdf_blob) {
      const buf = Buffer.from(row.pdf_blob);
      res.setHeader("Content-Length", String(buf.length));
      return res.status(200).end(buf);
    }

    return res.status(500).json({ success: false, message: "Invalid saved record" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "Failed to read saved PDF" });
  }
};

// GET /api/digio/saved/:documentId/download  (force download)
exports.downloadSavedPdf = async (req, res) => {
  try {
    const { documentId } = req.params;
    if (!documentId) return res.status(400).json({ success: false, message: "documentId required" });

    const row = await DigioFile.getByDigioId(documentId);
    if (!row) return res.status(404).json({ success: false, message: "No saved copy for this digio_id" });

    const fileName = row.file_name || `${documentId}.pdf`;
    const mime = row.mime_type || "application/pdf";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    if (row.storage === "disk" && row.disk_path) {
      if (!fs.existsSync(row.disk_path)) {
        return res.status(404).json({ success: false, message: "Saved file not found on disk" });
      }
      return fs.createReadStream(row.disk_path).pipe(res);
    }

    if (row.storage === "db" && row.pdf_blob) {
      const buf = Buffer.from(row.pdf_blob);
      res.setHeader("Content-Length", String(buf.length));
      return res.status(200).end(buf);
    }

    return res.status(500).json({ success: false, message: "Invalid saved record" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "Failed to download saved PDF" });
  }
};



/** GET /preview/:digio_id?/:local_document_id? */
exports.previewDocument = async (req, res) => {
   console.log("[PREVIEW HIT]", req.query);
  try {
    const digio_id = (req.params.digio_id || "").trim();
    const local_document_id = req.params.local_document_id ? Number(req.params.local_document_id) : null;

    if (!digio_id && !local_document_id) {
      return res.status(400).json({ success: false, message: "digio_id or local_document_id required" });
    }

    // 1) Try local record by digio_id then by local id
    let file = null;
    if (digio_id) file = await DigioFile.getByDigioId(digio_id);
    if (!file && local_document_id) file = await DigioFile.getByLocalId(local_document_id);

    // 2) DB blob
    if (file && file.storage === "db" && file.pdf_blob) {
      sendInlineHeaders(res, file.file_name || "document.pdf", file.mime_type);
      return Buffer.isBuffer(file.pdf_blob) ? res.end(file.pdf_blob) : res.end(Buffer.from(file.pdf_blob));
    }

    // 3) Disk file
    if (file && file.storage === "disk" && file.disk_path) {
      const abs = path.resolve(file.disk_path);
      if (fs.existsSync(abs)) {
        sendInlineHeaders(res, file.file_name || path.basename(abs), file.mime_type);
        return fs.createReadStream(abs).pipe(res);
      }
      // else fall through to remote fetch
    }

    // 4) Fallback: live stream from Digio when we have a digio_id (either URL param or from record)
    let effective = digio_id || (file && file.digio_id);
    if (effective) {
      const url = `${DIGIO_BASE}/v2/client/document/${encodeURIComponent(effective)}/download`;
      const headers = await getAuthHeader();
      const resp = await axios.get(url, {
        headers: { ...headers, Accept: "application/pdf" },
        responseType: "stream",
        validateStatus: () => true
      });

      if (resp.status >= 200 && resp.status < 300) {
        sendInlineHeaders(res, (file && file.file_name) || "document.pdf", "application/pdf");
        return resp.data.pipe(res);
      }
      return res.status(resp.status || 502).json({ success: false, message: "Digio download failed", digio_status: resp.status });
    }

    // 5) Nothing available
    return res.status(404).json({ success: false, message: "Preview not available (no local copy and no digio_id)" });
  } catch (err) {
    console.error("previewDocument error:", err);
    return res.status(500).json({ success: false, error: err?.message || "Internal error" });
  }
};




function setDispHeaders(res, filename, mime, inline=true) {
  res.setHeader("Content-Type", mime || "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="${String(filename || "document.pdf").replace(/"/g, "")}"`
  );
  res.setHeader("Cache-Control", "no-store");
}

function safeName(name, fallback="document.pdf") {
  const n = String(name || fallback).replace(/[^a-zA-Z0-9._-]/g, "_");
  return n.toLowerCase().endsWith(".pdf") ? n : `${n}.pdf`;
}

function resolveDiskAbs(disk_path) {
  if (!disk_path) return null;
  if (path.isAbsolute(disk_path) && fs.existsSync(disk_path)) return disk_path; // legacy absolute
  return path.join(UPLOAD_ROOT, disk_path); // relative → absolute
}

/**
 * GET /api/digio/preview?digio_id=...&local_document_id=...&download=0&filename=...
 * Priority: saved copy (disk/db) -> live Digio stream (if digio_id available)
 */
exports.previewSignedPdf = async (req, res) => {
   console.log("[PREVIEW HIT]", req.query);
  try {
    const digio_id = (req.query.digio_id || "").trim();
    const local_document_id = req.query.local_document_id ? Number(req.query.local_document_id) : null;
    const forceDownload = String(req.query.download || "0") === "1";
    const filenameOverride = req.query.filename ? safeName(req.query.filename) : null;

    if (!digio_id && !local_document_id) {
      return res.status(400).json({ success: false, message: "digio_id or local_document_id is required" });
    }

    // 1) Find saved record (prefer digio_id, else local)
    let rec = null;
    if (digio_id) rec = await DigioFile.getByDigioId(digio_id);
    if (!rec && local_document_id) rec = await DigioFile.getByLocalId(local_document_id);

    // 2) Serve from DB blob
    if (rec && rec.storage === "db" && rec.pdf_blob) {
      const name = filenameOverride || rec.file_name || (digio_id ? `${digio_id}.pdf` : "document.pdf");
      setDispHeaders(res, name, rec.mime_type, !forceDownload);
      const buf = Buffer.isBuffer(rec.pdf_blob) ? rec.pdf_blob : Buffer.from(rec.pdf_blob);
      return res.status(200).end(buf);
    }

    // 3) Serve from disk
    if (rec && rec.storage === "disk" && rec.disk_path) {
      const abs = resolveDiskAbs(rec.disk_path);
      if (abs && fs.existsSync(abs)) {
        const name = filenameOverride || rec.file_name || path.basename(abs);
        setDispHeaders(res, name, rec.mime_type, !forceDownload);
        return fs.createReadStream(abs).pipe(res);
      }
      // fallthrough → try live
    }

    // 4) Live stream from Digio (requires digio_id)
    const effectiveId = digio_id || (rec && rec.digio_id);
    if (effectiveId) {
      const url = `${DIGIO_BASE}/v2/client/document/download?document_id=${encodeURIComponent(effectiveId)}`;
      const resp = await axios.get(url, {
        headers: { Authorization: getAuthHeader(), Accept: "application/pdf" },
        responseType: "stream",
        validateStatus: () => true,
      });

      if (resp.status >= 200 && resp.status < 300) {
        const name = filenameOverride || (rec && rec.file_name) || `${effectiveId}.pdf`;
        setDispHeaders(res, name, "application/pdf", !forceDownload);
        return resp.data.pipe(res);
      }
      return res
        .status(resp.status || 502)
        .json({ success: false, message: "Digio live download failed", digio_status: resp.status });
    }

    // 5) Nothing available
    return res.status(404).json({ success: false, message: "No saved copy and no digio_id to fetch live" });
  } catch (err) {
    console.error("previewSignedPdf error:", err);
    return res.status(500).json({ success: false, error: err?.message || "Internal error" });
  }
};