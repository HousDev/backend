const tenantFollowupModel = require("../models/tenantFollowupModel");

const tenantFollowupController = {
  async create(req, res) {
    try {
      const id = await tenantFollowupModel.create(req.body);
      return res.status(201).json({ success: true, message: "Followup created", id });
    } catch (err) {
      console.error("Create tenant followup error:", err);
      return res.status(500).json({ success: false, message: "Failed to create followup" });
    }
  },

  async getByTenantId(req, res) {
    try {
      const data = await tenantFollowupModel.getByTenantId(req.params.tenantId);
      return res.json({ success: true, data });
    } catch (err) {
      console.error("Get tenant followups error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch followups" });
    }
  },

  async getAll(req, res) {
    try {
      const data = await tenantFollowupModel.getAll();
      return res.json({ success: true, data });
    } catch (err) {
      console.error("Get all tenant followups error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch followups" });
    }
  }
};

module.exports = tenantFollowupController;
