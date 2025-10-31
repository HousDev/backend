// routes/digioRoutes.js
const express = require("express");
const router = express.Router();
const digioController = require("../controllers/digioController");

// Create/upload for e-sign
router.post("/uploadpdf", digioController.uploadPdf);

// Details
router.get("/document/:documentId", digioController.getDetails);

// Cancel
router.post("/document/:documentId/cancel", digioController.cancelDocument);

// Download
router.get("/document/:documentId/download", digioController.downloadDocument);
router.get("/status/:local_document_id", digioController.getStatusByLocalId);

// routes/digioRoutes.js
router.post("/webhook", express.json({ limit: "50mb" }), digioController.webhook);
// GET /digio/documents?Page/filters/sort
router.get("/documents", digioController.listDocuments);

router.get("/documents/get-all", digioController.getAllDocuments);
module.exports = router;
