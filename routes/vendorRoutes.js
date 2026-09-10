const express = require("express");
const {
  createVendor,
  getVendors,
  getVendorCategoryCounts,
  getVendorById,
  updateVendor,
  deleteVendor,
} = require("../controllers/vendorController");

const router = express.Router();

router.post("/createVendor", createVendor);
router.get("/getVendors", getVendors);
router.get("/counts", getVendorCategoryCounts);
router.get("/getVendorById/:id", getVendorById);
router.put("/updateVendor/:id", updateVendor);
router.delete("/deleteVendor/:id", deleteVendor);

module.exports = router;
