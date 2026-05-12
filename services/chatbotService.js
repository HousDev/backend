// // services/chatbotService.js
// const {
//   ChatbotFlow,
//   ChatbotStep,
//   ChatbotConversation,
// } = require("../models/chatbot.Model");

// const Contact = require("../models/contact.Model");
// const { sendTextMessage } = require("../integrations/whatsapp");

// // ================= HELPER: REPLACE VARIABLES =================
// function replaceVariables(text, contact) {
//   if (!text) return text;
  
//   let result = text;
  
//   // Replace {{1}} with contact name
//   if (result.includes('{{1}}')) {
//     result = result.replace(/\{\{1\}\}/g, contact.name || 'there');
//     console.log(`✅ Replaced {{1}} with: ${contact.name}`);
//   }
  
//   // Replace {{name}} if exists
//   if (result.includes('{{name}}')) {
//     result = result.replace(/\{\{name\}\}/g, contact.name || 'there');
//   }
  
//   // Replace {{phone}} if exists
//   if (result.includes('{{phone}}')) {
//     result = result.replace(/\{\{phone\}\}/g, contact.phone || '');
//   }
  
//   return result;
// }

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
//       // ✅ FIXED: Replace variables before sending
//       let messageText = step.message_text || "";
//       let finalMessage = replaceVariables(messageText, contact);
//       console.log("📤 Original message:", messageText);
//       console.log("📤 Final message after replacement:", finalMessage);
      
//       await sendTextMessage(contact.phone, finalMessage);
//       await moveToNextStep(contact, step, conversation);
//       break;

//     case "question":
//       // ✅ FIXED: Replace variables in question too
//       let questionText = step.message_text || "";
//       let finalQuestion = replaceVariables(questionText, contact);
//       console.log("📤 Question:", finalQuestion);
      
//       await sendTextMessage(contact.phone, finalQuestion);
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
const db = require("../config/database");  // ← YEH ADD KARO

// ================= HELPER =================
function replaceVariables(text, contact) {
  if (!text) return text;

  let result = text;

  result = result.replace(/\{\{1\}\}/g, contact.name || "there");
  result = result.replace(/\{\{name\}\}/g, contact.name || "there");
  result = result.replace(/\{\{phone\}\}/g, contact.phone || "");

  return result;
}

// ================= MAIN FUNCTION =================
async function processChatbotMessage(contactId, message) {
  try {
    if (!contactId || !message) {
      return { processed: false, error: "Missing data" };
    }

    const contact = await Contact.findById(contactId);

    if (!contact) {
      return { processed: false, error: "Contact not found" };
    }

    // ================= FIND ACTIVE CONVERSATION =================
    let conversation =
      await ChatbotConversation.findActiveByContact(contactId);
// 🔥 restart keywords handling
const normalizedMessage = String(message)
  .trim()
  .toLowerCase();

const restartKeywords = [
  "hi",
  "hii",
  "hello",
  "start",
  "menu"
];

// 🔥 reset stuck conversation
if (
  conversation &&
  restartKeywords.includes(normalizedMessage)
) {
  await ChatbotConversation.update(
    conversation.id,
    {
      status: "completed",
    }
  );

  conversation = null;
}

    // 🔥 अगर completed है तो नया flow शुरू होगा
    if (conversation && conversation.status === "completed") {
      conversation = null;
    }

    let flow = null;

    // ================= START NEW FLOW =================
    if (!conversation) {
      let flows = await ChatbotFlow.findActiveByKeyword(
        String(message).toLowerCase()
      );

      flow =
        flows && flows.length > 0
          ? flows[0]
          : await ChatbotFlow.findDefault();

      if (!flow) {
        await sendTextMessage(
          contact.phone,
          "Thanks! We will contact you shortly."
        );

        return { processed: false };
      }

      const steps = await ChatbotStep.findByFlowId(flow.id);

      if (!steps || steps.length === 0) {
        return {
          processed: false,
          error: "No steps found",
        };
      }

      const firstStep = steps[0];

      const convId = await ChatbotConversation.create(
        contactId,
        flow.id,
        firstStep.id
      );

      conversation = {
        id: convId,
        flow_id: flow.id,
        current_step_id: firstStep.id,
        variables: {},
        status: "active",
      };

      await executeStep(contact, firstStep, conversation, null);
    } else {
      // ================= CONTINUE FLOW =================
      flow = await ChatbotFlow.findById(conversation.flow_id);

      if (!flow) {
        return {
          processed: false,
          error: "Flow not found",
        };
      }

      const steps = await ChatbotStep.findByFlowId(flow.id);

      const currentStep = steps.find(
        (s) => s.id === conversation.current_step_id
      );

      if (!currentStep) {
        await ChatbotConversation.update(conversation.id, {
          status: "completed",
        });

        return {
          processed: false,
          error: "Current step not found",
        };
      }

      await processUserResponse(
        contact,
        currentStep,
        conversation,
        message
      );
    }

    return { processed: true };
  } catch (err) {
    console.error("❌ Chatbot Error:", err);

    return {
      processed: false,
      error: err.message,
    };
  }
}

// ================= EXECUTE STEP =================
async function executeStep(
  contact,
  step,
  conversation,
  userResponse
) {
  try {
    switch (step.step_type) {
      // ================= MESSAGE =================
      case "message": {
        const finalMessage = replaceVariables(
          step.message_text || "",
          contact
        );

        console.log("📤 Sending message:", finalMessage);

        const msgId = await sendTextMessage(contact.phone, finalMessage);  // ← const msgId add karo
    
    // ← YEH ADD KARO
    if (msgId) {
        await db.query(
            `UPDATE messages_wa SET sender_name = '🤖 Bot' WHERE whatsapp_msg_id = ?`,
            [msgId]
        );
    }

        await sendTextMessage(contact.phone, finalMessage);

        // 🔥 अगर next step है → move
        if (
          step.next_step_index !== null &&
          step.next_step_index !== undefined
        ) {
          await moveToNextStep(
            contact,
            step,
            conversation
          );
        } else {
          // 🔥 LAST STEP COMPLETE
          await ChatbotConversation.update(
            conversation.id,
            {
              status: "completed",
            }
          );

          console.log(
            "✅ Conversation completed"
          );
        }

        break;
      }

      // ================= QUESTION =================
      case "question": {
        const finalQuestion = replaceVariables(
          step.message_text || "",
          contact
        );

        console.log(
          "📤 Asking question:",
          finalQuestion
        );

        const msgId = await sendTextMessage(contact.phone, finalQuestion);  // ← const msgId add karo
    
    // ← YEH ADD KARO
    if (msgId) {
        await db.query(
            `UPDATE messages_wa SET sender_name = '🤖 Bot' WHERE whatsapp_msg_id = ?`,
            [msgId]
        );
    }
        await sendTextMessage(
          contact.phone,
          finalQuestion
        );

        break;
      }

      // ================= CONDITION =================
      case "condition": {
        console.log("🔍 CONDITION STEP");

        let conditions = step.conditions || {};

        // parse JSON if string
        if (typeof conditions === "string") {
          try {
            conditions = JSON.parse(conditions);
          } catch (err) {
            console.error(
              "❌ Condition parse error:",
              err
            );

            return;
          }
        }

        const cleanResponse = String(
          userResponse
        ).trim();

        console.log(
          "📌 User Response:",
          cleanResponse
        );

        console.log(
          "📌 Conditions:",
          conditions
        );

        const nextIndex =
          conditions[cleanResponse] ??
          conditions[Number(cleanResponse)];

        console.log(
          "📌 Next Index:",
          nextIndex
        );

        if (
          nextIndex === undefined ||
          nextIndex === null
        ) {
          await sendTextMessage(
            contact.phone,
            "Please reply with a valid option."
          );

          return;
        }

        const steps =
          await ChatbotStep.findByFlowId(
            conversation.flow_id
          );

        const nextStep = steps.find(
          (s) =>
            s.step_index === Number(nextIndex)
        );

        if (!nextStep) {
          console.log(
            "❌ Next step not found"
          );

          await ChatbotConversation.update(
            conversation.id,
            {
              status: "completed",
            }
          );

          return;
        }

        await ChatbotConversation.update(
          conversation.id,
          {
            current_step_id: nextStep.id,
          }
        );

        await executeStep(
          contact,
          nextStep,
          conversation,
          cleanResponse
        );

        break;
      }

      // ================= END =================
      case "end": {
        console.log("🏁 Flow completed");

        await ChatbotConversation.update(
          conversation.id,
          {
            status: "completed",
          }
        );

        break;
      }

      // ================= DEFAULT =================
      default: {
        console.log(
          "⚠ Unknown step type:",
          step.step_type
        );

        await ChatbotConversation.update(
          conversation.id,
          {
            status: "completed",
          }
        );

        break;
      }
    }
  } catch (err) {
    console.error(
      "❌ executeStep Error:",
      err
    );

    await ChatbotConversation.update(
      conversation.id,
      {
        status: "completed",
      }
    );
  }
}

// ================= MOVE TO NEXT STEP =================
async function moveToNextStep(contact, currentStep, conversation) {
  const steps = await ChatbotStep.findByFlowId(conversation.flow_id);

  const nextIndex = currentStep.next_step_index;

  // 🔥 अगर next नहीं है → complete
  if (nextIndex === null || nextIndex === undefined) {
    await ChatbotConversation.update(conversation.id, {
      status: "completed",
    });

    return;
  }

  const nextStep = steps.find((s) => s.step_index === Number(nextIndex));

  if (!nextStep) {
    console.log("❌ No next step found");

    await ChatbotConversation.update(conversation.id, {
      status: "completed",
    });

    return;
  }

  await ChatbotConversation.update(conversation.id, {
    current_step_id: nextStep.id,
  });

  // 🔥 auto execute
  // 🔥 ONLY message auto execute
  if (nextStep.step_type === "message") {
    await executeStep(contact, nextStep, conversation, null);
  }
}

// ================= PROCESS USER RESPONSE =================
async function processUserResponse(
  contact,
  currentStep,
  conversation,
  userResponse
) {
  try {
    console.log(
      "📩 User Response:",
      userResponse
    );

    console.log(
      "📌 Current Step Type:",
      currentStep.step_type
    );

    let variables = {};

    if (conversation.variables) {
      try {
        variables =
          typeof conversation.variables ===
          "string"
            ? JSON.parse(
                conversation.variables
              )
            : conversation.variables;
      } catch (err) {
        console.log(
          "❌ Variable parse error:",
          err
        );
      }
    }

    // ================= CONDITION =================
    if (
      currentStep.step_type ===
      "condition"
    ) {
      await executeStep(
        contact,
        currentStep,
        conversation,
        userResponse
      );

      return;
    }

    // ================= QUESTION =================
    if (
      currentStep.step_type ===
      "question"
    ) {
      if (currentStep.save_response_as) {
        variables[
          currentStep.save_response_as
        ] = userResponse;

        await ChatbotConversation.update(
          conversation.id,
          {
            variables:
              JSON.stringify(variables),
          }
        );
      }

      await moveToNextStep(
        contact,
        currentStep,
        conversation
      );

      return;
    }

    // ================= MESSAGE =================
    await moveToNextStep(
      contact,
      currentStep,
      conversation
    );
  } catch (err) {
    console.error(
      "❌ processUserResponse Error:",
      err
    );

    await ChatbotConversation.update(
      conversation.id,
      {
        status: "completed",
      }
    );
  }
}

module.exports = {
  processChatbotMessage,
};