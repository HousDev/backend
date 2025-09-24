const express = require("express");
const router = express.Router();
const systemSettingsController = require("../controllers/systemSettings.controller");


// NO auth here (read-only)
router.get("/", systemSettingsController.getSystemSettings);

module.exports = router;



