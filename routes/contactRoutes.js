const express = require("express");
const router = express.Router();
const ContactController = require("../controllers/contactController");

router.post("/submit", ContactController.submitContact);

// admin endpoints - protect with auth middleware in production
router.get("/list", ContactController.getContacts);
router.get("/:id", ContactController.getContactById);

// dedicated status endpoint
router.patch("/:id/status", ContactController.updateStatus);

// add reply to conversation
router.post("/:id/reply", ContactController.addReply);

// generic update (assignment, is_starred, notes, etc.)
router.put("/:id", ContactController.updateContact);

module.exports = router;
