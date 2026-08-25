const tenantVisitModel = require("../models/tenantVisitModel");

const tenantVisitController = {
  async create(req, res) {
    try {
      const id = await tenantVisitModel.create(req.body);
      return res.status(201).json({ success: true, message: "Site Visit scheduled", id });
    } catch (err) {
      console.error("Create tenant visit error:", err);
      return res.status(500).json({ success: false, message: "Failed to schedule visit" });
    }
  },

  async getByTenantId(req, res) {
    try {
      const data = await tenantVisitModel.getByTenantId(req.params.tenantId);
      return res.json({ success: true, data });
    } catch (err) {
      console.error("Get tenant visits error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch visits" });
    }
  },

  async getAll(req, res) {
    try {
      const data = await tenantVisitModel.getAll();
      return res.json({ success: true, data });
    } catch (err) {
      console.error("Get all tenant visits error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch visits" });
    }
  }
};

module.exports = tenantVisitController;
