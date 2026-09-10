const express = require("express");
const router = express.Router();
const tenantVisitController = require("../controllers/tenantVisitController");

router.post("/create", tenantVisitController.create);
router.get("/getall", tenantVisitController.getAll);
router.get("/by-tenant/:tenantId", tenantVisitController.getByTenantId);
router.put("/update/:id", tenantVisitController.update);
router.put("/:id", tenantVisitController.update);
router.patch("/:id", tenantVisitController.update);
router.delete("/bulk-delete", tenantVisitController.bulkDelete);
router.delete("/delete/:id", tenantVisitController.delete);
router.delete("/:id", tenantVisitController.delete);

module.exports = router;
