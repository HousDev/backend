const express = require("express");
const {
  createOwner,
  getOwners,
  getOwnerById,
  updateOwner,
  deleteOwner,
  bulkAssignExecutive,
  updateLeadField,
  bulkUpdateLeadField,
  bulkImport,
  bulkHardDeleteOwners
} = require("../controllers/ownerController");

const router = express.Router();

router.post("/createOwner", createOwner);
router.get("/getOwners", getOwners);
router.get("/getOwnerById/:id", getOwnerById);
router.put("/updateOwner/:id", updateOwner);
router.delete("/deleteOwner/:id", deleteOwner);
router.post("/bulk-import", bulkImport);
router.post("/bulk/assign-executive", bulkAssignExecutive);
router.post("/bulk/lead-field", bulkUpdateLeadField);
router.post("/:id/lead-field", updateLeadField);
router.post("/hard-delete", bulkHardDeleteOwners);

module.exports = router;
