const router = require("express").Router();
const ctrl = require("../controllers/templates.controller");

router.get("/", ctrl.getAllTemplates);
router.post("/", ctrl.createTemplate);
router.put("/:id/status", ctrl.updateTemplateStatus);

module.exports = router;
