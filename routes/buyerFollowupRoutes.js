const express = require("express");
const router = express.Router();
const buyerFollowupController = require("../controllers/buyerFollowupController");

// CRUD routes
router.post("/create", buyerFollowupController.create);       // Create followup
router.get("/getall", buyerFollowupController.getAll);        // Get all (optionally filter by buyerId)
router.get("/getbyid/:id", buyerFollowupController.getById);    // Get single by ID
router.put("/update/:id", buyerFollowupController.update);     // Update followup
router.delete("/remove/:id", buyerFollowupController.remove);  // Delete followup

module.exports = router;
