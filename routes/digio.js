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
// routes/digioRoutes.js
router.post("/webhook", express.json({ limit: "50mb" }), digioController.webhook);

module.exports = router;
