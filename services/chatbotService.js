// // services/chatbotService.js
// const {
//   ChatbotFlow,
//   ChatbotStep,
//   ChatbotConversation,
// } = require("../models/chatbot.Model");
// const Template = require("../models/template.Model");
// const Contact = require("../models/contact.Model");
// const {
//   sendTextMessage,
//   sendTemplateMessage,
// } = require("../integrations/whatsapp");

// // Process incoming message through chatbot
// async function processChatbotMessage(contactId, message) {
//   console.log("🔍 [DEBUG] ===== PROCESS CHATBOT MESSAGE =====");
//   console.log("🔍 [DEBUG] contactId:", contactId);
//   console.log("🔍 [DEBUG] message:", message);
  
//   try {
//     if (!contactId || !message) {
//       return { processed: false, error: "Contact ID and message are required" };
//     }

//     const contact = await Contact.findById(contactId);
//     if (!contact) {
//       return { processed: false, error: "Contact not found" };
//     }
    
//     console.log("🔍 [DEBUG] Contact found:", contact.name, contact.phone);

//     let conversation = await ChatbotConversation.findActiveByContact(contactId);
//     let flow = null;
//     let currentStep = null;

//     if (!conversation) {
//       console.log("🔍 [DEBUG] No active conversation, finding matching flow...");
      
//       const matchingFlows = await ChatbotFlow.findActiveByKeyword(
//         message.toLowerCase(),
//       );
//       flow = matchingFlows[0] || (await ChatbotFlow.findDefault());

//       if (!flow) {
//         console.log("🔍 [DEBUG] No flow found, sending default message");
//         await sendTextMessage(
//           contact.phone,
//           "Thank you for your message. Our team will get back to you shortly.",
//         );
//         return { processed: false, message: "No matching flow found" };
//       }

//       console.log("🔍 [DEBUG] Flow found:", flow.name, "ID:", flow.id);

//       const steps = await ChatbotStep.findByFlowId(flow.id);
//       console.log("🔍 [DEBUG] Steps found:", steps.length);
      
//       const firstStep = steps[0];
//       console.log("🔍 [DEBUG] First step:", firstStep?.step_type, firstStep?.message_text);

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

//       if (currentStep) {
//         console.log("🔍 [DEBUG] Executing first step...");
//         await executeStep(contact, currentStep, conversation, null);
//       }
//     } else {
//       console.log("🔍 [DEBUG] Active conversation found, ID:", conversation.id);
      
//       flow = await ChatbotFlow.findById(conversation.flow_id);
//       const steps = await ChatbotStep.findByFlowId(flow.id);
//       currentStep = steps.find((s) => s.id === conversation.current_step_id);

//       if (currentStep) {
//         console.log("🔍 [DEBUG] Processing user response for step:", currentStep.step_type);
//         await processUserResponse(contact, currentStep, conversation, message);
//       }
//     }

//     return { processed: true, flow: flow?.name };
//   } catch (err) {
//     console.error("❌ Error in processChatbotMessage:", err);
//     return { processed: false, error: err.message };
//   }
// }

// // Helper: Replace variables in message
// function replaceVariables(text, contact, variables = {}) {
//   let result = text || '';
  
//   // Replace contact fields
//   if (contact) {
//     result = result.replace(/\{\{1\}\}/g, contact.name || 'there');
//     result = result.replace(/\{\{name\}\}/g, contact.name || 'there');
//     result = result.replace(/\{\{phone\}\}/g, contact.phone || '');
//   }
  
//   // Replace custom variables
//   for (const [key, value] of Object.entries(variables)) {
//     result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
//   }
  
//   return result;
// }

// // Helper: Execute a step
// async function executeStep(contact, step, conversation, userResponse) {
//   console.log("🔍 [DEBUG] ===== EXECUTE STEP =====");
//   console.log("🔍 [DEBUG] Step Type:", step.step_type);
//   console.log("🔍 [DEBUG] Step Message Text:", step.message_text);
//   console.log("🔍 [DEBUG] Contact Phone:", contact.phone);
  
//   let variables = {};
//   if (conversation.variables) {
//     try {
//       variables = typeof conversation.variables === 'string'
//         ? JSON.parse(conversation.variables)
//         : conversation.variables;
//     } catch (e) {
//       console.error("❌ Error parsing variables:", e);
//       variables = {};
//     }
//   }

//   switch (step.step_type) {
//     case "message":
//       console.log("🔍 [DEBUG] Inside MESSAGE case");
      
//       // Replace variables in message
//       let messageText = replaceVariables(step.message_text, contact, variables);
//       console.log("📤 Final message:", messageText);
      
//       try {
//         const msgId = await sendTextMessage(contact.phone, messageText);
//         console.log("✅ Message sent successfully! ID:", msgId);
//       } catch (err) {
//         console.error("❌ Failed to send message:", err.message);
//       }
      
//       await moveToNextStep(contact, step, conversation);
//       break;

//     case "question":
//       console.log("🔍 [DEBUG] Inside QUESTION case");
      
//       let questionText = replaceVariables(step.message_text, contact, variables);
//       console.log("📤 Question:", questionText);
      
//       try {
//         const msgId = await sendTextMessage(contact.phone, questionText);
//         console.log("✅ Question sent! ID:", msgId);
//       } catch (err) {
//         console.error("❌ Failed to send question:", err.message);
//       }
      
//       if (userResponse && step.save_response_as) {
//         variables[step.save_response_as] = userResponse;
//         await ChatbotConversation.update(conversation.id, {
//           variables: JSON.stringify(variables)
//         });
//         console.log("🔍 [DEBUG] Saved response as:", step.save_response_as);
//       }
//       break;

//     case "end":
//       console.log("🔍 [DEBUG] Inside END case - Completing conversation");
//       await ChatbotConversation.update(conversation.id, {
//         status: "completed",
//       });
//       break;
      
//     default:
//       console.log("🔍 [DEBUG] Unknown or not implemented step type:", step.step_type);
//       await moveToNextStep(contact, step, conversation);
//       break;
//   }

//   await ChatbotConversation.addLog(
//     contact.id,
//     conversation.flow_id,
//     step.id,
//     step.step_type,
//     step.message_text,
//     userResponse,
//     variables,
//   );
//   console.log("🔍 [DEBUG] Log added to database");
// }

// // Helper: Move to next step
// async function moveToNextStep(contact, currentStep, conversation) {
//   console.log("🔍 [DEBUG] ===== MOVE TO NEXT STEP =====");
  
//   const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
//   let nextStepIndex = null;

//   if (currentStep.next_step_index !== null && currentStep.next_step_index !== undefined) {
//     nextStepIndex = currentStep.next_step_index;
//   } else {
//     const currentIndex = steps.findIndex((s) => s.id === currentStep.id);
//     nextStepIndex = currentIndex + 1;
//   }

//   if (nextStepIndex !== null && nextStepIndex < steps.length) {
//     const nextStep = steps[nextStepIndex];
//     console.log("🔍 [DEBUG] Next step found:", nextStep.step_type);
    
//     await ChatbotConversation.update(conversation.id, {
//       current_step_id: nextStep.id,
//     });

//     if (nextStep.step_type !== "question" && nextStep.step_type !== "condition") {
//       await executeStep(contact, nextStep, conversation, null);
//     }
//   } else {
//     console.log("🔍 [DEBUG] No more steps, ending conversation");
//     await ChatbotConversation.update(conversation.id, { status: "completed" });
//   }
// }

// // Helper: Process user response
// async function processUserResponse(contact, currentStep, conversation, userResponse) {
//   console.log("🔍 [DEBUG] ===== PROCESS USER RESPONSE =====");
//   console.log("🔍 [DEBUG] User response:", userResponse);
  
//   let nextStepId = null;

//   if (currentStep.step_type === "buttons" && currentStep.buttons) {
//     const buttons = currentStep.buttons;
//     const selectedIndex = parseInt(userResponse) - 1;
//     if (!isNaN(selectedIndex) && buttons[selectedIndex]) {
//       const selectedButton = buttons[selectedIndex];
//       if (selectedButton.next_step !== undefined && selectedButton.next_step !== null) {
//         const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
//         const targetStep = steps[selectedButton.next_step];
//         if (targetStep) nextStepId = targetStep.id;
//       }
//     }
//   }

//   if (currentStep.step_type === "question" && currentStep.save_response_as) {
//     let variables = {};
//     if (conversation.variables) {
//       try {
//         variables = typeof conversation.variables === 'string'
//           ? JSON.parse(conversation.variables)
//           : conversation.variables;
//       } catch (e) {}
//     }
//     variables[currentStep.save_response_as] = userResponse;
//     await ChatbotConversation.update(conversation.id, {
//       variables: JSON.stringify(variables)
//     });
//   }

//   if (nextStepId) {
//     await ChatbotConversation.update(conversation.id, { current_step_id: nextStepId });
//     const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
//     const nextStep = steps.find((s) => s.id === nextStepId);
//     if (nextStep) await executeStep(contact, nextStep, conversation, userResponse);
//   } else {
//     await moveToNextStep(contact, currentStep, conversation);
//   }
// }

// module.exports = { processChatbotMessage };

// // services/chatbotService.js
// const {
//   ChatbotFlow,
//   ChatbotStep,
//   ChatbotConversation,
// } = require("../models/chatbot.Model");

// const Contact = require("../models/contact.Model");
// const { sendTextMessage } = require("../integrations/whatsapp");

// // ================= MAIN FUNCTION =================

// async function processChatbotMessage(contactId, message) {
//   try {
//     if (!contactId || !message) {
//       return { processed: false, error: "Missing data" };
//     }

//     const contact = await Contact.findById(contactId);
//     if (!contact) return { processed: false, error: "Contact not found" };

//     let conversation =
//       await ChatbotConversation.findActiveByContact(contactId);

//     // 🔥 FIX 1: अगर completed है → नया flow start
//     if (conversation && conversation.status === "completed") {
//       conversation = null;
//     }

//     let flow = null;
//     let currentStep = null;

//     // 🔥 FIX 2: अगर conversation नहीं है → नया flow create
//     if (!conversation) {
//       let flows = await ChatbotFlow.findActiveByKeyword(
//         message.toLowerCase()
//       );

//       flow =
//         flows.length > 0
//           ? flows[0]
//           : await ChatbotFlow.findDefault();

//       if (!flow) {
//         await sendTextMessage(
//           contact.phone,
//           "Thanks! We will get back to you shortly."
//         );
//         return { processed: false };
//       }

//       const steps = await ChatbotStep.findByFlowId(flow.id);
//       const firstStep = steps[0];

//       const convId = await ChatbotConversation.create(
//         contactId,
//         flow.id,
//         firstStep?.id
//       );

//       conversation = {
//         id: convId,
//         flow_id: flow.id,
//         current_step_id: firstStep?.id,
//         variables: {},
//         status: "active",
//       };

//       if (firstStep) {
//         await executeStep(contact, firstStep, conversation, null);
//       }
//     } else {
//       // 🔥 existing conversation continue
//       flow = await ChatbotFlow.findById(conversation.flow_id);
//       const steps = await ChatbotStep.findByFlowId(flow.id);

//       currentStep = steps.find(
//         (s) => s.id === conversation.current_step_id
//       );

//       if (currentStep) {
//         await processUserResponse(
//           contact,
//           currentStep,
//           conversation,
//           message
//         );
//       }
//     }

//     return { processed: true };
//   } catch (err) {
//     console.error("❌ Chatbot Error:", err);
//     return { processed: false, error: err.message };
//   }
// }

// // ================= EXECUTE STEP =================

// async function executeStep(contact, step, conversation, userResponse) {
//   let variables = {};

//   if (conversation.variables) {
//     try {
//       variables =
//         typeof conversation.variables === "string"
//           ? JSON.parse(conversation.variables)
//           : conversation.variables;
//     } catch {}
//   }

//   switch (step.step_type) {
//     case "message":
//       await sendTextMessage(contact.phone, step.message_text || "");
//       await moveToNextStep(contact, step, conversation);
//       break;

//     case "question":
//       await sendTextMessage(contact.phone, step.message_text || "");
//       break;

//     // 🔥 CONDITION FIX
//     case "condition":
//       let conditions = step.conditions || {};
//       let nextIndex = conditions[userResponse];

//       if (nextIndex !== undefined) {
//         const steps = await ChatbotStep.findByFlowId(
//           conversation.flow_id
//         );
//         const nextStep = steps[nextIndex];

//         if (nextStep) {
//           await ChatbotConversation.update(conversation.id, {
//             current_step_id: nextStep.id,
//           });

//           await executeStep(
//             contact,
//             nextStep,
//             conversation,
//             userResponse
//           );
//         }
//       }
//       break;

//     // 🔥 END FIX (Auto Restart)
//     case "end":
//       await ChatbotConversation.update(conversation.id, {
//         status: "completed",
//       });

//       const flow = await ChatbotFlow.findDefault();
//       const steps = await ChatbotStep.findByFlowId(flow.id);
//       const firstStep = steps[0];

//       const newId = await ChatbotConversation.create(
//         contact.id,
//         flow.id,
//         firstStep?.id
//       );

//       if (firstStep) {
//         await executeStep(
//           contact,
//           firstStep,
//           {
//             id: newId,
//             flow_id: flow.id,
//             current_step_id: firstStep.id,
//             variables: {},
//           },
//           null
//         );
//       }
//       break;

//     default:
//       await moveToNextStep(contact, step, conversation);
//       break;
//   }
// }

// // ================= NEXT STEP =================

// async function moveToNextStep(contact, currentStep, conversation) {
//   const steps = await ChatbotStep.findByFlowId(conversation.flow_id);

//   let nextIndex =
//     currentStep.next_step_index !== null
//       ? currentStep.next_step_index
//       : steps.findIndex((s) => s.id === currentStep.id) + 1;

//   if (nextIndex < steps.length) {
//     const nextStep = steps[nextIndex];

//     await ChatbotConversation.update(conversation.id, {
//       current_step_id: nextStep.id,
//     });

//     if (
//       nextStep.step_type !== "question" &&
//       nextStep.step_type !== "condition"
//     ) {
//       await executeStep(contact, nextStep, conversation, null);
//     }
//   } else {
//     await ChatbotConversation.update(conversation.id, {
//       status: "completed",
//     });
//   }
// }

// // ================= USER RESPONSE =================

// async function processUserResponse(
//   contact,
//   currentStep,
//   conversation,
//   userResponse
// ) {
//   let variables = {};

//   if (conversation.variables) {
//     try {
//       variables =
//         typeof conversation.variables === "string"
//           ? JSON.parse(conversation.variables)
//           : conversation.variables;
//     } catch {}
//   }

//   // save response
//   if (currentStep.step_type === "question") {
//     if (currentStep.save_response_as) {
//       variables[currentStep.save_response_as] = userResponse;

//       await ChatbotConversation.update(conversation.id, {
//         variables: JSON.stringify(variables),
//       });
//     }
//   }

//   await moveToNextStep(contact, currentStep, conversation);
// }

// module.exports = { processChatbotMessage };

// services/chatbotService.js
const {
  ChatbotFlow,
  ChatbotStep,
  ChatbotConversation,
} = require("../models/chatbot.Model");

const Contact = require("../models/contact.Model");
const { sendTextMessage } = require("../integrations/whatsapp");

// ================= HELPER: REPLACE VARIABLES =================
function replaceVariables(text, contact) {
  if (!text) return text;
  
  let result = text;
  
  // Replace {{1}} with contact name
  if (result.includes('{{1}}')) {
    result = result.replace(/\{\{1\}\}/g, contact.name || 'there');
    console.log(`✅ Replaced {{1}} with: ${contact.name}`);
  }
  
  // Replace {{name}} if exists
  if (result.includes('{{name}}')) {
    result = result.replace(/\{\{name\}\}/g, contact.name || 'there');
  }
  
  // Replace {{phone}} if exists
  if (result.includes('{{phone}}')) {
    result = result.replace(/\{\{phone\}\}/g, contact.phone || '');
  }
  
  return result;
}

// ================= MAIN FUNCTION =================
async function processChatbotMessage(contactId, message) {
  try {
    if (!contactId || !message) {
      return { processed: false, error: "Missing data" };
    }

    const contact = await Contact.findById(contactId);
    if (!contact) return { processed: false, error: "Contact not found" };

    let conversation =
      await ChatbotConversation.findActiveByContact(contactId);

    // 🔥 FIX 1: अगर completed है → नया flow start
    if (conversation && conversation.status === "completed") {
      conversation = null;
    }

    let flow = null;
    let currentStep = null;

    // 🔥 FIX 2: अगर conversation नहीं है → नया flow create
    if (!conversation) {
      let flows = await ChatbotFlow.findActiveByKeyword(
        message.toLowerCase()
      );

      flow =
        flows.length > 0
          ? flows[0]
          : await ChatbotFlow.findDefault();

      if (!flow) {
        await sendTextMessage(
          contact.phone,
          "Thanks! We will get back to you shortly."
        );
        return { processed: false };
      }

      const steps = await ChatbotStep.findByFlowId(flow.id);
      const firstStep = steps[0];

      const convId = await ChatbotConversation.create(
        contactId,
        flow.id,
        firstStep?.id
      );

      conversation = {
        id: convId,
        flow_id: flow.id,
        current_step_id: firstStep?.id,
        variables: {},
        status: "active",
      };

      if (firstStep) {
        await executeStep(contact, firstStep, conversation, null);
      }
    } else {
      // 🔥 existing conversation continue
      flow = await ChatbotFlow.findById(conversation.flow_id);
      const steps = await ChatbotStep.findByFlowId(flow.id);

      currentStep = steps.find(
        (s) => s.id === conversation.current_step_id
      );

      if (currentStep) {
        await processUserResponse(
          contact,
          currentStep,
          conversation,
          message
        );
      }
    }

    return { processed: true };
  } catch (err) {
    console.error("❌ Chatbot Error:", err);
    return { processed: false, error: err.message };
  }
}

// ================= EXECUTE STEP =================
async function executeStep(contact, step, conversation, userResponse) {
  let variables = {};

  if (conversation.variables) {
    try {
      variables =
        typeof conversation.variables === "string"
          ? JSON.parse(conversation.variables)
          : conversation.variables;
    } catch {}
  }

  switch (step.step_type) {
    case "message":
      // ✅ FIXED: Replace variables before sending
      let messageText = step.message_text || "";
      let finalMessage = replaceVariables(messageText, contact);
      console.log("📤 Original message:", messageText);
      console.log("📤 Final message after replacement:", finalMessage);
      
      await sendTextMessage(contact.phone, finalMessage);
      await moveToNextStep(contact, step, conversation);
      break;

    case "question":
      // ✅ FIXED: Replace variables in question too
      let questionText = step.message_text || "";
      let finalQuestion = replaceVariables(questionText, contact);
      console.log("📤 Question:", finalQuestion);
      
      await sendTextMessage(contact.phone, finalQuestion);
      break;

    // 🔥 CONDITION FIX
    case "condition":
      let conditions = step.conditions || {};
      let nextIndex = conditions[userResponse];

      if (nextIndex !== undefined) {
        const steps = await ChatbotStep.findByFlowId(
          conversation.flow_id
        );
        const nextStep = steps[nextIndex];

        if (nextStep) {
          await ChatbotConversation.update(conversation.id, {
            current_step_id: nextStep.id,
          });

          await executeStep(
            contact,
            nextStep,
            conversation,
            userResponse
          );
        }
      }
      break;

    // 🔥 END FIX (Auto Restart)
    case "end":
      await ChatbotConversation.update(conversation.id, {
        status: "completed",
      });

      const flow = await ChatbotFlow.findDefault();
      const steps = await ChatbotStep.findByFlowId(flow.id);
      const firstStep = steps[0];

      const newId = await ChatbotConversation.create(
        contact.id,
        flow.id,
        firstStep?.id
      );

      if (firstStep) {
        await executeStep(
          contact,
          firstStep,
          {
            id: newId,
            flow_id: flow.id,
            current_step_id: firstStep.id,
            variables: {},
          },
          null
        );
      }
      break;

    default:
      await moveToNextStep(contact, step, conversation);
      break;
  }
}

// ================= NEXT STEP =================
async function moveToNextStep(contact, currentStep, conversation) {
  const steps = await ChatbotStep.findByFlowId(conversation.flow_id);

  let nextIndex =
    currentStep.next_step_index !== null
      ? currentStep.next_step_index
      : steps.findIndex((s) => s.id === currentStep.id) + 1;

  if (nextIndex < steps.length) {
    const nextStep = steps[nextIndex];

    await ChatbotConversation.update(conversation.id, {
      current_step_id: nextStep.id,
    });

    if (
      nextStep.step_type !== "question" &&
      nextStep.step_type !== "condition"
    ) {
      await executeStep(contact, nextStep, conversation, null);
    }
  } else {
    await ChatbotConversation.update(conversation.id, {
      status: "completed",
    });
  }
}

// ================= USER RESPONSE =================
async function processUserResponse(
  contact,
  currentStep,
  conversation,
  userResponse
) {
  let variables = {};

  if (conversation.variables) {
    try {
      variables =
        typeof conversation.variables === "string"
          ? JSON.parse(conversation.variables)
          : conversation.variables;
    } catch {}
  }

  // save response
  if (currentStep.step_type === "question") {
    if (currentStep.save_response_as) {
      variables[currentStep.save_response_as] = userResponse;

      await ChatbotConversation.update(conversation.id, {
        variables: JSON.stringify(variables),
      });
    }
  }

  await moveToNextStep(contact, currentStep, conversation);
}

module.exports = { processChatbotMessage };