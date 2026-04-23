// const router = require("express").Router();
// const ctrl = require("../controllers/templates.Controller");

// router.get("/", ctrl.getAllTemplates);
// router.post("/", ctrl.createTemplate);
// router.put("/:id/status", ctrl.updateTemplateStatus);

// module.exports = router;

const router = require("express").Router();
const ctrl = require("../controllers/templates.Controller");

// Get all templates
router.get("/", ctrl.getAllTemplates);

// Get template by ID
router.get("/:id", ctrl.getTemplateById);

// Create template
router.post("/", ctrl.createTemplate);

// Update template
router.put("/:id", ctrl.updateTemplate);

// Delete template
router.delete("/:id", ctrl.deleteTemplate);

// Submit template to Meta
router.post("/:id/submit", ctrl.submitToMeta);

// Update template status (for webhook)
router.put("/:id/status", ctrl.updateTemplateStatus);

module.exports = router;