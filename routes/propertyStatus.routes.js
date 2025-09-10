const express = require("express");
const router = express.Router();
const statusCtrl = require("../controllers/propertyStatus.controller");

// Update status + add history (Changed from POST to PUT)
router.put("/:propertyId/status", statusCtrl.updatePropertyStatus);

// Get full history
router.get("/:propertyId/status-history", statusCtrl.getPropertyStatusHistory);

module.exports = router;
