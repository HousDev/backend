// const express = require("express");
// const router = express.Router();
// const systemSettingsController = require("../controllers/systemSettings.controller");
// const { verifyToken, isAdmin } = require("../middleware/authJwt");
// const { uploadSystem, handleUploadErrors } = require("../middleware/upload");

// router.use(verifyToken, isAdmin);

// router.get("/", systemSettingsController.getSystemSettings);

// router.post(
//   "/",
//   uploadSystem.fields([
//     { name: "company_logo", maxCount: 1 },
//     { name: "company_favicon", maxCount: 1 },
//   ]),
//   handleUploadErrors,
//   systemSettingsController.saveSystemSettings
// );

// module.exports = router;



const express = require("express");
const router = express.Router();
const systemSettingsController = require("../controllers/systemSettings.controller");
const { verifyToken, isAdmin } = require("../middleware/authJwt");
const { uploadSystem, handleUploadErrors } = require("../middleware/upload");

// secure all routes
router.use(verifyToken, isAdmin);

// GET system settings
router.get("/", systemSettingsController.getSystemSettings);

// SAVE/UPDATE system settings
router.post(
  "/",
  uploadSystem.fields([
    { name: "company_logo", maxCount: 1 },
    { name: "company_favicon", maxCount: 1 },
    { name: "footer_logo", maxCount: 1 }, // ✅ added footer_logo upload support
  ]),
  handleUploadErrors,
  systemSettingsController.saveSystemSettings
);

module.exports = router;
