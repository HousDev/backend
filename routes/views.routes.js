// routes/views.routes.js
const express = require("express");
const router = express.Router();
const ViewsController = require("../controllers/views.controller");

// GET /api/views/total
router.get("/total", ViewsController.totalViewsHandler);

// GET /api/views/property/:id?unique=true
router.get("/property/:id", ViewsController.propertyViewsHandler);

// GET /api/views/top?limit=10&unique=true
router.get("/top", ViewsController.topViewsHandler);

// GET /api/views/bottom?limit=10&unique=true
router.get("/bottom", ViewsController.bottomViewsHandler);
// NEW: record endpoints (POST)
router.post("/property/:id/record", ViewsController.recordPropertyViewHandler);
router.post("/record", ViewsController.recordViewHandler);

module.exports = router;
