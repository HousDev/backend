const {
  ChatbotFlow,
  ChatbotStep,
  ChatbotConversation,
} = require("../models/chatbot.Model");
const { processChatbotMessage } = require("../services/chatbotService");
const db = require("../config/database");

// Get all flows
exports.getAllFlows = async (req, res) => {
  try {
    const flows = await ChatbotFlow.findAll();

    for (const flow of flows) {
      flow.steps = await ChatbotStep.findByFlowId(flow.id);
    }

    res.json(flows);
  } catch (err) {
    console.error("Error in getAllFlows:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get flow by ID
exports.getFlowById = async (req, res) => {
  try {
    const { id } = req.params;
    const flow = await ChatbotFlow.findById(id);

    if (!flow) {
      return res.status(404).json({ error: "Flow not found" });
    }

    res.json(flow);
  } catch (err) {
    console.error("Error in getFlowById:", err);
    res.status(500).json({ error: err.message });
  }
};

// Create new flow
exports.createFlow = async (req, res) => {
  try {
    const { name, description, trigger_keyword, is_active, is_default, steps } =
      req.body;

    if (!name) {
      return res.status(400).json({ error: "Flow name is required" });
    }

    const flowId = await ChatbotFlow.create({
      name,
      description,
      trigger_keyword,
      is_active,
      is_default,
    });

    if (steps && steps.length > 0) {
      await ChatbotStep.bulkSave(flowId, steps);
    }

    const newFlow = await ChatbotFlow.findById(flowId);
    res.status(201).json(newFlow);
  } catch (err) {
    console.error("Error in createFlow:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update flow
exports.updateFlow = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, trigger_keyword, is_active, is_default, steps } =
      req.body;

    const existing = await ChatbotFlow.findById(id);
    if (!existing) {
      return res.status(404).json({ error: "Flow not found" });
    }

    await ChatbotFlow.update(id, {
      name,
      description,
      trigger_keyword,
      is_active,
      is_default,
    });

    if (steps !== undefined) {
      await ChatbotStep.bulkSave(id, steps);
    }

    const updated = await ChatbotFlow.findById(id);
    res.json(updated);
  } catch (err) {
    console.error("Error in updateFlow:", err);
    res.status(500).json({ error: err.message });
  }
};

// Delete flow
exports.deleteFlow = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await ChatbotFlow.findById(id);
    if (!existing) {
      return res.status(404).json({ error: "Flow not found" });
    }

    await ChatbotFlow.delete(id);
    res.json({ success: true, message: "Flow deleted successfully" });
  } catch (err) {
    console.error("Error in deleteFlow:", err);
    res.status(500).json({ error: err.message });
  }
};

// Toggle flow active status
exports.toggleFlowStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const flow = await ChatbotFlow.findById(id);
    if (!flow) {
      return res.status(404).json({ error: "Flow not found" });
    }

    const updated = await ChatbotFlow.toggleStatus(id, is_active);
    res.json(updated);
  } catch (err) {
    console.error("Error in toggleFlowStatus:", err);
    res.status(500).json({ error: err.message });
  }
};

// Process incoming message through chatbot (API endpoint wrapper)
exports.processMessage = async (req, res) => {
  try {
    const { contactId, message } = req.body;

    if (!contactId || !message) {
      return res
        .status(400)
        .json({ error: "Contact ID and message are required" });
    }

    const result = await processChatbotMessage(contactId, message);
    res.json(result);
  } catch (err) {
    console.error("Error in processMessage:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get flow execution logs
exports.getFlowLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT * FROM chatbot_logs WHERE flow_id = ? ORDER BY created_at DESC LIMIT 100`,
      [id],
    );
    res.json(rows);
  } catch (err) {
    console.error("Error in getFlowLogs:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get active conversations
exports.getActiveConversations = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, 
              co.name as contact_name, co.phone as contact_phone,
              f.name as flow_name
       FROM chatbot_conversations c
       LEFT JOIN contacts_wa co ON c.contact_id = co.id
       LEFT JOIN chatbot_flows f ON c.flow_id = f.id
       WHERE c.status = 'active'
       ORDER BY c.updated_at DESC`,
    );
    res.json(rows);
  } catch (err) {
    console.error("Error in getActiveConversations:", err);
    res.status(500).json({ error: err.message });
  }
};