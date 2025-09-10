const express = require("express");
const router = express.Router();
const propertyController = require("../controllers/property.controller");
const { upload, handleUploadErrors } = require("../middleware/upload");

// ✅ Get master data
router.get("/master", propertyController.getMasterData);

// ✅ Get all properties
router.get("/", propertyController.getAllProperties);

// ✅ Get single property by ID
router.get("/getPropertyById/:id", propertyController.getProperty);

// ✅ Create property with files
router.post(
  "/create",
  upload.fields([
    { name: "ownershipDoc", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  handleUploadErrors, // Add error handling
  propertyController.createProperty
);

// ✅ Update property with files
router.put(
  "/:id",
  upload.fields([
    { name: "ownershipDoc", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  handleUploadErrors, // Add error handling
  propertyController.updateProperty
);

// ✅ Delete property
router.delete("/delete/:id", propertyController.deleteProperty);

// ✅ Data migration endpoint
router.post("/migrate", propertyController.migratePropertyData);

router.get("/", propertyController.searchProperties);


module.exports = router;