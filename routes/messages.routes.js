
// const router = require("express").Router();
// const ctrl = require("../controllers/message.Controller");

// router.post("/send", ctrl.sendMessage);
// router.get("/:contact_id", ctrl.getMessages);

// // ✅ Make sure these functions exist in controller
// router.post("/:contact_id/mark-read", ctrl.markAsRead);
// router.get("/:contact_id/unread-count", ctrl.getUnreadCount);

// module.exports = router;



const router = require("express").Router();
const ctrl = require("../controllers/message.Controller");
const {
  uploadMedia,
  handleUploadErrors,
  attachPublicUrls,
} = require("../middleware/upload");

router.post("/send", ctrl.sendMessage);
router.get("/:contact_id", ctrl.getMessages);
router.post("/:contact_id/mark-read", ctrl.markAsRead);
router.get("/:contact_id/unread-count", ctrl.getUnreadCount);

router.post(
  "/send-media",
  uploadMedia.single("file"),
  handleUploadErrors,
  attachPublicUrls,
  ctrl.sendMedia
);

router.post("/send-location", ctrl.sendLocation);

router.patch('/:contact_id/clear', ctrl.clearChatHistory);
module.exports = router;