// backend/controllers/automationMasterController.js
// REST Controller for Automation Stages, Statuses, Outcomes, and Rules CRUD & Lookup

const AutomationMasterModel = require('../models/automationMasterModel');

const automationMasterController = {
  // ----------------------------------------------------
  // GET FULL GRAPH FOR ENTITY
  // ----------------------------------------------------
  getMastersGraph: async (req, res) => {
    try {
      const { entity = 'lead' } = req.query;
      const stages = await AutomationMasterModel.getStages(entity);
      const statuses = await AutomationMasterModel.getStatuses(entity);
      const outcomes = await AutomationMasterModel.getOutcomesByEntity(entity);
      const rules = await AutomationMasterModel.getRules(entity);

      return res.json({
        success: true,
        entity,
        data: {
          stages,
          statuses,
          outcomes,
          rules
        }
      });
    } catch (error) {
      console.error('Error fetching automation masters graph:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // ----------------------------------------------------
  // DYNAMIC CONDITIONAL OUTCOMES LOOKUP (Stage-specific)
  // ----------------------------------------------------
  getOutcomesForStage: async (req, res) => {
    try {
      const { stage_id, entity = 'lead' } = req.query;
      if (stage_id) {
        const outcomes = await AutomationMasterModel.getOutcomesByStageId(stage_id);
        return res.json({ success: true, stage_id, data: outcomes });
      }

      // Fallback: outcomes by entity
      const outcomes = await AutomationMasterModel.getOutcomesByEntity(entity);
      return res.json({ success: true, entity, data: outcomes });
    } catch (error) {
      console.error('Error fetching stage outcomes:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // ----------------------------------------------------
  // STAGES CRUD
  // ----------------------------------------------------
  getStages: async (req, res) => {
    try {
      const { entity } = req.query;
      const stages = await AutomationMasterModel.getStages(entity);
      return res.json({ success: true, data: stages });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  createStage: async (req, res) => {
    try {
      const stageId = await AutomationMasterModel.createStage(req.body);
      return res.status(201).json({ success: true, message: 'Stage created', id: stageId });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  updateStage: async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await AutomationMasterModel.updateStage(id, req.body);
      return res.json({ success: true, updated });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  deleteStage: async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await AutomationMasterModel.deleteStage(id);
      return res.json({ success: true, deleted });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // ----------------------------------------------------
  // STATUSES CRUD
  // ----------------------------------------------------
  getStatuses: async (req, res) => {
    try {
      const { entity } = req.query;
      const statuses = await AutomationMasterModel.getStatuses(entity);
      return res.json({ success: true, data: statuses });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  createStatus: async (req, res) => {
    try {
      const statusId = await AutomationMasterModel.createStatus(req.body);
      return res.status(201).json({ success: true, message: 'Status created', id: statusId });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  updateStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await AutomationMasterModel.updateStatus(id, req.body);
      return res.json({ success: true, updated });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  deleteStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await AutomationMasterModel.deleteStatus(id);
      return res.json({ success: true, deleted });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // ----------------------------------------------------
  // OUTCOMES CRUD
  // ----------------------------------------------------
  createOutcome: async (req, res) => {
    try {
      const outcomeId = await AutomationMasterModel.createOutcome(req.body);
      return res.status(201).json({ success: true, message: 'Outcome created', id: outcomeId });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  updateOutcome: async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await AutomationMasterModel.updateOutcome(id, req.body);
      return res.json({ success: true, updated });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  deleteOutcome: async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await AutomationMasterModel.deleteOutcome(id);
      return res.json({ success: true, deleted });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // ----------------------------------------------------
  // RULES CRUD (With Entity Consistency Validation)
  // ----------------------------------------------------
  getRules: async (req, res) => {
    try {
      const { entity } = req.query;
      const rules = await AutomationMasterModel.getRules(entity);
      return res.json({ success: true, data: rules });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  createRule: async (req, res) => {
    try {
      const ruleId = await AutomationMasterModel.createRule(req.body);
      return res.status(201).json({ success: true, message: 'Rule created & published', id: ruleId });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  updateRule: async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await AutomationMasterModel.updateRule(id, req.body);
      return res.json({ success: true, updated });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  deleteRule: async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await AutomationMasterModel.deleteRule(id);
      return res.json({ success: true, deleted });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // ----------------------------------------------------
  // AUDIT LOGS
  // ----------------------------------------------------
  getAuditLogs: async (req, res) => {
    try {
      const { entity, entity_id } = req.params;
      const logs = await AutomationMasterModel.getAuditLogs(entity, entity_id);
      return res.json({ success: true, data: logs });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = automationMasterController;
