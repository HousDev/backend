const express = require("express");
const {
  createTenant,
  getTenants,
  getTenantById,
  updateTenant,
  deleteTenant,
  bulkDeleteTenants,
  bulkImportTenants,
} = require("../controllers/tenantController");

const router = express.Router();

router.post("/createTenant", createTenant);
router.get("/getTenants", getTenants);
router.get("/getTenantById/:id", getTenantById);
router.put("/updateTenant/:id", updateTenant);
router.delete("/deleteTenant/:id", deleteTenant);
router.post("/bulk-delete", bulkDeleteTenants);
router.post("/bulk-import", bulkImportTenants);

module.exports = router;
