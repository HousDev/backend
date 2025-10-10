// routes/documentStatus.routes.js
// -----------------------------------------------------------------------------
// Mount with: app.use('/api/doc-status', router)
// -----------------------------------------------------------------------------

const express = require("express");
const ctrl = require("../controllers/documentStatus.controller");

const router = express.Router();

// Snapshot / History / Timeline
router.get("/documents/:id/snapshot", ctrl.getSnapshot);
router.get("/documents/:id/history",  ctrl.getHistory);
router.get("/documents/:id/timeline", ctrl.getTimeline);

// Status updates (stored procedure)
router.post("/documents/:id/status", ctrl.setStatus);

// Share batches
router.post("/documents/:id/share-batches",   ctrl.createShareBatch);
router.get ("/documents/:id/share-batches",   ctrl.listShareBatches);
router.get ("/share-batches/:batchId/recipients", ctrl.getShareRecipients);

// OTP & E-sign events
router.post("/documents/:id/otp-events",   ctrl.logOtpEvent);
router.post("/documents/:id/esign-events", ctrl.logEsignEvent);

router.get("/status-catalog", ctrl.getCatalog);
router.post("/documents/bulk-status", ctrl.bulkSetStatus);

// share batches
router.post('/documents/:id/share-batches', ctrl.createShareBatch);
router.get('/documents/:id/share-batches', ctrl.listShareBatches);
router.get('/share-batches/:batchId/recipients', ctrl.getShareRecipients);

// otp
router.post('/documents/:id/otp/request', ctrl.requestOtp);
router.post('/documents/:id/otp/verify',  ctrl.verifyOtp);

// events (manual esign logs if needed)
router.post('/documents/:id/otp-events',   ctrl.logOtpEvent);
router.post('/documents/:id/esign-events', ctrl.logEsignEvent);

module.exports = router;
