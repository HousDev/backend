// routes/integration.routes.js
const express = require("express");
const router = express.Router();
const integrationController = require("../controllers/integration.controller");
const { verifyToken } = require("../middleware/authJwt");


// All integration routes require authentication
router.use(verifyToken);

// GET /integrations — all tabs at once (grouped by tab column)
router.get("/", integrationController.getAllIntegrations);

// GET /integrations/:tab — fetch single tab by tab column value
router.get("/:tab", integrationController.getIntegrationByTab);

// POST /integrations/:tab — save config (upserts by tab+setting_key)
router.post("/:tab", integrationController.saveIntegrationConfig);

// PATCH /integrations/:tab/toggle — enable/disable
router.patch("/:tab/toggle", integrationController.toggleIntegration);

// DELETE /integrations/:tab — clear config
router.delete("/:tab", integrationController.clearIntegrationConfig);

// GET /integrations/:tab/validate — validate required settings
router.get("/:tab/validate", integrationController.validateIntegration);

module.exports = router;