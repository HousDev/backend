// // module.exports = router;
// const router = require("express").Router();
// const ctrl = require("../controllers/message.Controller");

// router.post("/send", ctrl.sendMessage);
// router.get("/:contact_id", ctrl.getMessages);

// module.exports = router;

const router = require("express").Router();
const ctrl = require("../controllers/message.Controller");

router.post("/send", ctrl.sendMessage);
router.get("/:contact_id", ctrl.getMessages);

// ✅ Make sure these functions exist in controller
router.post("/:contact_id/mark-read", ctrl.markAsRead);
router.get("/:contact_id/unread-count", ctrl.getUnreadCount);

module.exports = router;