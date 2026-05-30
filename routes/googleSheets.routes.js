const express = require("express");
const router = express.Router();
const googleSheetsController = require("../controllers/googleSheets.controller");

// Import Google Sheet data
router.post("/import", googleSheetsController.importGoogleSheet);

// Validate Google Sheet URL
router.post("/validate-url", googleSheetsController.validateGoogleSheet);

module.exports = router;
