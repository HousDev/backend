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

// // services/chatbotService.js

// const {
//   ChatbotFlow,
//   ChatbotStep,
//   ChatbotConversation,
// } = require("../models/chatbot.Model");

// const Contact = require("../models/contact.Model");
// const { sendTextMessage } = require("../integrations/whatsapp");
// const db = require("../config/database");
// // ================= HELPER =================
// function replaceVariables(text, contact) {
//   if (!text) return text;

//   let result = text;

//   result = result.replace(/\{\{1\}\}/g, contact.name || "there");
//   result = result.replace(/\{\{name\}\}/g, contact.name || "there");
//   result = result.replace(/\{\{phone\}\}/g, contact.phone || "");

//   return result;
// }

// // ================= MAIN FUNCTION =================
// async function processChatbotMessage(contactId, message) {
//   try {
//     if (!contactId || !message) {
//       return { processed: false, error: "Missing data" };
//     }

//     const contact = await Contact.findById(contactId);

//     if (!contact) {
//       return { processed: false, error: "Contact not found" };
//     }

//     // ================= FIND ACTIVE CONVERSATION =================
//     let conversation =
//       await ChatbotConversation.findActiveByContact(contactId);
// // 🔥 restart keywords handling
// const normalizedMessage = String(message)
//   .trim()
//   .toLowerCase();

// const restartKeywords = [
//   "hi",
//   "hii",
//   "hello",
//   "start",
//   "menu"
// ];

// // 🔥 reset stuck conversation
// if (
//   conversation &&
//   restartKeywords.includes(normalizedMessage)
// ) {
//   await ChatbotConversation.update(
//     conversation.id,
//     {
//       status: "completed",
//     }
//   );

//   conversation = null;
// }

//     // 🔥 अगर completed है तो नया flow शुरू होगा
//     if (conversation && conversation.status === "completed") {
//       conversation = null;
//     }

//     let flow = null;

//     // ================= START NEW FLOW =================
//     if (!conversation) {
//       let flows = await ChatbotFlow.findActiveByKeyword(
//         String(message).toLowerCase()
//       );

//       flow =
//         flows && flows.length > 0
//           ? flows[0]
//           : await ChatbotFlow.findDefault();

//       if (!flow) {
//         await sendTextMessage(
//           contact.phone,
//           "Thanks! We will contact you shortly."
//         );

//         return { processed: false };
//       }

//       const steps = await ChatbotStep.findByFlowId(flow.id);

//       if (!steps || steps.length === 0) {
//         return {
//           processed: false,
//           error: "No steps found",
//         };
//       }

//       const firstStep = steps[0];

//       const convId = await ChatbotConversation.create(
//         contactId,
//         flow.id,
//         firstStep.id
//       );

//       conversation = {
//         id: convId,
//         flow_id: flow.id,
//         current_step_id: firstStep.id,
//         variables: {},
//         status: "active",
//       };

//       await executeStep(contact, firstStep, conversation, null);
//     } else {
//       // ================= CONTINUE FLOW =================
//       flow = await ChatbotFlow.findById(conversation.flow_id);

//       if (!flow) {
//         return {
//           processed: false,
//           error: "Flow not found",
//         };
//       }

//       const steps = await ChatbotStep.findByFlowId(flow.id);

//       const currentStep = steps.find(
//         (s) => s.id === conversation.current_step_id
//       );

//       if (!currentStep) {
//         await ChatbotConversation.update(conversation.id, {
//           status: "completed",
//         });

//         return {
//           processed: false,
//           error: "Current step not found",
//         };
//       }

//       await processUserResponse(
//         contact,
//         currentStep,
//         conversation,
//         message
//       );
//     }

//     return { processed: true };
//   } catch (err) {
//     console.error("❌ Chatbot Error:", err);

//     return {
//       processed: false,
//       error: err.message,
//     };
//   }
// }

// // ================= EXECUTE STEP =================
// async function executeStep(
//   contact,
//   step,
//   conversation,
//   userResponse
// ) {
//   try {
//     switch (step.step_type) {
//       // ================= MESSAGE =================
//      case "message": {
//   const finalMessage = replaceVariables(step.message_text || "", contact);
//   console.log("📤 Sending message:", finalMessage);

//   // Send ONCE to WhatsApp
//   const msgId = await sendTextMessage(contact.phone, finalMessage);

//   if (msgId) {
//     // ✅ INSERT bot message into database (so it persists after refresh)
//     await db.query(
//       `INSERT INTO messages_wa
//        (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, sender_name)
//        VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), '🤖 Bot')`,
//       [contact.id, finalMessage, msgId]
//     );

//     // Optional: emit real‑time update to frontend
//     if (global.io) {
//       global.io.to(`contact:${contact.id}`).emit("chat_update", {
//         contact_id: contact.id,
//         text: finalMessage,
//         direction: "out",
//         timestamp: new Date().toISOString(),
//         isOwnMessage: true,
//         sender_name: "🤖 Bot"
//       });
//     }
//   }

//   // Move to next step or complete conversation
//   if (step.next_step_index !== null && step.next_step_index !== undefined) {
//     await moveToNextStep(contact, step, conversation);
//   } else {
//     await ChatbotConversation.update(conversation.id, { status: "completed" });
//     console.log("✅ Conversation completed");
//   }
//   break;
// }

//       // ================= QUESTION =================
//     case "question": {
//   const finalQuestion = replaceVariables(step.message_text || "", contact);
//   console.log("📤 Asking question:", finalQuestion);

//   const msgId = await sendTextMessage(contact.phone, finalQuestion);

//   if (msgId) {
//     // ✅ INSERT bot question into database
//     await db.query(
//       `INSERT INTO messages_wa
//        (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, sender_name)
//        VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), '🤖 Bot')`,
//       [contact.id, finalQuestion, msgId]
//     );

//     // Optional: emit real‑time update
//     if (global.io) {
//       global.io.to(`contact:${contact.id}`).emit("chat_update", {
//         contact_id: contact.id,
//         text: finalQuestion,
//         direction: "out",
//         timestamp: new Date().toISOString(),
//         isOwnMessage: true,
//         sender_name: "🤖 Bot"
//       });
//     }
//   }
//   break;
// }

//       // ================= CONDITION =================
//       case "condition": {
//         console.log("🔍 CONDITION STEP");

//         let conditions = step.conditions || {};

//         // parse JSON if string
//         if (typeof conditions === "string") {
//           try {
//             conditions = JSON.parse(conditions);
//           } catch (err) {
//             console.error(
//               "❌ Condition parse error:",
//               err
//             );

//             return;
//           }
//         }

//         const cleanResponse = String(
//           userResponse
//         ).trim();

//         console.log(
//           "📌 User Response:",
//           cleanResponse
//         );

//         console.log(
//           "📌 Conditions:",
//           conditions
//         );

//         const nextIndex =
//           conditions[cleanResponse] ??
//           conditions[Number(cleanResponse)];

//         console.log(
//           "📌 Next Index:",
//           nextIndex
//         );

//         if (
//           nextIndex === undefined ||
//           nextIndex === null
//         ) {
//           await sendTextMessage(
//             contact.phone,
//             "Please reply with a valid option."
//           );

//           return;
//         }

//         const steps =
//           await ChatbotStep.findByFlowId(
//             conversation.flow_id
//           );

//         const nextStep = steps.find(
//           (s) =>
//             s.step_index === Number(nextIndex)
//         );

//         if (!nextStep) {
//           console.log(
//             "❌ Next step not found"
//           );

//           await ChatbotConversation.update(
//             conversation.id,
//             {
//               status: "completed",
//             }
//           );

//           return;
//         }

//         await ChatbotConversation.update(
//           conversation.id,
//           {
//             current_step_id: nextStep.id,
//           }
//         );

//         await executeStep(
//           contact,
//           nextStep,
//           conversation,
//           cleanResponse
//         );

//         break;
//       }

//       // ================= END =================
//       case "end": {
//         console.log("🏁 Flow completed");

//         await ChatbotConversation.update(
//           conversation.id,
//           {
//             status: "completed",
//           }
//         );

//         break;
//       }

//       // ================= DEFAULT =================
//       default: {
//         console.log(
//           "⚠ Unknown step type:",
//           step.step_type
//         );

//         await ChatbotConversation.update(
//           conversation.id,
//           {
//             status: "completed",
//           }
//         );

//         break;
//       }
//     }
//   } catch (err) {
//     console.error(
//       "❌ executeStep Error:",
//       err
//     );

//     await ChatbotConversation.update(
//       conversation.id,
//       {
//         status: "completed",
//       }
//     );
//   }
// }

// // ================= MOVE TO NEXT STEP =================
// async function moveToNextStep(contact, currentStep, conversation) {
//   const steps = await ChatbotStep.findByFlowId(conversation.flow_id);

//   const nextIndex = currentStep.next_step_index;

//   // 🔥 अगर next नहीं है → complete
//   if (nextIndex === null || nextIndex === undefined) {
//     await ChatbotConversation.update(conversation.id, {
//       status: "completed",
//     });

//     return;
//   }

//   const nextStep = steps.find((s) => s.step_index === Number(nextIndex));

//   if (!nextStep) {
//     console.log("❌ No next step found");

//     await ChatbotConversation.update(conversation.id, {
//       status: "completed",
//     });

//     return;
//   }

//   await ChatbotConversation.update(conversation.id, {
//     current_step_id: nextStep.id,
//   });

//   // 🔥 auto execute
//   // 🔥 ONLY message auto execute
//   if (nextStep.step_type === "message") {
//     await executeStep(contact, nextStep, conversation, null);
//   }
// }

// // ================= PROCESS USER RESPONSE =================
// async function processUserResponse(
//   contact,
//   currentStep,
//   conversation,
//   userResponse
// ) {
//   try {
//     console.log(
//       "📩 User Response:",
//       userResponse
//     );

//     console.log(
//       "📌 Current Step Type:",
//       currentStep.step_type
//     );

//     let variables = {};

//     if (conversation.variables) {
//       try {
//         variables =
//           typeof conversation.variables ===
//           "string"
//             ? JSON.parse(
//                 conversation.variables
//               )
//             : conversation.variables;
//       } catch (err) {
//         console.log(
//           "❌ Variable parse error:",
//           err
//         );
//       }
//     }

//     // ================= CONDITION =================
//     if (
//       currentStep.step_type ===
//       "condition"
//     ) {
//       await executeStep(
//         contact,
//         currentStep,
//         conversation,
//         userResponse
//       );

//       return;
//     }

//     // ================= QUESTION =================
//     if (
//       currentStep.step_type ===
//       "question"
//     ) {
//       if (currentStep.save_response_as) {
//         variables[
//           currentStep.save_response_as
//         ] = userResponse;

//         await ChatbotConversation.update(
//           conversation.id,
//           {
//             variables:
//               JSON.stringify(variables),
//           }
//         );
//       }

//       await moveToNextStep(
//         contact,
//         currentStep,
//         conversation
//       );

//       return;
//     }

//     // ================= MESSAGE =================
//     await moveToNextStep(
//       contact,
//       currentStep,
//       conversation
//     );
//   } catch (err) {
//     console.error(
//       "❌ processUserResponse Error:",
//       err
//     );

//     await ChatbotConversation.update(
//       conversation.id,
//       {
//         status: "completed",
//       }
//     );
//   }
// }

// module.exports = {
//   processChatbotMessage,
// };

// services/chatbotService.js

// const {
//   ChatbotFlow,
//   ChatbotStep,
//   ChatbotConversation,
// } = require("../models/chatbot.Model");

// const Contact = require("../models/contact.Model");
// const { sendTextMessage, sendInteractiveMessage } = require("../integrations/whatsapp");
// const db = require("../config/database");

// // ================= HELPER =================
// function replaceVariables(text, contact) {
//   if (!text) return text;

//   let result = text;

//   result = result.replace(/\{\{1\}\}/g, contact.name || "there");
//   result = result.replace(/\{\{name\}\}/g, contact.name || "there");
//   result = result.replace(/\{\{phone\}\}/g, contact.phone || "");

//   return result;
// }

// // ================= MAIN FUNCTION =================
// async function processChatbotMessage(contactId, message) {
//   try {
//     if (!contactId || !message) {
//       return { processed: false, error: "Missing data" };
//     }

//     const contact = await Contact.findById(contactId);

//     if (!contact) {
//       return { processed: false, error: "Contact not found" };
//     }

//     // ================= FIND ACTIVE CONVERSATION =================
//     let conversation =
//       await ChatbotConversation.findActiveByContact(contactId);

//     // 🔥 restart keywords handling
//     const normalizedMessage = String(message)
//       .trim()
//       .toLowerCase();

//     const restartKeywords = [
//       "hi",
//       "hii",
//       "hello",
//       "start",
//       "menu"
//     ];

//     // 🔥 reset stuck conversation
//     if (
//       conversation &&
//       restartKeywords.includes(normalizedMessage)
//     ) {
//       await ChatbotConversation.update(
//         conversation.id,
//         {
//           status: "completed",
//         }
//       );

//       conversation = null;
//     }

//     // 🔥 अगर completed है तो नया flow शुरू होगा
//     if (conversation && conversation.status === "completed") {
//       conversation = null;
//     }

//     let flow = null;

//     // ================= START NEW FLOW =================
//     if (!conversation) {
//       let flows = await ChatbotFlow.findActiveByKeyword(
//         String(message).toLowerCase()
//       );

//       flow =
//         flows && flows.length > 0
//           ? flows[0]
//           : await ChatbotFlow.findDefault();

//       if (!flow) {
//         await sendTextMessage(
//           contact.phone,
//           "Thanks! We will contact you shortly."
//         );

//         return { processed: false };
//       }

//       const steps = await ChatbotStep.findByFlowId(flow.id);

//       if (!steps || steps.length === 0) {
//         return {
//           processed: false,
//           error: "No steps found",
//         };
//       }

//       const firstStep = steps[0];

//       const convId = await ChatbotConversation.create(
//         contactId,
//         flow.id,
//         firstStep.id
//       );

//       conversation = {
//         id: convId,
//         flow_id: flow.id,
//         current_step_id: firstStep.id,
//         variables: {},
//         status: "active",
//       };

//       await executeStep(contact, firstStep, conversation, null);
//     } else {
//       // ================= CONTINUE FLOW =================
//       flow = await ChatbotFlow.findById(conversation.flow_id);

//       if (!flow) {
//         return {
//           processed: false,
//           error: "Flow not found",
//         };
//       }

//       const steps = await ChatbotStep.findByFlowId(flow.id);

//       const currentStep = steps.find(
//         (s) => s.id === conversation.current_step_id
//       );

//       if (!currentStep) {
//         await ChatbotConversation.update(conversation.id, {
//           status: "completed",
//         });

//         return {
//           processed: false,
//           error: "Current step not found",
//         };
//       }

//       await processUserResponse(
//         contact,
//         currentStep,
//         conversation,
//         message
//       );
//     }

//     return { processed: true };
//   } catch (err) {
//     console.error("❌ Chatbot Error:", err);

//     return {
//       processed: false,
//       error: err.message,
//     };
//   }
// }

// // ================= EXECUTE STEP =================
// async function executeStep(
//   contact,
//   step,
//   conversation,
//   userResponse
// ) {
//   try {
//     switch (step.step_type) {
//       // ================= MESSAGE =================
//       case "message": {
//         const finalMessage = replaceVariables(step.message_text || "", contact);
//         console.log("📤 Sending message:", finalMessage);

//         // Send ONCE to WhatsApp
//         const msgId = await sendTextMessage(contact.phone, finalMessage);

//         if (msgId) {
//           // ✅ INSERT bot message into database
//           await db.query(
//             `INSERT INTO messages_wa
//              (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, sender_name)
//              VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), '🤖 Bot')`,
//             [contact.id, finalMessage, msgId]
//           );

//           // Optional: emit real‑time update to frontend
//           if (global.io) {
//             global.io.to(`contact:${contact.id}`).emit("chat_update", {
//               contact_id: contact.id,
//               text: finalMessage,
//               direction: "out",
//               timestamp: new Date().toISOString(),
//               isOwnMessage: true,
//               sender_name: "🤖 Bot"
//             });
//           }
//         }

//         // Move to next step or complete conversation
//         if (step.next_step_index !== null && step.next_step_index !== undefined) {
//           await moveToNextStep(contact, step, conversation);
//         } else {
//           await ChatbotConversation.update(conversation.id, { status: "completed" });
//           console.log("✅ Conversation completed");
//         }
//         break;
//       }

//       // ================= QUESTION =================
//       case "question": {
//         const finalQuestion = replaceVariables(step.message_text || "", contact);
//         console.log("📤 Asking question:", finalQuestion);

//         const msgId = await sendTextMessage(contact.phone, finalQuestion);

//         if (msgId) {
//           // ✅ INSERT bot question into database
//           await db.query(
//             `INSERT INTO messages_wa
//              (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, sender_name)
//              VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), '🤖 Bot')`,
//             [contact.id, finalQuestion, msgId]
//           );

//           // Optional: emit real‑time update
//           if (global.io) {
//             global.io.to(`contact:${contact.id}`).emit("chat_update", {
//               contact_id: contact.id,
//               text: finalQuestion,
//               direction: "out",
//               timestamp: new Date().toISOString(),
//               isOwnMessage: true,
//               sender_name: "🤖 Bot"
//             });
//           }
//         }
//         break;
//       }

//       // ================= BUTTONS =================
//       case "buttons": {
//         console.log("🔘 BUTTONS STEP");

//         const finalMessage = replaceVariables(step.message_text || "", contact);

//         // Get buttons from step
//         let buttons = step.buttons || [];

//         // Parse buttons if string
//         if (typeof buttons === "string") {
//           try {
//             buttons = JSON.parse(buttons);
//           } catch (err) {
//             console.error("❌ Button parse error:", err);
//             buttons = [];
//           }
//         }

//         console.log("📤 Sending buttons message:", finalMessage);
//         console.log("🔘 Buttons:", buttons);

//         // Format buttons for WhatsApp Interactive API
//         const interactiveButtons = buttons.map((btn, idx) => ({
//           type: "reply",
//           reply: {
//             id: `btn_${step.step_index}_${idx}`,
//             title: btn.title.substring(0, 20) // WhatsApp limit 20 chars
//           }
//         }));

//         // Create interactive message object
//         const interactiveMessage = {
//           type: "interactive",
//           interactive: {
//             type: "button",
//             header: {
//               type: "text",
//               text: "🏠 Property Assistant"
//             },
//             body: {
//               text: finalMessage.length > 60 ? finalMessage.substring(0, 60) : finalMessage
//             },
//             action: {
//               buttons: interactiveButtons.slice(0, 3) // Max 3 buttons
//             }
//           }
//         };

//         // Send interactive message
//         const msgId = await sendInteractiveMessage(contact.phone, interactiveMessage);

//         if (msgId) {
//           await db.query(
//             `INSERT INTO messages_wa
//    (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, sender_name, buttons_json)
//    VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), '🤖 Bot', ?)`,
//             [contact.id, finalMessage, msgId, JSON.stringify(buttons)],
//           );

//           if (global.io) {
//             global.io.to(`contact:${contact.id}`).emit("chat_update", {
//               contact_id: contact.id,
//               text: finalMessage,
//               direction: "out",
//               timestamp: new Date().toISOString(),
//               isOwnMessage: false,
//               sender_name: "🤖 Bot",
//               isInteractive: true,
//               buttons: buttons,
//             });
//           }
//         }

//         // Move to next step if specified
//         // if (step.next_step_index !== null && step.next_step_index !== undefined) {
//         //   await moveToNextStep(contact, step, conversation);
//         // }
//         break;
//       }

//       // ================= CONDITION =================
//       case "condition": {
//         console.log("🔍 CONDITION STEP");

//         let conditions = step.conditions || {};

//         // parse JSON if string
//         if (typeof conditions === "string") {
//           try {
//             conditions = JSON.parse(conditions);
//           } catch (err) {
//             console.error("❌ Condition parse error:", err);
//             return;
//           }
//         }

//         const cleanResponse = String(userResponse).trim();

//         console.log("📌 User Response:", cleanResponse);
//         console.log("📌 Conditions:", conditions);

//         const nextIndex =
//           conditions[cleanResponse] ??
//           conditions[Number(cleanResponse)];

//         console.log("📌 Next Index:", nextIndex);

//         if (nextIndex === undefined || nextIndex === null) {
//           await sendTextMessage(
//             contact.phone,
//             "Please reply with a valid option."
//           );
//           return;
//         }

//         const steps = await ChatbotStep.findByFlowId(conversation.flow_id);

//         const nextStep = steps.find(
//           (s) => s.step_index === Number(nextIndex)
//         );

//         if (!nextStep) {
//           console.log("❌ Next step not found");
//           await ChatbotConversation.update(conversation.id, {
//             status: "completed",
//           });
//           return;
//         }

//         await ChatbotConversation.update(conversation.id, {
//           current_step_id: nextStep.id,
//         });

//         await executeStep(contact, nextStep, conversation, cleanResponse);
//         break;
//       }

//       // ================= END =================
//       case "end": {
//         console.log("🏁 Flow completed");
//         await ChatbotConversation.update(conversation.id, {
//           status: "completed",
//         });
//         break;
//       }

//       // ================= DEFAULT =================
//       default: {
//         console.log("⚠ Unknown step type:", step.step_type);
//         await ChatbotConversation.update(conversation.id, {
//           status: "completed",
//         });
//         break;
//       }
//     }
//   } catch (err) {
//     console.error("❌ executeStep Error:", err);
//     await ChatbotConversation.update(conversation.id, {
//       status: "completed",
//     });
//   }
// }

// // ================= MOVE TO NEXT STEP =================
// async function moveToNextStep(contact, currentStep, conversation) {
//   const steps = await ChatbotStep.findByFlowId(conversation.flow_id);

//   const nextIndex = currentStep.next_step_index;

//   // 🔥 अगर next नहीं है → complete
//   if (nextIndex === null || nextIndex === undefined) {
//     await ChatbotConversation.update(conversation.id, {
//       status: "completed",
//     });
//     return;
//   }

//   const nextStep = steps.find((s) => s.step_index === Number(nextIndex));

//   if (!nextStep) {
//     console.log("❌ No next step found");
//     await ChatbotConversation.update(conversation.id, {
//       status: "completed",
//     });
//     return;
//   }

//   await ChatbotConversation.update(conversation.id, {
//     current_step_id: nextStep.id,
//   });

//   // 🔥 FIXED: Auto execute for message AND buttons (and any other step that needs auto-execution)
//   const autoExecuteTypes = ["message", "buttons", "condition","end"];
//   if (autoExecuteTypes.includes(nextStep.step_type)) {
//     await executeStep(contact, nextStep, conversation, null);
//   }
// }

// // ================= PROCESS USER RESPONSE =================
// async function processUserResponse(
//   contact,
//   currentStep,
//   conversation,
//   userResponse
// ) {
//   try {
//     console.log("📩 User Response:", userResponse);
//     console.log("📌 Current Step Type:", currentStep.step_type);

//     let variables = {};

//     if (conversation.variables) {
//       try {
//         variables =
//           typeof conversation.variables === "string"
//             ? JSON.parse(conversation.variables)
//             : conversation.variables;
//       } catch (err) {
//         console.log("❌ Variable parse error:", err);
//       }
//     }

//     // ================= BUTTONS RESPONSE =================
//     if (currentStep.step_type === "buttons") {
//       // Button clicked - check which button
//       let buttons = currentStep.buttons || [];
//       if (typeof buttons === "string") {
//         try {
//           buttons = JSON.parse(buttons);
//         } catch (err) {
//           buttons = [];
//         }
//       }

//       // Find which button was clicked
//       // const matchedButton = buttons.find((btn, idx) => {
//       //   const buttonId = `btn_${currentStep.step_index}_${idx}`;
//       //   return userResponse.includes(buttonId) ||
//       //          userResponse === btn.title ||
//       //          userResponse === String(idx + 1);
//       // });
//       const matchedButton = buttons.find((btn, idx) => {
//         const buttonId = `btn_${currentStep.step_index}_${idx}`;
//         return (
//           userResponse.includes(buttonId) ||
//           userResponse === btn.title ||
//           userResponse === String(idx + 1)
//         );
//       });

//       // ✅ AUTO TAG based on button clicked
//       if (matchedButton) {
//         const title = matchedButton.title.toLowerCase();
//         let tagName = null;

//         if (title.includes("buy")) tagName = "Buyer";
//         else if (title.includes("sell")) tagName = "Seller";
//         else if (title.includes("rent")) tagName = "Rental";

//         if (tagName) {
//           try {
//             // Find or create tag
//             const [existingTags] = await db.query(
//               `SELECT * FROM tags WHERE name = ? LIMIT 1`,
//               [tagName],
//             );

//             let tagId;
//             if (existingTags.length > 0) {
//               tagId = existingTags[0].id;
//             } else {
//               // Create tag with color
//               const colorMap = {
//                 Buyer: "#3B82F6",
//                 Seller: "#10B981",
//                 Rental: "#F59E0B",
//               };
//               const [result] = await db.query(
//                 `INSERT INTO tags (name, color, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
//                 [tagName, colorMap[tagName]],
//               );
//               tagId = result.insertId;
//             }

//             // Check if tag already assigned to contact
//             const [existing] = await db.query(
//               `SELECT * FROM contact_tags WHERE contact_id = ? AND tag_id = ? LIMIT 1`,
//               [contact.id, tagId],
//             );

//             if (existing.length === 0) {
//               await db.query(
//                 `INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`,
//                 [contact.id, tagId],
//               );
//               console.log(`✅ Auto-tagged contact ${contact.id} as ${tagName}`);
//               if (global.io) {
//                 // Get assigned user for this contact
//                 const [assignedResult] = await db.query(
//                   "SELECT assigned_to FROM contacts_wa WHERE id = ?",
//                   [contact.id],
//                 );
//                 const assignedTo = assignedResult[0]?.assigned_to;

//                 if (assignedTo) {
//                   global.io.to(`user:${assignedTo}`).emit("contact_tagged", {
//                     contact_id: contact.id,
//                     tag_name: tagName,
//                     tag_id: tagId,
//                   });
//                 }

//                 // Also emit to all users who might have this contact in their view
//                 global.io.emit("refresh_inbox", {
//                   contact_id: contact.id,
//                   tag_name: tagName,
//                 });
//               }
//             }
//           } catch (err) {
//             console.error("❌ Auto-tag error:", err);
//           }
//         }
//       }

//       let nextStepIndex = currentStep.next_step_index;

//       if (matchedButton && matchedButton.next_step !== undefined) {
//         nextStepIndex = matchedButton.next_step;
//       }

//       if (nextStepIndex !== undefined && nextStepIndex !== null) {
//         const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
//         const nextStep = steps.find((s) => s.step_index === Number(nextStepIndex));

//         if (nextStep) {
//           await ChatbotConversation.update(conversation.id, {
//             current_step_id: nextStep.id,
//           });
// await executeStep(
//   contact,
//   nextStep,
//   conversation,
//   nextStep.step_type === "condition" ? userResponse : null,
// );        } else {
//           await moveToNextStep(contact, currentStep, conversation);
//         }
//       } else {
//         await moveToNextStep(contact, currentStep, conversation);
//       }
//       return;
//     }

//     // ================= CONDITION =================
//     if (currentStep.step_type === "condition") {
//       await executeStep(contact, currentStep, conversation, userResponse);
//       return;
//     }

//     // ================= QUESTION =================
//     if (currentStep.step_type === "question") {
//       if (currentStep.save_response_as) {
//         variables[currentStep.save_response_as] = userResponse;
//         await ChatbotConversation.update(conversation.id, {
//           variables: JSON.stringify(variables),
//         });
//       }
//       await moveToNextStep(contact, currentStep, conversation);
//       return;
//     }

//     // ================= MESSAGE =================
//     await moveToNextStep(contact, currentStep, conversation);
//   } catch (err) {
//     console.error("❌ processUserResponse Error:", err);
//     await ChatbotConversation.update(conversation.id, {
//       status: "completed",
//     });
//   }
// }

// module.exports = {
//   processChatbotMessage,
// };



const {
  ChatbotFlow,
  ChatbotStep,
  ChatbotConversation,
} = require("../models/chatbot.Model");

const Contact = require("../models/contact.Model");
const {
  sendTextMessage,
  sendInteractiveMessage,
} = require("../integrations/whatsapp");
const db = require("../config/database");

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
    let conversation = await ChatbotConversation.findActiveByContact(contactId);

    // 🔥 restart keywords handling
    const normalizedMessage = String(message).trim().toLowerCase();

    const restartKeywords = ["hi", "hii", "hello", "start", "menu"];

    // 🔥 reset stuck conversation
    if (conversation && restartKeywords.includes(normalizedMessage)) {
      await ChatbotConversation.update(conversation.id, {
        status: "completed",
      });

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
        String(message).toLowerCase(),
      );

      flow =
        flows && flows.length > 0 ? flows[0] : await ChatbotFlow.findDefault();

      if (!flow) {
        await sendTextMessage(
          contact.phone,
          "Thanks! We will contact you shortly.",
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
        firstStep.id,
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
        (s) => s.id === conversation.current_step_id,
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

      await processUserResponse(contact, currentStep, conversation, message);
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
async function executeStep(contact, step, conversation, userResponse) {
  try {
    switch (step.step_type) {
      // ================= MESSAGE =================
      case "message": {
        const finalMessage = replaceVariables(step.message_text || "", contact);
        console.log("📤 Sending message:", finalMessage);

        // Send ONCE to WhatsApp
        const msgId = await sendTextMessage(contact.phone, finalMessage);

        if (msgId) {
          // ✅ INSERT bot message into database
          await db.query(
            `INSERT INTO messages_wa 
             (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, sender_name) 
             VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), '🤖 Bot')`,
            [contact.id, finalMessage, msgId],
          );

          // Optional: emit real‑time update to frontend
          if (global.io) {
            global.io.to(`contact:${contact.id}`).emit("chat_update", {
              contact_id: contact.id,
              text: finalMessage,
              direction: "out",
              timestamp: new Date().toISOString(),
              isOwnMessage: true,
              sender_name: "🤖 Bot",
            });
          }
        }

        // Move to next step or complete conversation
        if (
          step.next_step_index !== null &&
          step.next_step_index !== undefined
        ) {
          await moveToNextStep(contact, step, conversation);
        } else {
          await ChatbotConversation.update(conversation.id, {
            status: "completed",
          });
          console.log("✅ Conversation completed");
        }
        break;
      }

      // ================= QUESTION =================
      case "question": {
        const finalQuestion = replaceVariables(
          step.message_text || "",
          contact,
        );
        console.log("📤 Asking question:", finalQuestion);

        const msgId = await sendTextMessage(contact.phone, finalQuestion);

        if (msgId) {
          // ✅ INSERT bot question into database
          await db.query(
            `INSERT INTO messages_wa 
             (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, sender_name) 
             VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), '🤖 Bot')`,
            [contact.id, finalQuestion, msgId],
          );

          // Optional: emit real‑time update
          if (global.io) {
            global.io.to(`contact:${contact.id}`).emit("chat_update", {
              contact_id: contact.id,
              text: finalQuestion,
              direction: "out",
              timestamp: new Date().toISOString(),
              isOwnMessage: true,
              sender_name: "🤖 Bot",
            });
          }
        }
        break;
      }

      // ================= BUTTONS =================
      case "buttons": {
        console.log("🔘 BUTTONS STEP");

        const finalMessage = replaceVariables(step.message_text || "", contact);

        // Get buttons from step
        let buttons = step.buttons || [];

        // Parse buttons if string
        if (typeof buttons === "string") {
          try {
            buttons = JSON.parse(buttons);
          } catch (err) {
            console.error("❌ Button parse error:", err);
            buttons = [];
          }
        }

        console.log("📤 Sending buttons message:", finalMessage);
        console.log("🔘 Buttons:", buttons);

        // Format buttons for WhatsApp Interactive API
        const interactiveButtons = buttons.map((btn, idx) => ({
          type: "reply",
          reply: {
            id: `btn_${step.step_index}_${idx}`,
            title: btn.title.substring(0, 20), // WhatsApp limit 20 chars
          },
        }));

        // Create interactive message object
        const interactiveMessage = {
          type: "interactive",
          interactive: {
            type: "button",
            header: {
              type: "text",
              text: "🏠 Property Assistant",
            },
            body: {
              text:
                finalMessage.length > 60
                  ? finalMessage.substring(0, 60)
                  : finalMessage,
            },
            action: {
              buttons: interactiveButtons.slice(0, 3), // Max 3 buttons
            },
          },
        };

        // Send interactive message
        const msgId = await sendInteractiveMessage(
          contact.phone,
          interactiveMessage,
        );

        if (msgId) {
          await db.query(
            `INSERT INTO messages_wa 
   (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, sender_name, buttons_json) 
   VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), '🤖 Bot', ?)`,
            [contact.id, finalMessage, msgId, JSON.stringify(buttons)],
          );

          if (global.io) {
            global.io.to(`contact:${contact.id}`).emit("chat_update", {
              contact_id: contact.id,
              text: finalMessage,
              direction: "out",
              timestamp: new Date().toISOString(),
              isOwnMessage: false,
              sender_name: "🤖 Bot",
              isInteractive: true,
              buttons: buttons,
            });
          }
        }

        // Move to next step if specified
        // if (step.next_step_index !== null && step.next_step_index !== undefined) {
        //   await moveToNextStep(contact, step, conversation);
        // }
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
            console.error("❌ Condition parse error:", err);
            return;
          }
        }

        const cleanResponse = String(userResponse).trim();

        console.log("📌 User Response:", cleanResponse);
        console.log("📌 Conditions:", conditions);

        const nextIndex =
          conditions[cleanResponse] ?? conditions[Number(cleanResponse)];

        console.log("📌 Next Index:", nextIndex);

        if (nextIndex === undefined || nextIndex === null) {
          await sendTextMessage(
            contact.phone,
            "Please reply with a valid option.",
          );
          return;
        }

        const steps = await ChatbotStep.findByFlowId(conversation.flow_id);

        const nextStep = steps.find((s) => s.step_index === Number(nextIndex));

        if (!nextStep) {
          console.log("❌ Next step not found");
          await ChatbotConversation.update(conversation.id, {
            status: "completed",
          });
          return;
        }

        await ChatbotConversation.update(conversation.id, {
          current_step_id: nextStep.id,
        });

        await executeStep(contact, nextStep, conversation, cleanResponse);
        break;
      }

      // ================= END =================
      case "end": {
        console.log("🏁 Flow completed");
        await ChatbotConversation.update(conversation.id, {
          status: "completed",
        });
        break;
      }

      // ================= DEFAULT =================
      default: {
        console.log("⚠ Unknown step type:", step.step_type);
        await ChatbotConversation.update(conversation.id, {
          status: "completed",
        });
        break;
      }
    }
  } catch (err) {
    console.error("❌ executeStep Error:", err);
    await ChatbotConversation.update(conversation.id, {
      status: "completed",
    });
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

  // 🔥 FIXED: Auto execute for message AND buttons (and any other step that needs auto-execution)
  const autoExecuteTypes = ["message", "buttons", "condition", "end"];
  if (autoExecuteTypes.includes(nextStep.step_type)) {
    await executeStep(contact, nextStep, conversation, null);
  }
}

// ================= PROCESS USER RESPONSE =================
async function processUserResponse(
  contact,
  currentStep,
  conversation,
  userResponse,
) {
  try {
    console.log("📩 User Response:", userResponse);
    console.log("📌 Current Step Type:", currentStep.step_type);

    let variables = {};

    if (conversation.variables) {
      try {
        variables =
          typeof conversation.variables === "string"
            ? JSON.parse(conversation.variables)
            : conversation.variables;
      } catch (err) {
        console.log("❌ Variable parse error:", err);
      }
    }

    // ================= BUTTONS RESPONSE =================
    if (currentStep.step_type === "buttons") {
      // Button clicked - check which button
      let buttons = currentStep.buttons || [];
      if (typeof buttons === "string") {
        try {
          buttons = JSON.parse(buttons);
        } catch (err) {
          buttons = [];
        }
      }

      // Find which button was clicked
      // const matchedButton = buttons.find((btn, idx) => {
      //   const buttonId = `btn_${currentStep.step_index}_${idx}`;
      //   return userResponse.includes(buttonId) ||
      //          userResponse === btn.title ||
      //          userResponse === String(idx + 1);
      // });
      const matchedButton = buttons.find((btn, idx) => {
        const buttonId = `btn_${currentStep.step_index}_${idx}`;
        return (
          userResponse.includes(buttonId) ||
          userResponse === btn.title ||
          userResponse === String(idx + 1)
        );
      });

      // ✅ AUTO TAG based on button clicked
      if (matchedButton) {
        const title = matchedButton.title.toLowerCase();
        let tagName = null;

        if (title.includes("buy")) tagName = "Buyer";
        else if (title.includes("sell")) tagName = "Seller";
        else if (title.includes("rent")) tagName = "Rental";

        if (tagName) {
          try {
            // Find or create tag
            const [existingTags] = await db.query(
              `SELECT * FROM tags WHERE name = ? LIMIT 1`,
              [tagName],
            );

            let tagId;
            if (existingTags.length > 0) {
              tagId = existingTags[0].id;
            } else {
              // Create tag with color
              const colorMap = {
                Buyer: "#3B82F6",
                Seller: "#10B981",
                Rental: "#F59E0B",
              };
              const [result] = await db.query(
                `INSERT INTO tags (name, color, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
                [tagName, colorMap[tagName]],
              );
              tagId = result.insertId;
            }

            // Check if tag already assigned to contact
            const [existing] = await db.query(
              `SELECT * FROM contact_tags WHERE contact_id = ? AND tag_id = ? LIMIT 1`,
              [contact.id, tagId],
            );

            if (existing.length === 0) {
              await db.query(
                `INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`,
                [contact.id, tagId],
              );
              console.log(`✅ Auto-tagged contact ${contact.id} as ${tagName}`);

              // ✅ AUTO CREATE LEAD in buyers/sellers table
              try {
                if (tagName === "Buyer") {
                  const [existingBuyer] = await db.query(
                    `SELECT id FROM buyers WHERE phone = ? LIMIT 1`,
                    [contact.phone],
                  );
                  if (existingBuyer.length === 0) {
                    await db.query(
                      `INSERT INTO buyers (name, phone, whatsapp_number, buyer_lead_source, buyer_lead_stage, buyer_lead_status, created_at, updated_at)
                       VALUES (?, ?, ?, 'WhatsApp', 'initial_contact', 'active', NOW(), NOW())`,
                      [contact.name, contact.phone, contact.phone],
                    );
                    console.log(
                      `✅ Buyer lead created for contact ${contact.id}`,
                    );
                  }
                } else if (tagName === "Seller") {
                  const [existingSeller] = await db.query(
                    `SELECT id FROM sellers WHERE phone = ? LIMIT 1`,
                    [contact.phone],
                  );
                  if (existingSeller.length === 0) {
                    await db.query(
                      `INSERT INTO sellers (name, phone, whatsapp, source, stage, status, created_at, updated_at)
                       VALUES (?, ?, ?, 'WhatsApp', 'initial_contact', 'active', NOW(), NOW())`,
                      [contact.name, contact.phone, contact.phone],
                    );
                    console.log(
                      `✅ Seller lead created for contact ${contact.id}`,
                    );
                  }
                }
              } catch (leadErr) {
                console.error("❌ Auto lead creation error:", leadErr);
              }

              // ✅ AUTO ASSIGN based on tag (Buyer → buyer dept, Seller → seller dept)
              try {
                const deptMap = {
                  Buyer: "buyer",
                  Seller: "seller",
                  Rental: "buyer",
                };
                const dept = deptMap[tagName];

                if (dept) {
                  const [salesUsers] = await db.query(
                    `SELECT id FROM users 
   WHERE LOWER(department) = ?
   AND (
      LOWER(role) = 'sales executive'
      OR LOWER(role) = 'sales_executive'
   )
   AND is_active = 1
   ORDER BY RAND()
   LIMIT 1`,
                    [dept],
                  );

                  if (salesUsers.length > 0) {
                    const assignedUserId = salesUsers[0].id;
                    await db.query(
                      `UPDATE contacts_wa SET assigned_to = ?, updated_at = NOW() WHERE id = ?`,
                      [assignedUserId, contact.id],
                    );
                    console.log(
                      `✅ Auto-assigned contact ${contact.id} to user ${assignedUserId} (dept: ${dept})`,
                    );

                    if (global.io) {
                      global.io.emit("refresh_inbox", {
                        contact_id: contact.id,
                      });
                    }
                  } else {
                    console.log(
                      `⚠️ No active user found in department: ${dept}`,
                    );
                  }
                }
              } catch (assignErr) {
                console.error("❌ Auto-assign error:", assignErr);
              }

              if (global.io) {
                // Get assigned user for this contact
                const [assignedResult] = await db.query(
                  "SELECT assigned_to FROM contacts_wa WHERE id = ?",
                  [contact.id],
                );
                const assignedTo = assignedResult[0]?.assigned_to;

                if (assignedTo) {
                  global.io.to(`user:${assignedTo}`).emit("contact_tagged", {
                    contact_id: contact.id,
                    tag_name: tagName,
                    tag_id: tagId,
                  });
                }

                // Also emit to all users who might have this contact in their view
                global.io.emit("refresh_inbox", {
                  contact_id: contact.id,
                  tag_name: tagName,
                });
              }
            }
          } catch (err) {
            console.error("❌ Auto-tag error:", err);
          }
        }
      }

      let nextStepIndex = currentStep.next_step_index;

      if (matchedButton && matchedButton.next_step !== undefined) {
        nextStepIndex = matchedButton.next_step;
      }

      if (nextStepIndex !== undefined && nextStepIndex !== null) {
        const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
        const nextStep = steps.find(
          (s) => s.step_index === Number(nextStepIndex),
        );

        if (nextStep) {
          await ChatbotConversation.update(conversation.id, {
            current_step_id: nextStep.id,
          });
          await executeStep(
            contact,
            nextStep,
            conversation,
            nextStep.step_type === "condition" ? userResponse : null,
          );
        } else {
          await moveToNextStep(contact, currentStep, conversation);
        }
      } else {
        await moveToNextStep(contact, currentStep, conversation);
      }
      return;
    }

    // ================= CONDITION =================
    if (currentStep.step_type === "condition") {
      await executeStep(contact, currentStep, conversation, userResponse);
      return;
    }

    // ================= QUESTION =================
    if (currentStep.step_type === "question") {
      if (currentStep.save_response_as) {
        variables[currentStep.save_response_as] = userResponse;
        await ChatbotConversation.update(conversation.id, {
          variables: JSON.stringify(variables),
        });
      }
      await moveToNextStep(contact, currentStep, conversation);
      return;
    }

    // ================= MESSAGE =================
    await moveToNextStep(contact, currentStep, conversation);
  } catch (err) {
    console.error("❌ processUserResponse Error:", err);
    await ChatbotConversation.update(conversation.id, {
      status: "completed",
    });
  }
}

module.exports = {
  processChatbotMessage,
};