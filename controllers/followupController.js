const FollowUpModel = require("../models/FollowUpModel");

/**
 * Unified FollowUp Controller for Lead, Buyer, Seller, Owner, Tenant
 */
const FollowUpController = {
  // POST /api/followups/create
  create: async (req, res) => {
    try {
      const data = {
        ...req.body,
        created_by: req.user?.id || req.body.createdBy || req.body.created_by,
      };

      const followup = await FollowUpModel.create(data);
      return res.status(201).json({
        success: true,
        message: "Follow-up created successfully",
        data: followup,
      });
    } catch (error) {
      console.error("[FollowUpController.create] error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to create follow-up",
      });
    }
  },

  // GET /api/followups/get-all
  getAll: async (req, res) => {
    try {
      const filters = {
        entityCode: req.query.entity || req.query.entityCode || req.query.entity_code,
        entityId: req.query.entityId || req.query.entity_id || req.query.leadId || req.query.buyerId || req.query.sellerId,
        type: req.query.type || req.query.followUpTypeCode,
        isComplete: req.query.isComplete !== undefined ? req.query.isComplete === "true" || req.query.isComplete === "1" : undefined,
        scheduledDate: req.query.date || req.query.scheduledDate,
        priorityCode: req.query.priority || req.query.priorityCode,
        assignedTo: req.query.assignedTo,
      };

      const followups = await FollowUpModel.findAll(filters);
      return res.json({
        success: true,
        data: followups,
        count: followups.length,
      });
    } catch (error) {
      console.error("[FollowUpController.getAll] error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch follow-ups",
      });
    }
  },

  // GET /api/followups/getById/:id
  getById: async (req, res) => {
    try {
      const followup = await FollowUpModel.findById(req.params.id);
      if (!followup) {
        return res.status(404).json({
          success: false,
          message: "Follow-up not found",
        });
      }
      return res.json({
        success: true,
        data: followup,
      });
    } catch (error) {
      console.error("[FollowUpController.getById] error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch follow-up",
      });
    }
  },

  // PUT /api/followups/update/:id
  update: async (req, res) => {
    try {
      const updateData = {
        ...req.body,
        updated_by: req.user?.id || req.body.updatedBy || req.body.updated_by,
      };

      const updated = await FollowUpModel.update(req.params.id, updateData);
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Follow-up not found or no fields to update",
        });
      }
      return res.json({
        success: true,
        message: "Follow-up updated successfully",
        data: updated,
      });
    } catch (error) {
      console.error("[FollowUpController.update] error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update follow-up",
      });
    }
  },

  // POST /api/followups/complete/:id
  complete: async (req, res) => {
    try {
      const outcomeData = {
        ...req.body,
        updated_by: req.user?.id || req.body.updatedBy || req.body.updated_by,
      };

      const completed = await FollowUpModel.complete(req.params.id, outcomeData);
      return res.json({
        success: true,
        message: "Follow-up marked as completed",
        data: completed,
      });
    } catch (error) {
      console.error("[FollowUpController.complete] error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to complete follow-up",
      });
    }
  },

  // DELETE /api/followups/delete/:id
  delete: async (req, res) => {
    try {
      const ok = await FollowUpModel.delete(req.params.id);
      if (!ok) {
        return res.status(404).json({
          success: false,
          message: "Follow-up not found or already deleted",
        });
      }
      return res.json({
        success: true,
        message: "Follow-up deleted successfully",
      });
    } catch (error) {
      console.error("[FollowUpController.delete] error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to delete follow-up",
      });
    }
  },

  // Helper endpoint for entity-specific queries: /api/followups/entity/:entityCode/:entityId
  getByEntity: async (req, res) => {
    try {
      const { entityCode, entityId } = req.params;
      const followups = await FollowUpModel.findAll({ entityCode, entityId });
      return res.json({
        success: true,
        data: followups,
        count: followups.length,
      });
    } catch (error) {
      console.error("[FollowUpController.getByEntity] error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch entity follow-ups",
      });
    }
  },
};

module.exports = FollowUpController;
