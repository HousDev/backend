// controllers/sellerFollowupController.js
const SellerFollowup = require("../models/SellerFollowupModel");

const sellerFollowupController = {
  // Create new seller followup
  async create(req, res) {
    try {
      // Model handles camelCase/snake_case + date normalization
      const id = await SellerFollowup.create(req.body);
      const followup = await SellerFollowup.findById(id);
      res.status(201).json({ success: true, data: followup });
    } catch (err) {
      console.error("Error creating seller followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },

  // Get all seller followups (optional sellerId filter + pagination)
 // controllers/sellerFollowupController.js
async getAll(req, res) {
  try {
    const { sellerId } = req.query;
    const page = req.query.page ?? 1;
    const limit = req.query.limit ?? 20;

    const followups = await SellerFollowup.findAll({
      sellerId,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });

    // Add cache headers
    res.set({
      'Cache-Control': 'private, max-age=60', // Cache for 60 seconds
      'ETag': `W/"${JSON.stringify(followups).length}"`, // Weak ETag
    });

    res.json({ success: true, data: followups });
  } catch (err) {
    console.error("Error fetching seller followups:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
},

  // Get single seller followup by ID
  async getById(req, res) {
    try {
      const followup = await SellerFollowup.findById(req.params.id);
      if (!followup)
        return res.status(404).json({ success: false, message: "Not Found" });
      res.json({ success: true, data: followup });
    } catch (err) {
      console.error("Error fetching seller followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },

  // Update a seller followup
  async update(req, res) {
    try {
      const affected = await SellerFollowup.update(req.params.id, req.body);
      if (!affected)
        return res.status(404).json({ success: false, message: "Not Found" });

      const updated = await SellerFollowup.findById(req.params.id);
      res.json({ success: true, data: updated });
    } catch (err) {
      console.error("Error updating seller followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },

  // Delete a seller followup
  async remove(req, res) {
    try {
      const affected = await SellerFollowup.delete(req.params.id);
      if (!affected)
        return res.status(404).json({ success: false, message: "Not Found" });

      res.json({ success: true, message: "Deleted successfully" });
    } catch (err) {
      console.error("Error deleting seller followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },
};

module.exports = sellerFollowupController;
