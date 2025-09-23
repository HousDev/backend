const express = require("express");
const router = express.Router();
const systemSettingsController = require("../controllers/systemSettings.controller");
const { verifyToken, isAdmin } = require("../middleware/authJwt");
const { uploadSystem, handleUploadErrors } = require("../middleware/upload");

router.use(verifyToken, isAdmin);

router.get("/", systemSettingsController.getSystemSettings);

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

