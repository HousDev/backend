// routes/sellerFollowupRoutes.js
const express = require("express");
const router = express.Router();
const sellerFollowupController = require("../controllers/SellerFollowupController");

// CRUD routes (same naming pattern as buyer followups)
router.post("/create", sellerFollowupController.create);        // Create followup
router.get("/getall", sellerFollowupController.getAll);         // Get all (optionally filter by sellerId)
router.get("/getbyid/:id", sellerFollowupController.getById);   // Get single by ID
router.put("/update/:id", sellerFollowupController.update);     // Update followup
router.delete("/remove/:id", sellerFollowupController.remove);  // Delete followup

module.exports = router;
