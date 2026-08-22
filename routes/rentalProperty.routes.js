const express = require("express");
const router = express.Router();
const rentalPropertyController = require("../controllers/rentalProperty.controller");
const {
  uploadRental,
  handleUploadErrors,
  attachPublicUrls,
} = require("../middleware/upload");

// Master + list + search
router.get("/master", rentalPropertyController.getMasterData);
router.get("/", rentalPropertyController.getAllProperties);
router.get("/page/:slug", rentalPropertyController.getPropertyBySlug);
router.get("/getPropertyById/:id", rentalPropertyController.getProperty);

// Public
router.get("/get-all", rentalPropertyController.PublicgetAllProperties);
router.get("/pro-page/:slug", rentalPropertyController.PublicgetPropertyBySlug);
router.get("/get-one/:id", rentalPropertyController.PublicgetProperty);

// Import
router.post('/import-bulk', uploadRental.none(), rentalPropertyController.importBulk);

// Create
router.post(
  "/create",
  uploadRental.fields([
    { name: "ownershipDoc", maxCount: 1 },
    { name: "photos", maxCount: 20 },
  ]),
  handleUploadErrors,
  attachPublicUrls,
  rentalPropertyController.createProperty
);

// Update
router.put(
  "/:id",
  uploadRental.fields([
    { name: "ownershipDoc", maxCount: 1 },
    { name: "photos", maxCount: 20 },
  ]),
  handleUploadErrors,
  attachPublicUrls,
  rentalPropertyController.updateProperty
);

// Delete
router.delete("/delete/:id", rentalPropertyController.deleteProperty);

// Events + Filters + Migrate
router.post("/:id/event", rentalPropertyController.recordEventHandler);
router.post("/filters", rentalPropertyController.saveFilterContextHandler);
router.get("/filters/:id", rentalPropertyController.getFilterContextHandler);
router.post("/migrate", rentalPropertyController.migratePropertyData);
router.get("/city-locations", rentalPropertyController.searchCityLocationsStrict);

router.patch("/:id/assigned-to", rentalPropertyController.updateAssignedTo);
router.patch("/:id/link-owner", rentalPropertyController.patchPropertyOwner);
router.get('/similar', rentalPropertyController.getSimilarProperties);
router.get('/popular-locations', rentalPropertyController.getPopularLocations);
router.get("/search", rentalPropertyController.searchProperties);

module.exports = router;
