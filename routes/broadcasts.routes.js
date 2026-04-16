const router = require("express").Router();
const ctrl = require("../controllers/broadcast.Controller");

router.get("/", ctrl.getAllBroadcasts);
router.post("/", ctrl.createBroadcast);

module.exports = router;
