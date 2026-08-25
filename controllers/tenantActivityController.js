const tenantActivityModel = require("../models/tenantActivityModel");

const tenantActivityController = {
  async create(req, res) {
    try {
      const id = await tenantActivityModel.create(req.body);
      return res.status(201).json({ success: true, message: "Activity logged", id });
    } catch (err) {
      console.error("Create tenant activity error:", err);
      return res.status(500).json({ success: false, message: "Failed to log activity" });
    }
  },

  async getByTenantId(req, res) {
    try {
      const data = await tenantActivityModel.getByTenantId(req.params.tenantId);
      return res.json({ success: true, data });
    } catch (err) {
      console.error("Get tenant activities error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch activities" });
    }
  },

  async getAll(req, res) {
    try {
      const data = await tenantActivityModel.getAll();
      return res.json({ success: true, data });
    } catch (err) {
      console.error("Get all tenant activities error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch activities" });
    }
  }
};

module.exports = tenantActivityController;
