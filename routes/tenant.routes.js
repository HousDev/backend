const express = require("express");
const {
  createTenant,
  getTenants,
  getTenantById,
  updateTenant,
  deleteTenant,
  bulkDeleteTenants,
  bulkImportTenants,
  sendTenantOtp,
  verifyTenantOtp,
  verifyAndRegisterTenant,
  reportPropertyIssue,
  updateTenantPassword,
  getOwnerDetailsForTenant,
  getTenantProfileCompleteness,
  calculateTenantPropertyMatch,
  sendTenantInterest,
  getTenantInterests,
  getOwnerInterests,
  ownerConfirmTenant,
  ownerRejectTenant,
  tenantRespondToConfirmation,
} = require("../controllers/tenantController");

const router = express.Router();

// Public Tenant Flow (OTP Email Verification, Auto Login, Password & Owner Unlock)
router.post("/public/send-otp", sendTenantOtp);
router.post("/public/verify-otp", verifyTenantOtp);
router.post("/public/verify-and-register", verifyAndRegisterTenant);
router.post("/public/report-issue", reportPropertyIssue);
router.post("/public/update-password", updateTenantPassword);
// Get owner details for already-logged-in tenant (no OTP needed)
router.get("/public/owner-details/:property_id", getOwnerDetailsForTenant);
router.post("/public/owner-details", getOwnerDetailsForTenant);

// Tenant Profile Completeness & Match Calculation
router.get("/completeness/:tenantId", getTenantProfileCompleteness);
router.get("/match/:tenantId/:propertyId", calculateTenantPropertyMatch);

// Tenant & Owner Interest Workflow (Two-Way Requests)
router.post("/interests/send", sendTenantInterest);
router.get("/interests/tenant/:tenantId", getTenantInterests);
router.get("/interests/owner/:ownerId", getOwnerInterests);
router.post("/interests/:id/owner-confirm", ownerConfirmTenant);
router.post("/interests/:id/owner-reject", ownerRejectTenant);
router.post("/interests/:id/tenant-respond", tenantRespondToConfirmation);

// CRM Admin / Tenant Management Routes
router.post("/createTenant", createTenant);
router.get("/getTenants", getTenants);
router.get("/getTenantById/:id", getTenantById);
router.put("/updateTenant/:id", updateTenant);
router.delete("/deleteTenant/:id", deleteTenant);
router.post("/bulk-delete", bulkDeleteTenants);
router.post("/bulk-import", bulkImportTenants);

module.exports = router;
