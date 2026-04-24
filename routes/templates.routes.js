const router = require("express").Router();
const templateController = require("../controllers/templates.Controller");

router.get("/", templateController.getAllTemplates);
router.get("/:id", templateController.getTemplateById);
router.post("/sync-meta", templateController.syncFromMeta);
router.post("/", templateController.createTemplate);
router.put("/:id", templateController.updateTemplate);
router.delete("/:id", templateController.deleteTemplate);
router.post("/:id/submit", templateController.submitToMeta);
router.post("/sync", templateController.syncMetaStatus);

module.exports = router;