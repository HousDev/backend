// // module.exports = router;
// const router = require("express").Router();
// const ctrl = require("../controllers/contact.Controller");

// router.get("/", ctrl.getAllContacts);
// router.get("/:id", ctrl.getContactById);
// router.post("/", ctrl.createContact);
// router.put("/:id", ctrl.updateContact);
// router.delete("/:id", ctrl.deleteContact);
// router.post("/note", ctrl.addNote);

// module.exports = router;

const router = require("express").Router();
const ctrl = require("../controllers/contact.Controller");
const tagCtrl = require("../controllers/tag.Controller");

// Contact CRUD
router.get("/", ctrl.getAllContacts);
router.get("/stats", ctrl.getStats);
router.get("/search", ctrl.searchContacts);
router.get("/:id", ctrl.getContactById);
router.get("/:id/details", ctrl.getContactWithDetails);
router.post("/", ctrl.createContact);
router.put("/:id", ctrl.updateContact);
router.delete("/:id", ctrl.deleteContact);

// Contact stage management
router.patch("/:id/stage", ctrl.updateStage);

// Contact assignment
router.patch("/:id/assign", ctrl.assignContact);

// Notes management
router.get("/:id/notes", ctrl.getNotes);
router.post("/note", ctrl.addNote); // Keep for backward compatibility
router.post("/:id/notes", ctrl.addNote);

// Tags management
router.get("/:id/tags", async (req, res) => {
  try {
    const Tag = require("../models/tag.Model");
    const tags = await Tag.getContactTags(req.params.id);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post("/:id/tags", ctrl.addTag);
router.delete("/:id/tags/:tagId", ctrl.removeTag);

// Tags CRUD
router.get("/tags/all", tagCtrl.getAllTags);
router.get("/tags/:id", tagCtrl.getTagById);
router.post("/tags", tagCtrl.createTag);
router.put("/tags/:id", tagCtrl.updateTag);
router.delete("/tags/:id", tagCtrl.deleteTag);

module.exports = router;