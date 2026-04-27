const Tag = require("../models/tag.Model");

// Get all tags
exports.getAllTags = async (req, res) => {
  try {
    const tags = await Tag.findAll();
    res.json(tags);
  } catch (err) {
    console.error("Error in getAllTags:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get tag by ID
exports.getTagById = async (req, res) => {
  try {
    const { id } = req.params;
    const tag = await Tag.findById(id);
    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }
    res.json(tag);
  } catch (err) {
    console.error("Error in getTagById:", err);
    res.status(500).json({ error: err.message });
  }
};

// Create tag
exports.createTag = async (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Tag name is required" });
    }

    const existing = await Tag.findByName(name);
    if (existing) {
      return res.status(400).json({ error: "Tag already exists" });
    }

    const id = await Tag.create({
      name,
      color,
      created_by: req.user?.id || null,
    });

    const newTag = await Tag.findById(id);
    res.status(201).json(newTag);
  } catch (err) {
    console.error("Error in createTag:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update tag
exports.updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    const tag = await Tag.findById(id);
    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }

    const updated = await Tag.update(id, { name, color });
    res.json(updated);
  } catch (err) {
    console.error("Error in updateTag:", err);
    res.status(500).json({ error: err.message });
  }
};

// Delete tag
exports.deleteTag = async (req, res) => {
  try {
    const { id } = req.params;
    const tag = await Tag.findById(id);
    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }

    await Tag.delete(id);
    res.json({ success: true, message: "Tag deleted" });
  } catch (err) {
    console.error("Error in deleteTag:", err);
    res.status(500).json({ error: err.message });
  }
};
