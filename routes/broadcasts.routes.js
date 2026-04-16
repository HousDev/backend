const router = require("express").Router();
const ctrl = require("../controllers/broadcast.controller");

router.get("/", ctrl.getAllBroadcasts);
router.post("/", ctrl.createBroadcast);

module.exports = router;
