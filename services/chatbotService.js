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
//   try {
//     if (!contactId || !message) {
//       return { processed: false, error: "Contact ID and message are required" };
//     }

//     const contact = await Contact.findById(contactId);
//     if (!contact) {
//       return { processed: false, error: "Contact not found" };
//     }

//     // Get active conversation or start new one
//     let conversation = await ChatbotConversation.findActiveByContact(contactId);
//     let flow = null;
//     let currentStep = null;

//     if (!conversation) {
//       const matchingFlows = await ChatbotFlow.findActiveByKeyword(
//         message.toLowerCase(),
//       );
//       flow = matchingFlows[0] || (await ChatbotFlow.findDefault());

//       if (!flow) {
//         await sendTextMessage(
//           contact.phone,
//           "Thank you for your message. Our team will get back to you shortly.",
//         );
//         return { processed: false, message: "No matching flow found" };
//       }

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

//       if (currentStep) {
//         await executeStep(contact, currentStep, conversation, null);
//       }
//     } else {
//       flow = await ChatbotFlow.findById(conversation.flow_id);
//       const steps = await ChatbotStep.findByFlowId(flow.id);
//       currentStep = steps.find((s) => s.id === conversation.current_step_id);

//       if (currentStep) {
//         await processUserResponse(contact, currentStep, conversation, message);
//       }
//     }

//     return { processed: true, flow: flow?.name };
//   } catch (err) {
//     console.error("Error in processChatbotMessage:", err);
//     return { processed: false, error: err.message };
//   }
// }

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
//       if (userResponse && step.save_response_as) {
//         variables[step.save_response_as] = userResponse;
//         await ChatbotConversation.update(conversation.id, { variables });
//       }
//       break;

//     case "buttons":
//       if (step.buttons && step.buttons.length > 0) {
//         const buttonText = step.buttons
//           .map((b, i) => `${i + 1}. ${b.title}`)
//           .join("\n");
//         await sendTextMessage(
//           contact.phone,
//           `${step.message_text}\n\n${buttonText}\n\nReply with the number`,
//         );
//       } else {
//         await sendTextMessage(contact.phone, step.message_text);
//       }
//       await moveToNextStep(contact, step, conversation);
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

//   if (
//     currentStep.next_step_index !== null &&
//     currentStep.next_step_index !== undefined
//   ) {
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

//     if (
//       nextStep.step_type !== "question" &&
//       nextStep.step_type !== "condition"
//     ) {
//       await executeStep(contact, nextStep, conversation, null);
//     }
//   } else {
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
//     const selectedIndex = parseInt(userResponse) - 1;

//     if (!isNaN(selectedIndex) && buttons[selectedIndex]) {
//       const selectedButton = buttons[selectedIndex];
//       if (
//         selectedButton.next_step !== undefined &&
//         selectedButton.next_step !== null
//       ) {
//         const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
//         const targetStep = steps[selectedButton.next_step];
//         if (targetStep) {
//           nextStepId = targetStep.id;
//         }
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
//     await moveToNextStep(contact, currentStep, conversation);
//   }
// }

// module.exports = { processChatbotMessage };


// services/chatbotService.js
const {
  ChatbotFlow,
  ChatbotStep,
  ChatbotConversation,
} = require("../models/chatbot.Model");
const Template = require("../models/template.Model");
const Contact = require("../models/contact.Model");
const {
  sendTextMessage,
  sendTemplateMessage,
} = require("../integrations/whatsapp");

// Process incoming message through chatbot
async function processChatbotMessage(contactId, message) {
  console.log("🔍 [DEBUG] ===== PROCESS CHATBOT MESSAGE =====");
  console.log("🔍 [DEBUG] contactId:", contactId);
  console.log("🔍 [DEBUG] message:", message);
  
  try {
    if (!contactId || !message) {
      return { processed: false, error: "Contact ID and message are required" };
    }

    const contact = await Contact.findById(contactId);
    if (!contact) {
      return { processed: false, error: "Contact not found" };
    }
    
    console.log("🔍 [DEBUG] Contact found:", contact.name, contact.phone);

    // Get active conversation or start new one
    let conversation = await ChatbotConversation.findActiveByContact(contactId);
    let flow = null;
    let currentStep = null;

    if (!conversation) {
      console.log("🔍 [DEBUG] No active conversation, finding matching flow...");
      
      const matchingFlows = await ChatbotFlow.findActiveByKeyword(
        message.toLowerCase(),
      );
      flow = matchingFlows[0] || (await ChatbotFlow.findDefault());

      if (!flow) {
        console.log("🔍 [DEBUG] No flow found, sending default message");
        await sendTextMessage(
          contact.phone,
          "Thank you for your message. Our team will get back to you shortly.",
        );
        return { processed: false, message: "No matching flow found" };
      }

      console.log("🔍 [DEBUG] Flow found:", flow.name, "ID:", flow.id);

      const steps = await ChatbotStep.findByFlowId(flow.id);
      console.log("🔍 [DEBUG] Steps found:", steps.length);
      
      const firstStep = steps[0];
      console.log("🔍 [DEBUG] First step:", firstStep?.step_type, firstStep?.message_text);

      const convId = await ChatbotConversation.create(
        contactId,
        flow.id,
        firstStep?.id,
      );
      conversation = {
        id: convId,
        flow_id: flow.id,
        current_step_id: firstStep?.id,
        variables: {},
      };
      currentStep = firstStep;

      if (currentStep) {
        console.log("🔍 [DEBUG] Executing first step...");
        await executeStep(contact, currentStep, conversation, null);
      }
    } else {
      console.log("🔍 [DEBUG] Active conversation found, ID:", conversation.id);
      
      flow = await ChatbotFlow.findById(conversation.flow_id);
      const steps = await ChatbotStep.findByFlowId(flow.id);
      currentStep = steps.find((s) => s.id === conversation.current_step_id);

      if (currentStep) {
        console.log("🔍 [DEBUG] Processing user response for step:", currentStep.step_type);
        await processUserResponse(contact, currentStep, conversation, message);
      }
    }

    return { processed: true, flow: flow?.name };
  } catch (err) {
    console.error("❌ Error in processChatbotMessage:", err);
    return { processed: false, error: err.message };
  }
}

// Helper: Execute a step
async function executeStep(contact, step, conversation, userResponse) {
  console.log("🔍 [DEBUG] ===== EXECUTE STEP =====");
  console.log("🔍 [DEBUG] Step Type:", step.step_type);
  console.log("🔍 [DEBUG] Step Message Text:", step.message_text);
  console.log("🔍 [DEBUG] Contact Phone:", contact.phone);
  
  let variables = {};
  if (conversation.variables) {
    try {
      variables = typeof conversation.variables === 'string' 
        ? JSON.parse(conversation.variables) 
        : conversation.variables;
    } catch (e) {
      console.error("❌ Error parsing variables:", e);
      variables = {};
    }
  }

  switch (step.step_type) {
    case "message":
      console.log("🔍 [DEBUG] Inside MESSAGE case");
      console.log("📤 Sending message to:", contact.phone);
      console.log("📤 Message content:", step.message_text);
      
      try {
        const msgId = await sendTextMessage(contact.phone, step.message_text);
        console.log("✅ Message sent successfully! ID:", msgId);
      } catch (err) {
        console.error("❌ Failed to send message:", err.message);
        console.error("❌ Full error:", err);
      }
      
      console.log("🔍 [DEBUG] Moving to next step...");
      await moveToNextStep(contact, step, conversation);
      break;

    case "question":
      console.log("🔍 [DEBUG] Inside QUESTION case");
      console.log("📤 Sending question to:", contact.phone);
      console.log("📤 Question:", step.message_text);
      
      try {
        const msgId = await sendTextMessage(contact.phone, step.message_text);
        console.log("✅ Question sent! ID:", msgId);
      } catch (err) {
        console.error("❌ Failed to send question:", err.message);
      }
      
      if (userResponse && step.save_response_as) {
        variables[step.save_response_as] = userResponse;
        await ChatbotConversation.update(conversation.id, { 
          variables: JSON.stringify(variables) 
        });
        console.log("🔍 [DEBUG] Saved response as:", step.save_response_as);
      }
      break;

    case "buttons":
      console.log("🔍 [DEBUG] Inside BUTTONS case");
      if (step.buttons && step.buttons.length > 0) {
        const buttonText = step.buttons
          .map((b, i) => `${i + 1}. ${b.title}`)
          .join("\n");
        const fullMessage = `${step.message_text}\n\n${buttonText}\n\nReply with the number`;
        
        try {
          const msgId = await sendTextMessage(contact.phone, fullMessage);
          console.log("✅ Buttons message sent! ID:", msgId);
        } catch (err) {
          console.error("❌ Failed to send buttons:", err.message);
        }
      } else {
        try {
          const msgId = await sendTextMessage(contact.phone, step.message_text);
          console.log("✅ Message sent! ID:", msgId);
        } catch (err) {
          console.error("❌ Failed to send message:", err.message);
        }
      }
      await moveToNextStep(contact, step, conversation);
      break;

    case "template":
      console.log("🔍 [DEBUG] Inside TEMPLATE case");
      if (step.template_id) {
        const template = await Template.findById(step.template_id);
        if (template && template.status === "APPROVED") {
          try {
            const msgId = await sendTemplateMessage(
              contact.phone,
              template.name,
              template.language,
              [],
            );
            console.log("✅ Template message sent! ID:", msgId);
          } catch (err) {
            console.error("❌ Failed to send template:", err.message);
          }
        } else {
          console.log("⚠️ Template not found or not approved");
        }
      }
      await moveToNextStep(contact, step, conversation);
      break;

    case "tag":
      console.log("🔍 [DEBUG] Inside TAG case");
      if (step.tag_id) {
        await Contact.addTag(contact.id, step.tag_id);
        console.log("✅ Tag added:", step.tag_id);
      }
      await moveToNextStep(contact, step, conversation);
      break;

    case "assign":
      console.log("🔍 [DEBUG] Inside ASSIGN case");
      if (step.assign_to) {
        await Contact.update(contact.id, { assigned_to: step.assign_to });
        console.log("✅ Contact assigned to:", step.assign_to);
      }
      await moveToNextStep(contact, step, conversation);
      break;

    case "stage":
      console.log("🔍 [DEBUG] Inside STAGE case");
      if (step.stage) {
        await Contact.update(contact.id, { stage: step.stage });
        console.log("✅ Stage updated to:", step.stage);
      }
      await moveToNextStep(contact, step, conversation);
      break;

    case "end":
      console.log("🔍 [DEBUG] Inside END case - Completing conversation");
      await ChatbotConversation.update(conversation.id, {
        status: "completed",
      });
      break;
      
    default:
      console.log("🔍 [DEBUG] Unknown step type:", step.step_type);
      await moveToNextStep(contact, step, conversation);
      break;
  }

  // Log the action
  await ChatbotConversation.addLog(
    contact.id,
    conversation.flow_id,
    step.id,
    step.step_type,
    step.message_text,
    userResponse,
    variables,
  );
  console.log("🔍 [DEBUG] Log added to database");
}

// Helper: Move to next step
async function moveToNextStep(contact, currentStep, conversation) {
  console.log("🔍 [DEBUG] ===== MOVE TO NEXT STEP =====");
  
  const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
  let nextStepIndex = null;

  if (currentStep.next_step_index !== null && currentStep.next_step_index !== undefined) {
    nextStepIndex = currentStep.next_step_index;
    console.log("🔍 [DEBUG] Using custom next_step_index:", nextStepIndex);
  } else {
    const currentIndex = steps.findIndex((s) => s.id === currentStep.id);
    nextStepIndex = currentIndex + 1;
    console.log("🔍 [DEBUG] Calculated next step index:", nextStepIndex);
  }

  if (nextStepIndex !== null && nextStepIndex < steps.length) {
    const nextStep = steps[nextStepIndex];
    console.log("🔍 [DEBUG] Next step found:", nextStep.step_type, nextStep.message_text);
    
    await ChatbotConversation.update(conversation.id, {
      current_step_id: nextStep.id,
    });

    if (nextStep.step_type !== "question" && nextStep.step_type !== "condition") {
      console.log("🔍 [DEBUG] Executing next step immediately...");
      await executeStep(contact, nextStep, conversation, null);
    } else {
      console.log("🔍 [DEBUG] Next step is question/condition, waiting for user response");
    }
  } else {
    console.log("🔍 [DEBUG] No more steps, ending conversation");
    await ChatbotConversation.update(conversation.id, { status: "completed" });
  }
}

// Helper: Process user response
async function processUserResponse(
  contact,
  currentStep,
  conversation,
  userResponse,
) {
  console.log("🔍 [DEBUG] ===== PROCESS USER RESPONSE =====");
  console.log("🔍 [DEBUG] User response:", userResponse);
  console.log("🔍 [DEBUG] Current step type:", currentStep.step_type);
  
  let nextStepId = null;

  // Handle button choices
  if (currentStep.step_type === "buttons" && currentStep.buttons) {
    const buttons = currentStep.buttons;
    const selectedIndex = parseInt(userResponse) - 1;
    
    if (!isNaN(selectedIndex) && buttons[selectedIndex]) {
      const selectedButton = buttons[selectedIndex];
      console.log("🔍 [DEBUG] Button selected:", selectedButton.title);
      if (selectedButton.next_step !== undefined && selectedButton.next_step !== null) {
        const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
        const targetStep = steps[selectedButton.next_step];
        if (targetStep) {
          nextStepId = targetStep.id;
          console.log("🔍 [DEBUG] Jumping to step:", selectedButton.next_step);
        }
      }
    }
  }

  // Handle conditions (keyword matching)
  if (currentStep.step_type === "condition" && currentStep.conditions) {
    const conditions = currentStep.conditions;
    for (const [keyword, stepIndex] of Object.entries(conditions)) {
      if (userResponse.toLowerCase().includes(keyword.toLowerCase())) {
        const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
        const targetStep = steps[stepIndex];
        if (targetStep) {
          nextStepId = targetStep.id;
          console.log("🔍 [DEBUG] Condition matched! Keyword:", keyword, "Jumping to step:", stepIndex);
          break;
        }
      }
    }
  }

  // Save response if question step
  if (currentStep.step_type === "question" && currentStep.save_response_as) {
    let variables = {};
    if (conversation.variables) {
      try {
        variables = typeof conversation.variables === 'string' 
          ? JSON.parse(conversation.variables) 
          : conversation.variables;
      } catch (e) {
        console.error("❌ Error parsing variables:", e);
      }
    }
    variables[currentStep.save_response_as] = userResponse;
    await ChatbotConversation.update(conversation.id, { 
      variables: JSON.stringify(variables) 
    });
    console.log("🔍 [DEBUG] Saved response:", currentStep.save_response_as, "=", userResponse);
  }

  // Move to next step
  if (nextStepId) {
    await ChatbotConversation.update(conversation.id, {
      current_step_id: nextStepId,
    });
    const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
    const nextStep = steps.find((s) => s.id === nextStepId);
    if (nextStep) {
      await executeStep(contact, nextStep, conversation, userResponse);
    }
  } else {
    await moveToNextStep(contact, currentStep, conversation);
  }
}

module.exports = { processChatbotMessage };