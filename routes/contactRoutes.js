// // routes/contactRoutes.js
// const express = require("express");
// const router = express.Router();
// const ContactController = require("../controllers/contactController");

// /**
//  * Public routes:
//  * POST /api/contact/submit     => submit contact form
//  * GET  /api/contact/list       => list contacts (admin)  <-- protect in prod
//  * GET  /api/contact/:id        => single contact (admin) <-- protect in prod
//  *
//  * Note: /masters routes were removed because dropdown options are handled on frontend.
//  */

// // submit contact (public)
// router.post("/submit", ContactController.submitContact);

// // admin endpoints - protect with auth middleware in production
// router.get("/list", ContactController.getContacts);
// router.get("/:id", ContactController.getContactById);


// module.exports = router;


const express = require("express");
const router = express.Router();
const ContactController = require("../controllers/contactController");

/**
 * Public routes:
 * POST /api/contact/submit     => submit contact form
 * GET  /api/contact/list       => list contacts (admin)  <-- protect in prod
 * GET  /api/contact/:id        => single contact (admin) <-- protect in prod
 *
 * New Admin routes:
 * PATCH /api/contact/:id/status  => update only status (body: { status })
 * POST  /api/contact/:id/reply   => add reply (body: { message, sender })
 * PUT   /api/contact/:id         => full/partial update (body: { assignedTo, isStarred, ... })
 */

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
