// const express = require("express");
// const router = express.Router();
// const SocietyController = require("../controllers/SocietyController");
// const multer = require("multer");

// const upload = multer({ storage: multer.memoryStorage() });

// // IMPORTANT: Specific routes FIRST, then generic ones
// router.get(
//   "/get-by-identifier/:identifier",
//   SocietyController.getSocietyByIdentifier,
// );
// router.get("/getById/:id", SocietyController.getById);
// router.get("/get-all", SocietyController.getAll);
// router.post("/create", SocietyController.create);
// router.put("/update/:id", SocietyController.update);
// router.delete("/delete/:id", SocietyController.delete);
// router.post("/bulk-create", SocietyController.bulkCreate);

// // Import/Export Routes
// router.get("/export", SocietyController.exportSocieties);
// router.post(
//   "/import",
//   upload.single("file"),
//   SocietyController.importSocieties,
// );

// module.exports = router;

const express = require("express");
const router = express.Router();
const SocietyController = require("../controllers/SocietyController");
const {
  upload,
  uploadFile,
  attachPublicUrls,
  handleUploadErrors,
} = require("../middleware/upload");

// ============================================
// IMPORTANT: Specific routes FIRST, then generic ones
// ============================================

// 🖼️ IMAGE ROUTES (must come before generic routes)
router.get("/:id/images", SocietyController.getImages);
router.post(
  "/:id/images",
  upload.array("images", 10),
  attachPublicUrls,
  handleUploadErrors,
  SocietyController.uploadImages,
);
router.post(
  "/:id/image",
  upload.single("image"),
  attachPublicUrls,
  handleUploadErrors,
  SocietyController.uploadImage,
);
router.delete("/:id/images/:imageIndex", SocietyController.deleteImage);
router.delete("/:id/images", SocietyController.deleteAllImages);

// 🔍 Get society by name with images (for auto-fill)
router.get("/get-by-name/:name", SocietyController.getSocietyByName);

// 📋 Get society by identifier
router.get(
  "/get-by-identifier/:identifier",
  SocietyController.getSocietyByIdentifier,
);

// 📋 Get society by ID
router.get("/getById/:id", SocietyController.getById);

// 📋 Get all societies (with optional filters)
router.get("/get-all", SocietyController.getAll);

// ✏️ CRUD operations
router.post("/create", SocietyController.create);
router.put("/update/:id", SocietyController.update);
router.delete("/delete/:id", SocietyController.delete);

// 📦 Bulk operations
router.post("/bulk-create", SocietyController.bulkCreate);

// 📊 Import / Export Routes
router.get("/export", SocietyController.exportSocieties);
router.post(
  "/import",
  uploadFile.single("file"),
  handleUploadErrors,
  SocietyController.importSocieties,
);

// 🔍 Search and filter routes
router.get("/search", SocietyController.searchSocieties);
router.get("/by-pincode/:pincode", SocietyController.getSocietiesByPincode);
router.get("/by-city/:city", SocietyController.getSocietiesByCity);

module.exports = router;