const tenantVisitModel = require("../models/tenantVisitModel");

const tenantVisitController = {
  async create(req, res) {
    try {
      const id = await tenantVisitModel.create(req.body);

      // Emit real-time socket events for live owner & tenant notification
      try {
        if (global.io) {
          global.io.emit("visit_created", { id, ...req.body });
          if (req.body.owner_id) {
            global.io.to(`user:${req.body.owner_id}`).emit("notification", {
              title: "New Site Visit Scheduled",
              message: `${req.body.tenant_name || 'A tenant'} requested a visit for ${req.body.property_title || 'your property'}.`,
              type: "visit_scheduled",
              data: { visitId: id, ...req.body }
            });
          }
        }
      } catch (sockErr) {
        console.warn("Socket event emit error on visit create:", sockErr.message);
      }

      return res.status(201).json({ success: true, message: "Site Visit scheduled successfully", id });
    } catch (err) {
      console.error("Create tenant visit error:", err);
      return res.status(500).json({ success: false, message: "Failed to schedule visit: " + (err.message || '') });
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
  },

  async update(req, res) {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ success: false, message: "Visit ID is required" });
      const affected = await tenantVisitModel.update(id, req.body);

      // Emit real-time socket event for status update
      try {
        if (global.io) {
          global.io.emit("visit_updated", { id, ...req.body });
        }
      } catch (sockErr) {
        console.warn("Socket event emit error on visit update:", sockErr.message);
      }

      return res.json({ success: true, message: "Visit updated successfully", affected });
    } catch (err) {
      console.error("Update tenant visit error:", err);
      return res.status(500).json({ success: false, message: "Failed to update visit: " + (err.message || '') });
    }
  },

  async delete(req, res) {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ success: false, message: "Visit ID is required" });
      const affected = await tenantVisitModel.delete(id);
      return res.json({ success: true, message: "Visit deleted successfully", affected });
    } catch (err) {
      console.error("Delete tenant visit error:", err);
      return res.status(500).json({ success: false, message: "Failed to delete visit" });
    }
  },

  async bulkDelete(req, res) {
    try {
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: "List of Visit IDs is required" });
      }
      const affected = await tenantVisitModel.bulkDelete(ids);
      return res.json({ success: true, message: `${affected} visits deleted successfully`, affected });
    } catch (err) {
      console.error("Bulk delete tenant visits error:", err);
      return res.status(500).json({ success: false, message: "Failed to bulk delete visits" });
    }
  }
};

module.exports = tenantVisitController;
