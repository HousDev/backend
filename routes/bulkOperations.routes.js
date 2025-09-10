// const express = require("express");
// const router = express.Router();
// const bulkOperationsController = require("../controllers/bulkOperations.controller");

// // Bulk update status (Mark Available, Mark Sold, etc.)
// router.post("/status", bulkOperationsController.bulkUpdateStatus);

// // Bulk mark as public
// router.post("/mark-public", bulkOperationsController.bulkMarkPublic);

// // Bulk delete properties
// router.delete("/delete", bulkOperationsController.bulkDelete);

// // Bulk export properties
// router.post("/export", bulkOperationsController.bulkExport);

// // Individual mark as public
// router.patch("/:id/mark-public", bulkOperationsController.markPublic);

// // Get bulk operation status/history
// router.get(
//   "/operations/:operationId",
//   bulkOperationsController.getOperationStatus
// );

// module.exports = router;


// routes/bulkOperations.routes.js
const express = require("express");
const router = express.Router();
const bulkOperationsController = require("../controllers/bulkOperations.controller");

// Bulk update status (Mark Available, Mark Sold, etc.)
router.post("/status", bulkOperationsController.bulkUpdateStatus);

// Bulk mark as public (legacy – still works)
router.post("/mark-public", bulkOperationsController.bulkMarkPublic);

// NEW: Bulk mark as private (symmetric to mark-public)
router.post("/mark-private", bulkOperationsController.bulkMarkPrivate);

// NEW: Bulk set visibility in one go: { propertyIds: [], isPublic: true|false }
router.post("/visibility", bulkOperationsController.bulkSetVisibility);

// Bulk delete properties
router.delete("/delete", bulkOperationsController.bulkDelete);

// Bulk export properties
router.post("/export", bulkOperationsController.bulkExport);

// Individual mark as public (legacy – still works)
router.patch("/:id/mark-public", bulkOperationsController.markPublic);

// NEW: Individual mark as private
router.patch("/:id/mark-private", bulkOperationsController.markPrivate);

// NEW: Individual set visibility in one go: { isPublic: true|false }
router.patch("/:id/visibility", bulkOperationsController.setVisibility);

// Get bulk operation status/history (mock)
router.get("/operations/:operationId", bulkOperationsController.getOperationStatus);

module.exports = router;
