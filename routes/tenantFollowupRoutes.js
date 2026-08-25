const express = require("express");
const router = express.Router();
const tenantFollowupController = require("../controllers/tenantFollowupController");

router.post("/create", tenantFollowupController.create);
router.get("/getall", tenantFollowupController.getAll);
router.get("/by-tenant/:tenantId", tenantFollowupController.getByTenantId);

module.exports = router;
