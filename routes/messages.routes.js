const router = require("express").Router();
const ctrl = require("../controllers/message.Controller");

router.post("/", ctrl.sendMessage);
router.get("/:contact_id", ctrl.getMessages);

module.exports = router;
