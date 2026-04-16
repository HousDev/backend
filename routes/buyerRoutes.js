const express = require("express");
const router = express.Router();
const buyerController = require("../controllers/buyerController");

router.post("/createBuyer", buyerController.createBuyer);
router.get("/get-all-buyers", buyerController.getBuyers);
router.get("/getBuyerById/:id", buyerController.getBuyerById);
router.put("/updateBuyer/:id", buyerController.updateBuyer);
router.delete("/deleteBuyer/:id", buyerController.deleteBuyer);
router.post("/bulk-delete",buyerController.bulkDeleteBuyers)
router.post("/bulk-import",buyerController.importBuyers)

// Single assign/unassign
router.patch("/:id/assign-executive", buyerController.assignExecutive);

// Bulk assign/unassign
router.post("/bulk/assign-executive", buyerController.bulkAssignExecutive);
// routes/buyer.routes.js
router.post("/updateLeadField/:id", buyerController.updateLeadField);
router.post("/bulkUpdateLeadField", buyerController.bulkUpdateLeadField);


module.exports = router;
