const router = require("express").Router();
const ctrl = require("../controllers/analytics.Controller");

router.get("/stats", ctrl.getStats);

module.exports = router;
