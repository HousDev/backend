// routes/emailIntegrationRoutes.js
const express = require("express");
const router = express.Router();
const emailCtrl = require("../controllers/emailIntegrationController");

// GET current email integration
router.get("/", emailCtrl.getEmailIntegration);

// SAVE / UPDATE email integration
router.post("/", emailCtrl.saveEmailIntegration);

// TOGGLE active/inactive
router.post("/toggle", emailCtrl.toggleEmailIntegration);

// SYNC / refresh timestamp
router.post("/sync", emailCtrl.syncEmailIntegration);

module.exports = router;
