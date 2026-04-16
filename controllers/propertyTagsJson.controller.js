// controllers/propertyTagsJson.controller.js
const M = require("../models/PropertyTagsJson");

const parseId = (req, res) => {
  const id = Number(req.params.id || req.body.propertyId);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ success: false, message: "Invalid property id" });
    return null;
  }
  return id;
};

/* GET /api/property-tags */
const getAll = async (_req, res) => {
  try {
    const rows = await M.getAll();
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

/* GET /api/property-tags/:id */
const getById = async (req, res) => {
  try {
    const id = parseId(req, res); if (id == null) return;
    const row = await M.get(id);
    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

/* PUT /api/property-tags/:id  {tags:[]}*/
const replace = async (req, res) => {
  try {
    const id = parseId(req, res); if (id == null) return;
    const { tags = [], updatedBy = null } = req.body || {};
    const out = await M.replace(id, tags, updatedBy);
    res.json({ success: true, data: out });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

/* POST /api/property-tags/:id/add  {tags:[]}*/
const add = async (req, res) => {
  try {
    const id = parseId(req, res); if (id == null) return;
    const { tags = [], updatedBy = null } = req.body || {};
    const out = await M.add(id, tags, updatedBy);
    res.json({ success: true, data: out });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

/* POST /api/property-tags/:id/remove  {tags:[]}*/
const remove = async (req, res) => {
  try {
    const id = parseId(req, res); if (id == null) return;
    const { tags = [], updatedBy = null } = req.body || {};
    const out = await M.remove(id, tags, updatedBy);
    res.json({ success: true, data: out });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

/* DELETE /api/property-tags/:id  -> delete row for property */
const deleteRow = async (req, res) => {
  try {
    const id = parseId(req, res); if (id == null) return;
    const out = await M.deleteRow(id);
    res.json({ success: true, data: out });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

/* GET /api/tags/known  -> unique tags universe */
const listKnown = async (_req, res) => {
  try {
    const all = await M.listKnown(5000);
    res.json({ success: true, data: all });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

/* DELETE /api/tags/:tag  -> remove a tag from ALL properties */
const deleteTagEverywhere = async (req, res) => {
  try {
    const tag = decodeURIComponent(String(req.params.tag || ""));
    const out = await M.deleteTagEverywhere(tag);
    res.json({ success: true, data: out });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = {
  getAll,
  getById,
  replace,
  add,
  remove,
  deleteRow,
  listKnown,
  deleteTagEverywhere,
};
