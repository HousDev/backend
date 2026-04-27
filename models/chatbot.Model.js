// const db = require("../config/database");

// const ChatbotFlow = {
//   // Get all flows
//   findAll: async () => {
//     try {
//       const [rows] = await db.query(
//         `SELECT * FROM chatbot_flows ORDER BY is_default DESC, created_at DESC`,
//       );
//       return rows;
//     } catch (error) {
//       console.error("Error in findAll:", error);
//       throw error;
//     }
//   },

//   // Get flow by ID with steps
//   findById: async (id) => {
//     try {
//       const [flowRows] = await db.query(
//         "SELECT * FROM chatbot_flows WHERE id = ?",
//         [id],
//       );
//       if (flowRows.length === 0) return null;

//       const [stepRows] = await db.query(
//         `SELECT * FROM chatbot_flow_steps WHERE flow_id = ? ORDER BY step_index ASC`,
//         [id],
//       );

//       const flow = flowRows[0];
//       flow.steps = stepRows.map((row) => ({
//         ...row,
//         buttons: row.buttons ? JSON.parse(row.buttons) : null,
//         conditions: row.conditions ? JSON.parse(row.conditions) : null,
//       }));

//       return flow;
//     } catch (error) {
//       console.error("Error in findById:", error);
//       throw error;
//     }
//   },

//   // Find active flows by trigger keyword
//   findActiveByKeyword: async (keyword) => {
//     try {
//       const [rows] = await db.query(
//         `SELECT * FROM chatbot_flows
//          WHERE is_active = TRUE
//          AND (trigger_keyword = ? OR trigger_keyword LIKE ? OR ? LIKE CONCAT('%', trigger_keyword, '%'))
//          ORDER BY is_default DESC, created_at ASC`,
//         [keyword, `%${keyword}%`, keyword],
//       );
//       return rows;
//     } catch (error) {
//       console.error("Error in findActiveByKeyword:", error);
//       throw error;
//     }
//   },

//   // Get default flow
//   findDefault: async () => {
//     try {
//       const [rows] = await db.query(
//         `SELECT * FROM chatbot_flows WHERE is_default = TRUE AND is_active = TRUE LIMIT 1`,
//       );
//       return rows[0] || null;
//     } catch (error) {
//       console.error("Error in findDefault:", error);
//       throw error;
//     }
//   },

//   // Create new flow
//   create: async (data) => {
//     try {
//       const { name, description, trigger_keyword, is_active, is_default } =
//         data;

//       // If this flow is default, remove default from others
//       if (is_default) {
//         await db.query(`UPDATE chatbot_flows SET is_default = FALSE`);
//       }

//       const [result] = await db.query(
//         `INSERT INTO chatbot_flows (name, description, trigger_keyword, is_active, is_default, created_at, updated_at)
//          VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
//         [
//           name,
//           description || null,
//           trigger_keyword || null,
//           is_active !== false,
//           is_default || false,
//         ],
//       );

//       return result.insertId;
//     } catch (error) {
//       console.error("Error in create:", error);
//       throw error;
//     }
//   },

//   // Update flow
//   update: async (id, data) => {
//     try {
//       const fields = [];
//       const values = [];

//       const allowedFields = [
//         "name",
//         "description",
//         "trigger_keyword",
//         "is_active",
//         "is_default",
//       ];

//       for (const [key, value] of Object.entries(data)) {
//         if (allowedFields.includes(key) && value !== undefined) {
//           fields.push(`${key} = ?`);
//           values.push(value);
//         }
//       }

//       if (fields.length === 0) return null;

//       // If setting as default, remove default from others
//       if (data.is_default) {
//         await db.query(
//           `UPDATE chatbot_flows SET is_default = FALSE WHERE id != ?`,
//           [id],
//         );
//       }

//       values.push(id);
//       await db.query(
//         `UPDATE chatbot_flows SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
//         values,
//       );

//       return ChatbotFlow.findById(id);
//     } catch (error) {
//       console.error("Error in update:", error);
//       throw error;
//     }
//   },

//   // Delete flow
//   delete: async (id) => {
//     try {
//       // Steps will be deleted automatically due to CASCADE
//       await db.query("DELETE FROM chatbot_flows WHERE id = ?", [id]);
//       return true;
//     } catch (error) {
//       console.error("Error in delete:", error);
//       throw error;
//     }
//   },

//   // Update flow status (active/inactive)
//   toggleStatus: async (id, isActive) => {
//     try {
//       await db.query(
//         `UPDATE chatbot_flows SET is_active = ?, updated_at = NOW() WHERE id = ?`,
//         [isActive, id],
//       );
//       return ChatbotFlow.findById(id);
//     } catch (error) {
//       console.error("Error in toggleStatus:", error);
//       throw error;
//     }
//   },
// };

// const ChatbotStep = {
//   // Get steps by flow ID
//   findByFlowId: async (flowId) => {
//     try {
//       const [rows] = await db.query(
//         `SELECT * FROM chatbot_flow_steps WHERE flow_id = ? ORDER BY step_index ASC`,
//         [flowId],
//       );
//       return rows.map((row) => ({
//         ...row,
//         buttons: row.buttons ? JSON.parse(row.buttons) : null,
//         conditions: row.conditions ? JSON.parse(row.conditions) : null,
//       }));
//     } catch (error) {
//       console.error("Error in findByFlowId:", error);
//       throw error;
//     }
//   },

//   // Create step
//   create: async (data) => {
//     try {
//       const {
//         flow_id,
//         step_index,
//         step_type,
//         message_text,
//         buttons,
//         save_response_as,
//         tag_id,
//         assign_to,
//         stage,
//         template_id,
//         next_step_index,
//         conditions,
//       } = data;

//       const [result] = await db.query(
//         `INSERT INTO chatbot_flow_steps
//          (flow_id, step_index, step_type, message_text, buttons, save_response_as,
//           tag_id, assign_to, stage, template_id, next_step_index, conditions, created_at, updated_at)
//          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
//         [
//           flow_id,
//           step_index,
//           step_type,
//           message_text || null,
//           buttons ? JSON.stringify(buttons) : null,
//           save_response_as || null,
//           tag_id || null,
//           assign_to || null,
//           stage || null,
//           template_id || null,
//           next_step_index || null,
//           conditions ? JSON.stringify(conditions) : null,
//         ],
//       );

//       return result.insertId;
//     } catch (error) {
//       console.error("Error in create:", error);
//       throw error;
//     }
//   },

//   // Bulk create/update steps
//   bulkSave: async (flowId, steps) => {
//     try {
//       // Delete existing steps
//       await db.query("DELETE FROM chatbot_flow_steps WHERE flow_id = ?", [
//         flowId,
//       ]);

//       // Insert new steps
//       for (const step of steps) {
//         await ChatbotStep.create({ ...step, flow_id: flowId });
//       }

//       return true;
//     } catch (error) {
//       console.error("Error in bulkSave:", error);
//       throw error;
//     }
//   },

//   // Delete step
//   delete: async (id) => {
//     try {
//       await db.query("DELETE FROM chatbot_flow_steps WHERE id = ?", [id]);
//       return true;
//     } catch (error) {
//       console.error("Error in delete:", error);
//       throw error;
//     }
//   },
// };

// const ChatbotConversation = {
//   // Get active conversation for contact
//   findActiveByContact: async (contactId) => {
//     try {
//       const [rows] = await db.query(
//         `SELECT * FROM chatbot_conversations
//          WHERE contact_id = ? AND status = 'active'
//          ORDER BY started_at DESC LIMIT 1`,
//         [contactId],
//       );
//       return rows[0] || null;
//     } catch (error) {
//       console.error("Error in findActiveByContact:", error);
//       throw error;
//     }
//   },

//   // Create new conversation
//   create: async (contactId, flowId, currentStepId = null) => {
//     try {
//       const [result] = await db.query(
//         `INSERT INTO chatbot_conversations
//          (contact_id, flow_id, current_step_id, completed_steps, variables, status, started_at, updated_at)
//          VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
//         [
//           contactId,
//           flowId,
//           currentStepId,
//           JSON.stringify([]),
//           JSON.stringify({}),
//           "active",
//         ],
//       );
//       return result.insertId;
//     } catch (error) {
//       console.error("Error in create:", error);
//       throw error;
//     }
//   },

//   // Update conversation
//   update: async (id, data) => {
//     try {
//       const fields = [];
//       const values = [];

//       if (data.current_step_id !== undefined) {
//         fields.push("current_step_id = ?");
//         values.push(data.current_step_id);
//       }
//       if (data.completed_steps !== undefined) {
//         fields.push("completed_steps = ?");
//         values.push(JSON.stringify(data.completed_steps));
//       }
//       if (data.variables !== undefined) {
//         fields.push("variables = ?");
//         values.push(JSON.stringify(data.variables));
//       }
//       if (data.status !== undefined) {
//         fields.push("status = ?");
//         values.push(data.status);
//         if (data.status === "completed") {
//           fields.push("completed_at = NOW()");
//         }
//       }

//       if (fields.length === 0) return null;

//       fields.push("updated_at = NOW()");
//       values.push(id);

//       await db.query(
//         `UPDATE chatbot_conversations SET ${fields.join(", ")} WHERE id = ?`,
//         values,
//       );

//       return true;
//     } catch (error) {
//       console.error("Error in update:", error);
//       throw error;
//     }
//   },

//   // Add log entry
//   addLog: async (
//     contactId,
//     flowId,
//     stepId,
//     action,
//     messageSent,
//     userResponse,
//     variablesUpdated,
//   ) => {
//     try {
//       await db.query(
//         `INSERT INTO chatbot_logs
//          (contact_id, flow_id, step_id, action, message_sent, user_response, variables_updated, created_at)
//          VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
//         [
//           contactId,
//           flowId,
//           stepId,
//           action,
//           messageSent,
//           userResponse,
//           variablesUpdated ? JSON.stringify(variablesUpdated) : null,
//         ],
//       );
//     } catch (error) {
//       console.error("Error in addLog:", error);
//       throw error;
//     }
//   },
// };

// module.exports = { ChatbotFlow, ChatbotStep, ChatbotConversation };

const db = require("../config/database");

// Helper function for safe JSON parsing
function safeJsonParse(value, fieldName) {
  if (!value) return null;

  try {
    // If it's already a string, parse it
    if (typeof value === "string") {
      // Check if it's the invalid "[object Object]" string
      if (value === "[object Object]") {
        console.log(`⚠️ Invalid ${fieldName} data found, setting to null`);
        return null;
      }
      return JSON.parse(value);
    }
    // If it's already an object, return as is
    if (typeof value === "object") {
      return value;
    }
    return null;
  } catch (e) {
    console.error(`Error parsing ${fieldName}:`, e);
    return null;
  }
}

const ChatbotFlow = {
  // Get all flows
  findAll: async () => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM chatbot_flows ORDER BY is_default DESC, created_at DESC`,
      );
      return rows;
    } catch (error) {
      console.error("Error in findAll:", error);
      throw error;
    }
  },

  // Get flow by ID with steps
  findById: async (id) => {
    try {
      const [flowRows] = await db.query(
        "SELECT * FROM chatbot_flows WHERE id = ?",
        [id],
      );
      if (flowRows.length === 0) return null;

      const [stepRows] = await db.query(
        `SELECT * FROM chatbot_flow_steps WHERE flow_id = ? ORDER BY step_index ASC`,
        [id],
      );

      const flow = flowRows[0];
      flow.steps = stepRows.map((row) => ({
        ...row,
        buttons: safeJsonParse(row.buttons, "buttons"),
        conditions: safeJsonParse(row.conditions, "conditions"),
      }));

      return flow;
    } catch (error) {
      console.error("Error in findById:", error);
      throw error;
    }
  },

  // Find active flows by trigger keyword
  findActiveByKeyword: async (keyword) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM chatbot_flows 
         WHERE is_active = TRUE 
         AND (trigger_keyword = ? OR trigger_keyword LIKE ? OR ? LIKE CONCAT('%', trigger_keyword, '%'))
         ORDER BY is_default DESC, created_at ASC`,
        [keyword, `%${keyword}%`, keyword],
      );
      return rows;
    } catch (error) {
      console.error("Error in findActiveByKeyword:", error);
      throw error;
    }
  },

  // Get default flow
  findDefault: async () => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM chatbot_flows WHERE is_default = TRUE AND is_active = TRUE LIMIT 1`,
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error in findDefault:", error);
      throw error;
    }
  },

  // Create new flow
  create: async (data) => {
    try {
      const { name, description, trigger_keyword, is_active, is_default } =
        data;

      if (is_default) {
        await db.query(`UPDATE chatbot_flows SET is_default = FALSE`);
      }

      const [result] = await db.query(
        `INSERT INTO chatbot_flows (name, description, trigger_keyword, is_active, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          name,
          description || null,
          trigger_keyword || null,
          is_active !== false,
          is_default || false,
        ],
      );

      return result.insertId;
    } catch (error) {
      console.error("Error in create:", error);
      throw error;
    }
  },

  // Update flow
  update: async (id, data) => {
    try {
      const fields = [];
      const values = [];

      const allowedFields = [
        "name",
        "description",
        "trigger_keyword",
        "is_active",
        "is_default",
      ];

      for (const [key, value] of Object.entries(data)) {
        if (allowedFields.includes(key) && value !== undefined) {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (fields.length === 0) return null;

      if (data.is_default) {
        await db.query(
          `UPDATE chatbot_flows SET is_default = FALSE WHERE id != ?`,
          [id],
        );
      }

      values.push(id);
      await db.query(
        `UPDATE chatbot_flows SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
        values,
      );

      return ChatbotFlow.findById(id);
    } catch (error) {
      console.error("Error in update:", error);
      throw error;
    }
  },

  // Delete flow
  delete: async (id) => {
    try {
      await db.query("DELETE FROM chatbot_flows WHERE id = ?", [id]);
      return true;
    } catch (error) {
      console.error("Error in delete:", error);
      throw error;
    }
  },

  // Update flow status
  toggleStatus: async (id, isActive) => {
    try {
      await db.query(
        `UPDATE chatbot_flows SET is_active = ?, updated_at = NOW() WHERE id = ?`,
        [isActive, id],
      );
      return ChatbotFlow.findById(id);
    } catch (error) {
      console.error("Error in toggleStatus:", error);
      throw error;
    }
  },
};

const ChatbotStep = {
  // Get steps by flow ID
  findByFlowId: async (flowId) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM chatbot_flow_steps WHERE flow_id = ? ORDER BY step_index ASC`,
        [flowId],
      );
      return rows.map((row) => ({
        ...row,
        buttons: safeJsonParse(row.buttons, "buttons"),
        conditions: safeJsonParse(row.conditions, "conditions"),
      }));
    } catch (error) {
      console.error("Error in findByFlowId:", error);
      throw error;
    }
  },

  // Get step by ID
  findById: async (id) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM chatbot_flow_steps WHERE id = ?`,
        [id],
      );
      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        ...row,
        buttons: safeJsonParse(row.buttons, "buttons"),
        conditions: safeJsonParse(row.conditions, "conditions"),
      };
    } catch (error) {
      console.error("Error in findById:", error);
      throw error;
    }
  },

  // Create step
  create: async (data) => {
    try {
      const {
        flow_id,
        step_index,
        step_type,
        message_text,
        buttons,
        save_response_as,
        tag_id,
        assign_to,
        stage,
        template_id,
        next_step_index,
        conditions,
      } = data;

      const [result] = await db.query(
        `INSERT INTO chatbot_flow_steps 
         (flow_id, step_index, step_type, message_text, buttons, save_response_as, 
          tag_id, assign_to, stage, template_id, next_step_index, conditions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          flow_id,
          step_index,
          step_type,
          message_text || null,
          buttons
            ? typeof buttons === "string"
              ? buttons
              : JSON.stringify(buttons)
            : null,
          save_response_as || null,
          tag_id || null,
          assign_to || null,
          stage || null,
          template_id || null,
          next_step_index || null,
          conditions
            ? typeof conditions === "string"
              ? conditions
              : JSON.stringify(conditions)
            : null,
        ],
      );

      return result.insertId;
    } catch (error) {
      console.error("Error in create:", error);
      throw error;
    }
  },

  // Bulk create/update steps
  bulkSave: async (flowId, steps) => {
    try {
      await db.query("DELETE FROM chatbot_flow_steps WHERE flow_id = ?", [
        flowId,
      ]);

      for (const step of steps) {
        await ChatbotStep.create({ ...step, flow_id: flowId });
      }

      return true;
    } catch (error) {
      console.error("Error in bulkSave:", error);
      throw error;
    }
  },

  // Delete step
  delete: async (id) => {
    try {
      await db.query("DELETE FROM chatbot_flow_steps WHERE id = ?", [id]);
      return true;
    } catch (error) {
      console.error("Error in delete:", error);
      throw error;
    }
  },
};

const ChatbotConversation = {
  // Get active conversation for contact
  findActiveByContact: async (contactId) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM chatbot_conversations 
         WHERE contact_id = ? AND status = 'active' 
         ORDER BY started_at DESC LIMIT 1`,
        [contactId],
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error in findActiveByContact:", error);
      throw error;
    }
  },

  // Create new conversation
  create: async (contactId, flowId, currentStepId = null) => {
    try {
      const [result] = await db.query(
        `INSERT INTO chatbot_conversations 
         (contact_id, flow_id, current_step_id, completed_steps, variables, status, started_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
        [
          contactId,
          flowId,
          currentStepId,
          JSON.stringify([]),
          JSON.stringify({}),
        ],
      );
      return result.insertId;
    } catch (error) {
      console.error("Error in create:", error);
      throw error;
    }
  },

  // Update conversation
  update: async (id, data) => {
    try {
      const fields = [];
      const values = [];

      if (data.current_step_id !== undefined) {
        fields.push("current_step_id = ?");
        values.push(data.current_step_id);
      }
      if (data.completed_steps !== undefined) {
        fields.push("completed_steps = ?");
        values.push(JSON.stringify(data.completed_steps));
      }
      if (data.variables !== undefined) {
        fields.push("variables = ?");
        values.push(JSON.stringify(data.variables));
      }
      if (data.status !== undefined) {
        fields.push("status = ?");
        values.push(data.status);
        if (data.status === "completed") {
          fields.push("completed_at = NOW()");
        }
      }

      if (fields.length === 0) return null;

      fields.push("updated_at = NOW()");
      values.push(id);

      await db.query(
        `UPDATE chatbot_conversations SET ${fields.join(", ")} WHERE id = ?`,
        values,
      );

      return true;
    } catch (error) {
      console.error("Error in update:", error);
      throw error;
    }
  },

  // Add log entry
  addLog: async (
    contactId,
    flowId,
    stepId,
    action,
    messageSent,
    userResponse,
    variablesUpdated,
  ) => {
    try {
      await db.query(
        `INSERT INTO chatbot_logs 
         (contact_id, flow_id, step_id, action, message_sent, user_response, variables_updated, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          contactId,
          flowId,
          stepId,
          action,
          messageSent,
          userResponse,
          variablesUpdated ? JSON.stringify(variablesUpdated) : null,
        ],
      );
    } catch (error) {
      console.error("Error in addLog:", error);
      throw error;
    }
  },
};

module.exports = { ChatbotFlow, ChatbotStep, ChatbotConversation };