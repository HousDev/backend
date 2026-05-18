// controllers/backupController.js
"use strict";

const multer      = require("multer");
const BackupLog   = require("../models/BackupLog");
const { exportEntity, generateTemplate } = require("../services/exportService");
const { importEntity }                   = require("../services/importService");

/* ── multer (50 MB in-memory) ─────────────────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|xlsx|xls|json)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only CSV, XLSX, XLS and JSON files are allowed"), ok);
  },
});
exports.uploadMiddleware = upload.single("file");

/* ── guards ───────────────────────────────────────────────────── */
const VALID_ENTITIES = ["leads","buyers","sellers","properties","users"];
const VALID_FORMATS  = ["csv","xlsx","json","pdf"];

const guardEntity = (e) => {
  if (!VALID_ENTITIES.includes(e))
    throw Object.assign(new Error(`Invalid entity. Use: ${VALID_ENTITIES.join(", ")}`), { status: 400 });
};
const guardFormat = (f) => {
  if (!VALID_FORMATS.includes(f))
    throw Object.assign(new Error(`Invalid format. Use: ${VALID_FORMATS.join(", ")}`), { status: 400 });
};

const uid = (req) => req.user?.id ?? req.userId ?? req.auth?.id ?? null;

/* ================================================================
   POST /api/backup/import/:entity
   multipart/form-data, field = "file"
================================================================ */
exports.importData = async (req, res) => {
  try {
    const entity = req.params.entity?.toLowerCase();
    guardEntity(entity);
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const { buffer, mimetype, originalname, size } = req.file;

    // Log as "processing" immediately
    const log = await BackupLog.create({
      operation: "import", entity,
      filename:    originalname,
      file_format: originalname.split(".").pop().toLowerCase() || "csv",
      file_size:   size,
      status:      "processing",
      performed_by: uid(req),
    });

    try {
      const result = await importEntity(entity, buffer, mimetype, originalname, {
        created_by: uid(req),
      });

      await BackupLog.update(log.id, {
        status:          "completed",
        total_records:   result.total,
        success_records: result.inserted,
        failed_records:  result.skipped,
        error_log:       result.skippedRows?.length ? result.skippedRows : null,
      });

      return res.status(200).json({
        success:      true,
        message:      "Import completed",
        log_id:       log.id,
        total:        result.total,
        inserted:     result.inserted,
        skipped:      result.skipped,
        skippedRows:  result.skippedRows,
        insertedRows: result.insertedRows,
      });
    } catch (err) {
      await BackupLog.update(log.id, { status: "failed", error_log: [{ reason: err.message }] });
      throw err;
    }
  } catch (err) {
    console.error("importData:", err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Import failed" });
  }
};

/* ================================================================
   GET /api/backup/export/:entity?format=csv
   Called from ANY page (Leads page, Buyers page, etc.)
   → pulls live data from that entity's table → returns file
   → logs the export in backup_logs
================================================================ */
exports.exportData = async (req, res) => {
  try {
    const entity = req.params.entity?.toLowerCase();
    const format = (req.query.format || "csv").toLowerCase();
    guardEntity(entity);
    guardFormat(format);

    const log = await BackupLog.create({
      operation: "export", entity,
      file_format: format, status: "processing",
      performed_by: uid(req),
    });

    try {
      const { buffer, mime, ext, count } = await exportEntity(entity, format);
      const filename = `${entity}_${Date.now()}.${ext}`;

      await BackupLog.update(log.id, {
        status: "completed", filename,
        file_size:       buffer.length,
        total_records:   count,
        success_records: count,
      });

      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", buffer.length);
      return res.send(buffer);
    } catch (err) {
      await BackupLog.update(log.id, { status: "failed", error_log: [{ reason: err.message }] });
      throw err;
    }
  } catch (err) {
    console.error("exportData:", err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Export failed" });
  }
};

/* ================================================================
   GET /api/backup/template/:entity?format=csv
================================================================ */
exports.downloadTemplate = async (req, res) => {
  try {
    const entity = req.params.entity?.toLowerCase();
    const format = (req.query.format || "csv").toLowerCase();
    guardEntity(entity);
    if (!["csv","xlsx"].includes(format))
      return res.status(400).json({ success: false, message: "Template format must be csv or xlsx" });

    const { buffer, mime, ext } = await generateTemplate(entity, format);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${entity}_template.${ext}"`);
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);
  } catch (err) {
    console.error("downloadTemplate:", err);
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

/* ================================================================
   GET /api/backup/history?operation=&entity=&status=&page=&limit=
================================================================ */
exports.getHistory = async (req, res) => {
  try {
    const { operation, entity, status } = req.query;
    const page  = Math.max(1,   parseInt(req.query.page  || "1",  10));
    const limit = Math.min(100, parseInt(req.query.limit || "10", 10));
    const result = await BackupLog.list({ operation, entity, status, page, limit });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("getHistory:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
   GET /api/backup/stats
================================================================ */
exports.getStats = async (req, res) => {
  try {
    const stats = await BackupLog.stats();
    return res.status(200).json({ success: true, ...stats });
  } catch (err) {
    console.error("getStats:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
   DELETE /api/backup/history/:id
================================================================ */
exports.deleteHistory = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ success: false, message: "Invalid id" });
    const result = await BackupLog.delete(id);
    if (!result.deleted)
      return res.status(404).json({ success: false, message: "Record not found" });
    return res.status(200).json({ success: true, message: "Deleted", id });
  } catch (err) {
    console.error("deleteHistory:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};