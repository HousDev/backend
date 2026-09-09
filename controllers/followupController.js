const FollowUpModel = require("../models/FollowUpModel");

/**
 * Unified FollowUp Controller for Lead, Buyer, Seller, Owner, Tenant
 */
const FollowUpController = {
  // POST /api/followups/create
  create: async (req, res) => {
    try {
      const isSellerRoute = (req.baseUrl && req.baseUrl.toLowerCase().includes("seller")) || !!req.body.seller_id || !!req.body.sellerId;
      const isBuyerRoute = (req.baseUrl && req.baseUrl.toLowerCase().includes("buyer")) || !!req.body.buyer_id || !!req.body.buyerId;

      let inferredEntity = null;
      let inferredEntityId = null;
      if (isSellerRoute) {
        inferredEntity = "SELLER";
        inferredEntityId = req.body.seller_id || req.body.sellerId || req.body.entity_id || req.body.entityId;
      } else if (isBuyerRoute) {
        inferredEntity = "BUYER";
        inferredEntityId = req.body.buyer_id || req.body.buyerId || req.body.entity_id || req.body.entityId;
      }

      const entityCode = req.body.entity_code || req.body.entityCode || inferredEntity || "LEAD";
      const entityId = req.body.entity_id || req.body.entityId || inferredEntityId || req.body.lead_id || req.body.leadId;

      const data = {
        ...req.body,
        entity_code: entityCode ? String(entityCode).toUpperCase() : "LEAD",
        entity_id: entityId ? String(entityId) : null,
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
      const isSellerRoute = (req.baseUrl && req.baseUrl.toLowerCase().includes("seller")) || !!req.query.sellerId || !!req.query.seller_id;
      const isBuyerRoute = (req.baseUrl && req.baseUrl.toLowerCase().includes("buyer")) || !!req.query.buyerId || !!req.query.buyer_id;
      const isLeadRoute = (req.baseUrl && req.baseUrl.toLowerCase().includes("lead")) || !!req.query.leadId || !!req.query.lead_id;

      let inferredEntity = null;
      if (isSellerRoute) inferredEntity = "SELLER";
      else if (isBuyerRoute) inferredEntity = "BUYER";
      else if (isLeadRoute) inferredEntity = "LEAD";

      const entityCode = req.query.entity || req.query.entityCode || req.query.entity_code || inferredEntity;
      const entityId = req.query.entityId || req.query.entity_id || req.query.leadId || req.query.lead_id || req.query.buyerId || req.query.buyer_id || req.query.sellerId || req.query.seller_id || req.params.sellerId || req.params.buyerId || req.params.leadId;

      const filters = {
        entityCode: entityCode ? String(entityCode).toUpperCase() : undefined,
        entityId: entityId ? String(entityId) : undefined,
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
