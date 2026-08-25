const express = require("express");
const router = express.Router();
const tenantVisitController = require("../controllers/tenantVisitController");

router.post("/create", tenantVisitController.create);
router.get("/getall", tenantVisitController.getAll);
router.get("/by-tenant/:tenantId", tenantVisitController.getByTenantId);

module.exports = router;
