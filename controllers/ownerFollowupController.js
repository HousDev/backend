const OwnerFollowup = require("../models/OwnerFollowupModel");

const ownerFollowupController = {
  async create(req, res) {
    try {
      const payload = {
        ...req.body,
        created_by: req.user?.id || req.body.created_by
      };
      const id = await OwnerFollowup.create(payload);
      const followup = await OwnerFollowup.findById(id);
      res.status(201).json({ success: true, data: followup });
    } catch (err) {
      console.error("Error creating owner followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },

  async getAll(req, res) {
    try {
      const { ownerId } = req.query;
      const page = req.query.page ?? 1;
      const limit = req.query.limit ?? 20;

      const followups = await OwnerFollowup.findAll({
        ownerId,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      });

      res.json({ success: true, data: followups });
    } catch (err) {
      console.error("Error fetching owner followups:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },

  async getById(req, res) {
    try {
      const followup = await OwnerFollowup.findById(req.params.id);
      if (!followup)
        return res.status(404).json({ success: false, message: "Not Found" });
      res.json({ success: true, data: followup });
    } catch (err) {
      console.error("Error fetching owner followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },

  async update(req, res) {
    try {
      const affected = await OwnerFollowup.update(req.params.id, req.body);
      if (!affected)
        return res.status(404).json({ success: false, message: "Not Found" });

      const updated = await OwnerFollowup.findById(req.params.id);
      res.json({ success: true, data: updated });
    } catch (err) {
      console.error("Error updating owner followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },

  async remove(req, res) {
    try {
      const affected = await OwnerFollowup.delete(req.params.id);
      if (!affected)
        return res.status(404).json({ success: false, message: "Not Found" });

      res.json({ success: true, message: "Deleted successfully" });
    } catch (err) {
      console.error("Error deleting owner followup:", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  },
};

module.exports = ownerFollowupController;
