const express = require("express");
const router = express.Router();
const systemSettingsController = require("../controllers/systemSettings.controller");
const { verifyToken, isAdmin } = require("../middleware/authJwt");
const { uploadSystem, handleUploadErrors } = require("../middleware/upload");

// Admin only routes
router.use(verifyToken, isAdmin);

// GET
router.get("/", systemSettingsController.getSystemSettings);

// POST with file uploads
router.post(
  "/",
  uploadSystem.fields([
    { name: "company_logo", maxCount: 1 },
    { name: "company_favicon", maxCount: 1 },
  ]),
  handleUploadErrors,
  systemSettingsController.saveSystemSettings
);

module.exports = router;
