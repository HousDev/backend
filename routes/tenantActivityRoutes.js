const express = require("express");
const router = express.Router();
const tenantActivityController = require("../controllers/tenantActivityController");

router.post("/create", tenantActivityController.create);
router.get("/getall", tenantActivityController.getAll);
router.get("/by-tenant/:tenantId", tenantActivityController.getByTenantId);

module.exports = router;
