// const {
//   ChatbotFlow,
//   ChatbotStep,
//   ChatbotConversation,
// } = require("../models/chatbot.Model");
// const Template = require("../models/template.Model");
// const Tag = require("../models/tag.Model");
// const User = require("../models/User");
// const Contact = require("../models/contact.Model");
// const {
//   sendTemplateMessage,
//   sendTextMessage,
// } = require("../integrations/whatsapp");

// // Get all flows
// exports.getAllFlows = async (req, res) => {
//   try {
//     const flows = await ChatbotFlow.findAll();

//     // Get steps for each flow
//     for (const flow of flows) {
//       flow.steps = await ChatbotStep.findByFlowId(flow.id);
//     }

//     res.json(flows);
//   } catch (err) {
//     console.error("Error in getAllFlows:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Get flow by ID
// exports.getFlowById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const flow = await ChatbotFlow.findById(id);

//     if (!flow) {
//       return res.status(404).json({ error: "Flow not found" });
//     }

//     res.json(flow);
//   } catch (err) {
//     console.error("Error in getFlowById:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Create new flow
// exports.createFlow = async (req, res) => {
//   try {
//     const { name, description, trigger_keyword, is_active, is_default, steps } =
//       req.body;

//     if (!name) {
//       return res.status(400).json({ error: "Flow name is required" });
//     }

//     const flowId = await ChatbotFlow.create({
//       name,
//       description,
//       trigger_keyword,
//       is_active,
//       is_default,
//     });

//     // Save steps if provided
//     if (steps && steps.length > 0) {
//       await ChatbotStep.bulkSave(flowId, steps);
//     }

//     const newFlow = await ChatbotFlow.findById(flowId);
//     res.status(201).json(newFlow);
//   } catch (err) {
//     console.error("Error in createFlow:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Update flow
// exports.updateFlow = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { name, description, trigger_keyword, is_active, is_default, steps } =
//       req.body;

//     const existing = await ChatbotFlow.findById(id);
//     if (!existing) {
//       return res.status(404).json({ error: "Flow not found" });
//     }

//     await ChatbotFlow.update(id, {
//       name,
//       description,
//       trigger_keyword,
//       is_active,
//       is_default,
//     });

//     // Update steps if provided
//     if (steps !== undefined) {
//       await ChatbotStep.bulkSave(id, steps);
//     }

//     const updated = await ChatbotFlow.findById(id);
//     res.json(updated);
//   } catch (err) {
//     console.error("Error in updateFlow:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Delete flow
// exports.deleteFlow = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const existing = await ChatbotFlow.findById(id);
//     if (!existing) {
//       return res.status(404).json({ error: "Flow not found" });
//     }

//     await ChatbotFlow.delete(id);
//     res.json({ success: true, message: "Flow deleted successfully" });
//   } catch (err) {
//     console.error("Error in deleteFlow:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Toggle flow active status
// exports.toggleFlowStatus = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { is_active } = req.body;

//     const flow = await ChatbotFlow.findById(id);
//     if (!flow) {
//       return res.status(404).json({ error: "Flow not found" });
//     }

//     const updated = await ChatbotFlow.toggleStatus(id, is_active);
//     res.json(updated);
//   } catch (err) {
//     console.error("Error in toggleFlowStatus:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Process incoming message through chatbot
// exports.processMessage = async (req, res) => {
//   try {
//     const { contactId, message } = req.body;

//     if (!contactId || !message) {
//       return res
//         .status(400)
//         .json({ error: "Contact ID and message are required" });
//     }

//     const contact = await Contact.findById(contactId);
//     if (!contact) {
//       return res.status(404).json({ error: "Contact not found" });
//     }

//     // Get active conversation or start new one
//     let conversation = await ChatbotConversation.findActiveByContact(contactId);
//     let flow = null;
//     let currentStep = null;

//     if (!conversation) {
//       // Find matching flow by keyword
//       const matchingFlows = await ChatbotFlow.findActiveByKeyword(
//         message.toLowerCase(),
//       );
//       flow = matchingFlows[0] || (await ChatbotFlow.findDefault());

//       if (!flow) {
//         // No flow found, just send default response
//         await sendTextMessage(
//           contact.phone,
//           "Thank you for your message. Our team will get back to you shortly.",
//         );
//         return res.json({
//           processed: false,
//           message: "No matching flow found",
//         });
//       }

//       // Start new conversation
//       const steps = await ChatbotStep.findByFlowId(flow.id);
//       const firstStep = steps[0];

//       const convId = await ChatbotConversation.create(
//         contactId,
//         flow.id,
//         firstStep?.id,
//       );
//       conversation = {
//         id: convId,
//         flow_id: flow.id,
//         current_step_id: firstStep?.id,
//         variables: {},
//       };
//       currentStep = firstStep;

//       // Send first message
//       if (currentStep) {
//         await executeStep(contact, currentStep, conversation, null);
//       }
//     } else {
//       // Continue existing conversation
//       flow = await ChatbotFlow.findById(conversation.flow_id);
//       const steps = await ChatbotStep.findByFlowId(flow.id);
//       currentStep = steps.find((s) => s.id === conversation.current_step_id);

//       if (currentStep) {
//         // Process user response and execute next step
//         await processUserResponse(contact, currentStep, conversation, message);
//       }
//     }

//     res.json({ processed: true, flow: flow?.name });
//   } catch (err) {
//     console.error("Error in processMessage:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Helper: Execute a step
// async function executeStep(contact, step, conversation, userResponse) {
//   const variables = conversation.variables
//     ? JSON.parse(conversation.variables)
//     : {};

//   switch (step.step_type) {
//     case "message":
//       await sendTextMessage(contact.phone, step.message_text);
//       await moveToNextStep(contact, step, conversation);
//       break;

//     case "question":
//       await sendTextMessage(contact.phone, step.message_text);
//       // Save the response when received
//       if (userResponse && step.save_response_as) {
//         variables[step.save_response_as] = userResponse;
//         await ChatbotConversation.update(conversation.id, { variables });
//       }
//       break;

//     case "template":
//       if (step.template_id) {
//         const template = await Template.findById(step.template_id);
//         if (template && template.status === "APPROVED") {
//           await sendTemplateMessage(
//             contact.phone,
//             template.name,
//             template.language,
//             [],
//           );
//         }
//       }
//       await moveToNextStep(contact, step, conversation);
//       break;

//     case "tag":
//       if (step.tag_id) {
//         // Add tag to contact
//         await Contact.addTag(contact.id, step.tag_id);
//       }
//       await moveToNextStep(contact, step, conversation);
//       break;

//     case "assign":
//       if (step.assign_to) {
//         await Contact.update(contact.id, { assigned_to: step.assign_to });
//       }
//       await moveToNextStep(contact, step, conversation);
//       break;

//     case "stage":
//       if (step.stage) {
//         await Contact.update(contact.id, { stage: step.stage });
//       }
//       await moveToNextStep(contact, step, conversation);
//       break;

//     case "end":
//       await ChatbotConversation.update(conversation.id, {
//         status: "completed",
//       });
//       break;
//   }

//   // Log the action
//   await ChatbotConversation.addLog(
//     contact.id,
//     conversation.flow_id,
//     step.id,
//     step.step_type,
//     step.message_text,
//     userResponse,
//     variables,
//   );
// }

// // Helper: Move to next step
// async function moveToNextStep(contact, currentStep, conversation) {
//   const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
//   let nextStepIndex = null;

//   if (currentStep.next_step_index !== null) {
//     nextStepIndex = currentStep.next_step_index;
//   } else {
//     const currentIndex = steps.findIndex((s) => s.id === currentStep.id);
//     nextStepIndex = currentIndex + 1;
//   }

//   if (nextStepIndex !== null && nextStepIndex < steps.length) {
//     const nextStep = steps[nextStepIndex];
//     await ChatbotConversation.update(conversation.id, {
//       current_step_id: nextStep.id,
//     });

//     // Execute next step immediately (for non-question steps)
//     if (nextStep.step_type !== "question") {
//       await executeStep(contact, nextStep, conversation, null);
//     }
//   } else {
//     // End of flow
//     await ChatbotConversation.update(conversation.id, { status: "completed" });
//   }
// }

// // Helper: Process user response
// async function processUserResponse(
//   contact,
//   currentStep,
//   conversation,
//   userResponse,
// ) {
//   let nextStepId = null;

//   // Handle button choices
//   if (currentStep.step_type === "buttons" && currentStep.buttons) {
//     const buttons = currentStep.buttons;
//     const matchedButton = buttons.find((b) =>
//       userResponse.toLowerCase().includes(b.title.toLowerCase()),
//     );

//     if (matchedButton && matchedButton.next_step !== undefined) {
//       const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
//       const targetStep = steps[matchedButton.next_step];
//       if (targetStep) {
//         nextStepId = targetStep.id;
//       }
//     }
//   }

//   // Handle conditions (keyword matching)
//   if (currentStep.step_type === "condition" && currentStep.conditions) {
//     const conditions = currentStep.conditions;
//     for (const [keyword, stepIndex] of Object.entries(conditions)) {
//       if (userResponse.toLowerCase().includes(keyword.toLowerCase())) {
//         const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
//         const targetStep = steps[stepIndex];
//         if (targetStep) {
//           nextStepId = targetStep.id;
//           break;
//         }
//       }
//     }
//   }

//   // Save response if question step
//   if (currentStep.step_type === "question" && currentStep.save_response_as) {
//     const variables = conversation.variables
//       ? JSON.parse(conversation.variables)
//       : {};
//     variables[currentStep.save_response_as] = userResponse;
//     await ChatbotConversation.update(conversation.id, { variables });
//   }

//   // Move to next step
//   if (nextStepId) {
//     await ChatbotConversation.update(conversation.id, {
//       current_step_id: nextStepId,
//     });
//     const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
//     const nextStep = steps.find((s) => s.id === nextStepId);
//     if (nextStep) {
//       await executeStep(contact, nextStep, conversation, null);
//     }
//   } else {
//     // Use default next step logic
//     await moveToNextStep(contact, currentStep, conversation);
//   }
// }

// // Get flow execution logs
// exports.getFlowLogs = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const [rows] = await db.query(
//       `SELECT * FROM chatbot_logs WHERE flow_id = ? ORDER BY created_at DESC LIMIT 100`,
//       [id],
//     );
//     res.json(rows);
//   } catch (err) {
//     console.error("Error in getFlowLogs:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Get active conversations
// exports.getActiveConversations = async (req, res) => {
//   try {
//     const [rows] = await db.query(
//       `SELECT c.*,
//               co.name as contact_name, co.phone as contact_phone,
//               f.name as flow_name
//        FROM chatbot_conversations c
//        LEFT JOIN contacts_wa co ON c.contact_id = co.id
//        LEFT JOIN chatbot_flows f ON c.flow_id = f.id
//        WHERE c.status = 'active'
//        ORDER BY c.updated_at DESC`,
//     );
//     res.json(rows);
//   } catch (err) {
//     console.error("Error in getActiveConversations:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

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