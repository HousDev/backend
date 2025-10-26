const express = require("express");
const router = express.Router();
const clientLeadNotificationController = require("../controllers/clientLeadNotificationController");

// ✅ Create notification
router.post("/create", clientLeadNotificationController.createNotification);

// ✅ Get all notifications for a user
router.get("/getallbyuserid/:userId", clientLeadNotificationController.getUserNotifications);

// ✅ Mark as read
router.put("/markasread/:id/read", clientLeadNotificationController.markAsRead);
// ✅ Update notification
// ✅ Upsert notification (create if not exists else update)
router.post("/upsert/:id?", clientLeadNotificationController.upsertNotification);
router.put("/markallasread/:userId", clientLeadNotificationController.markAllAsRead);

router.delete("/:id", clientLeadNotificationController.deleteNotification);                  // single delete
router.delete("/user/:userId/all", clientLeadNotificationController.deleteAllForUser);        // optional: nuke all
router.delete("/user/:userId/read", clientLeadNotificationController.deleteReadForUser);

module.exports = router;
