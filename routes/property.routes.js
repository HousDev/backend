// const express = require("express");
// const router = express.Router();
// const propertyController = require("../controllers/property.controller");
// const { upload, handleUploadErrors } = require("../middleware/upload");


// router.get("/master", propertyController.getMasterData);
// router.get("/", propertyController.getAllProperties);
// router.get("/getPropertyById/:id", propertyController.getProperty);

// router.post(
//   "/create",
//   upload.fields([
//     { name: "ownershipDoc", maxCount: 1 },
//     { name: "photos", maxCount: 10 },
//   ]),
//   handleUploadErrors,
//   propertyController.createProperty
// );

// router.put(
//   "/:id",
//   upload.fields([
//     { name: "ownershipDoc", maxCount: 1 },
//     { name: "photos", maxCount: 10 },
//   ]),
//   handleUploadErrors,
//   propertyController.updateProperty
// );

// router.delete("/delete/:id", propertyController.deleteProperty);
// router.post("/migrate", propertyController.migratePropertyData);

// router.get("/", propertyController.searchProperties);
// router.get("/", propertyController.searchProperties);
// router.get("/page/:slug", propertyController.getPropertyBySlug);
// router.post("/migrate", propertyController.migratePropertyData);
// router.post("/:id/event", propertyController.recordEventHandler);
// router.post("/filters", propertyController.saveFilterContextHandler);
// router.get("/filters/:id", propertyController.getFilterContextHandler);

// module.exports = router;

const express = require("express");
const router = express.Router();
const propertyController = require("../controllers/property.controller");
const {
  upload,
  handleUploadErrors,
  attachPublicUrls,
} = require("../middleware/upload");

// Master + list + search
router.get("/master", propertyController.getMasterData);
router.get("/", propertyController.getAllProperties);
router.get("/page/:slug", propertyController.getPropertyBySlug);
router.get("/getPropertyById/:id", propertyController.getProperty);
// (avoid duplicate GET "/" and migrate route duplicates)

// Create
router.post(
  "/create",
  upload.fields([
    { name: "ownershipDoc", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  handleUploadErrors,
  attachPublicUrls, // <<---- NEW
  propertyController.createProperty
);

// Update
router.put(
  "/:id",
  upload.fields([
    { name: "ownershipDoc", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  handleUploadErrors,
  attachPublicUrls, // <<---- NEW
  propertyController.updateProperty
);

// Delete
router.delete("/delete/:id", propertyController.deleteProperty);

// Events + Filters + Migrate
router.post("/:id/event", propertyController.recordEventHandler);
router.post("/filters", propertyController.saveFilterContextHandler);
router.get("/filters/:id", propertyController.getFilterContextHandler);
router.post("/migrate", propertyController.migratePropertyData);

module.exports = router;
