// controllers/buyerFollowupController.js
const BuyerFollowup = require("../models/buyerFollowupModel");

const buyerFollowupController = {
  // Create new followup
  async create(req, res) {
    try {
      // You may want to validate payload here (required fields etc.)
      const id = await BuyerFollowup.create(req.body);
      const followup = await BuyerFollowup.findById(id);
      res.status(201).json({ success: true, data: followup });
    } catch (err) {
      console.error("Error creating buyer followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },

  // Get all followups (with optional buyerId filter + pagination)
  async getAll(req, res) {
    try {
      // Accept both query forms: page+limit or pageNumber/size — normalize
      // Defensive parsing: if user passes '' or invalid string, fallback to defaults in model
      const { buyerId } = req.query;
      const page = req.query.page ?? req.query.pageNumber ?? 1;
      const limit = req.query.limit ?? req.query.size ?? 20;

      // convert to numbers if possible (model will sanitize further)
      const pageNum = Number.isFinite(Number(page)) ? parseInt(page, 10) : 1;
      const limitNum = Number.isFinite(Number(limit)) ? parseInt(limit, 10) : 20;

      const followups = await BuyerFollowup.findAll({
        buyerId,
        page: pageNum,
        limit: limitNum,
      });

      res.json({ success: true, data: followups });
    } catch (err) {
      console.error("Error fetching buyer followups:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },

  // Get single followup by ID
  async getById(req, res) {
    try {
      const followup = await BuyerFollowup.findById(req.params.id);
      if (!followup)
        return res.status(404).json({ success: false, message: "Not Found" });
      res.json({ success: true, data: followup });
    } catch (err) {
      console.error("Error fetching buyer followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },

  // Update followup
  async update(req, res) {
    try {
      const affected = await BuyerFollowup.update(req.params.id, req.body);
      if (!affected)
        return res.status(404).json({ success: false, message: "Not Found" });

      const updated = await BuyerFollowup.findById(req.params.id);
      res.json({ success: true, data: updated });
    } catch (err) {
      console.error("Error updating buyer followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },

  // Delete followup
  async remove(req, res) {
    try {
      const affected = await BuyerFollowup.delete(req.params.id);
      if (!affected)
        return res.status(404).json({ success: false, message: "Not Found" });

      res.json({ success: true, message: "Deleted successfully" });
    } catch (err) {
      console.error("Error deleting buyer followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },
};

module.exports = buyerFollowupController;
