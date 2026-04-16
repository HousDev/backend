const router = require("express").Router();
const ctrl = require("../controllers/rule.Controller");

router.get("/", ctrl.getAllRules);
router.put("/:id", ctrl.updateRule);

module.exports = router;
