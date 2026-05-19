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
// POST /api/contacts/count - Estimate contact count for campaigns
router.post("/count", async (req, res) => {
  try {
    const filters = req.body;
    const Contact = require("../models/contact.Model");
    const contacts = await Contact.findAll();
    
    let filtered = contacts;
    
    if (filters.stages?.length) {
      filtered = filtered.filter(c => filters.stages.includes(c.stage));
    }
    if (filters.tagIds?.length) {
      filtered = filtered.filter(c => 
        filters.tagIds.every(tagId => c.tags?.some(t => t.id == tagId))
      );
    }
    if (filters.location) {
      filtered = filtered.filter(c => 
        c.preferred_location?.toLowerCase().includes(filters.location.toLowerCase())
      );
    }
    if (filters.property_type) {
      filtered = filtered.filter(c => c.property_type === filters.property_type);
    }
    if (filters.budget_min) {
      filtered = filtered.filter(c => (c.budget_max || 0) >= filters.budget_min);
    }
    if (filters.budget_max) {
      filtered = filtered.filter(c => (c.budget_min || 0) <= filters.budget_max);
    }
    if (filters.source) {
      filtered = filtered.filter(c => c.source === filters.source);
    }
    
    res.json({ count: filtered.length });
  } catch (err) {
    console.error("Error in count contacts:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;