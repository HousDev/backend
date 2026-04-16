const router = require("express").Router();
const ctrl = require("../controllers/analytics.controller");

router.get("/stats", ctrl.getStats);

module.exports = router;
