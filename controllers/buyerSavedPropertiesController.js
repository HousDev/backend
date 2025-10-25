const BuyerSavedProperty = require("../models/BuyerSavedProperty");

exports.toggleSave = async (req, res) => {
  try {
    const { buyerId, propertyId, mode } = req.body || {};
    if (!buyerId || !propertyId) {
      return res.status(400).json({ success: false, error: "buyerId and propertyId are required" });
    }
    const m = String(mode || "toggle").toLowerCase();

    if (m === "save") {
      const row = await BuyerSavedProperty.save(buyerId, propertyId);
      return res.json({ success: true, saved: true, data: row });
    }
    if (m === "unsave") {
      await BuyerSavedProperty.removeByPair(buyerId, propertyId);
      return res.json({ success: true, saved: false });
    }

    const exists = await BuyerSavedProperty.isSaved(buyerId, propertyId);
    if (exists) {
      await BuyerSavedProperty.removeByPair(buyerId, propertyId);
      return res.json({ success: true, saved: false });
    } else {
      const row = await BuyerSavedProperty.save(buyerId, propertyId);
      return res.json({ success: true, saved: true, data: row });
    }
  } catch (err) {
    console.error("toggleSave error:", err);
    res.status(500).json({ success: false, error: String(err.message || err) });
  }
};

exports.listByBuyer = async (req, res) => {
  try {
    const buyerId = Number(req.params.buyerId || req.query.buyerId);
    if (!buyerId) return res.status(400).json({ success: false, error: "buyerId is required" });

    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const includeProperty = String(req.query.includeProperty || "false").toLowerCase() === "true";

    const rows = await BuyerSavedProperty.listByBuyer(buyerId, { limit, offset, includeProperty });
    res.json({ success: true, data: rows, meta: { limit, offset } });
  } catch (err) {
    console.error("listByBuyer error:", err);
    res.status(500).json({ success: false, error: String(err.message || err) });
  }
};

exports.checkSaved = async (req, res) => {
  try {
    const buyerId = Number(req.params.buyerId || req.query.buyerId);
    const propertyId = Number(req.params.propertyId || req.query.propertyId);
    if (!buyerId || !propertyId) {
      return res.status(400).json({ success: false, error: "buyerId and propertyId are required" });
    }
    const saved = await BuyerSavedProperty.isSaved(buyerId, propertyId);
    res.json({ success: true, saved });
  } catch (err) {
    console.error("checkSaved error:", err);
    res.status(500).json({ success: false, error: String(err.message || err) });
  }
};

exports.removeByPair = async (req, res) => {
  try {
    const buyerId = Number(req.params.buyerId || req.body?.buyerId);
    const propertyId = Number(req.params.propertyId || req.body?.propertyId);
    if (!buyerId || !propertyId) {
      return res.status(400).json({ success: false, error: "buyerId and propertyId are required" });
    }
    const affected = await BuyerSavedProperty.removeByPair(buyerId, propertyId);
    res.json({ success: true, removed: affected > 0 });
  } catch (err) {
    console.error("removeByPair error:", err);
    res.status(500).json({ success: false, error: String(err.message || err) });
  }
};

exports.removeById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "id is required" });
    const affected = await BuyerSavedProperty.removeById(id);
    res.json({ success: true, removed: affected > 0 });
  } catch (err) {
    console.error("removeById error:", err);
    res.status(500).json({ success: false, error: String(err.message || err) });
  }
};

exports.countByProperty = async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId || req.query.propertyId);
    if (!propertyId) return res.status(400).json({ success: false, error: "propertyId is required" });
    const count = await BuyerSavedProperty.countByProperty(propertyId);
    res.json({ success: true, count });
  } catch (err) {
    console.error("countByProperty error:", err);
    res.status(500).json({ success: false, error: String(err.message || err) });
  }
};
