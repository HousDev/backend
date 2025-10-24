const express = require("express");
const router = express.Router();
const leadController = require("../controllers/lead.controller");
const { authJwt } = require("../middleware"); // ✅ auth middleware import

// Lead CRUD routes
router.post("/", authJwt.verifyToken, leadController.createLead);
router.get("/", authJwt.verifyToken, leadController.getLeads);
router.get("/:id", authJwt.verifyToken, leadController.getLead);
router.put("/:id", authJwt.verifyToken, leadController.updateLead);
router.delete("/:id", authJwt.verifyToken, leadController.deleteLead);

// Assign executive
router.patch("/:id/assign", authJwt.verifyToken, leadController.updateAssignedExecutive);
router.delete("/bulk/delete", authJwt.verifyToken, leadController.bulkDeleteLeads); 
// Bulk status update
router.patch("/bulk-status", authJwt.verifyToken, leadController.bulkUpdateStatus);
router.post("/import", authJwt.verifyToken,leadController.importLeads);

// Master data route
router.get("/master-data/:type", authJwt.verifyToken, leadController.getMasterData);

router.patch('/bulk/assign-executive', authJwt.verifyToken, leadController.bulkAssignExecutives);


module.exports = router;
