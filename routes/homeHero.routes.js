// routes/heroBlock.routes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/heroBlock.controller");
const {
  uploadHero,
  attachPublicUrls,
  handleUploadErrors,
} = require("../middleware/upload");

// CREATE (multipart form-data: photos[])
router.post(
  "/",
  uploadHero.array("photos", 10),
  handleUploadErrors, // ← multer errors stop here
  attachPublicUrls, // ← adds file.publicUrl
  ctrl.createMultipart
);

// (Optional) CREATE (pure JSON) — use when no files
router.post("/json", ctrl.createJson);

// UPLOAD-ONLY (standalone photo uploads)
router.post(
  "/upload",
  uploadHero.array("photos", 10),
  handleUploadErrors,
  attachPublicUrls,
  ctrl.uploadPhotos
);

// LIST / GET
router.get("/", ctrl.list);
router.get("/:id", ctrl.get);

// UPDATE (multipart OR JSON-in-multipart)
// expects: existingPhotos (JSON string of already-saved images), + photos[]
router.put(
  "/:id",
  uploadHero.array("photos", 10),
  handleUploadErrors,
  attachPublicUrls,
  ctrl.updateMultipart
);

// (Optional) UPDATE (pure JSON)
router.put("/:id/json", ctrl.updateJson);

// HARD DELETE
router.delete("/:id", ctrl.remove);

module.exports = router;
