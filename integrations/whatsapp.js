// const axios = require("axios");
// const db = require("../config/database");
// const { emitToUser } = require("../utils/socket");
// const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
// const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
// const WABA_ID = process.env.WABA_ID;
// const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

// // Send text message (with error logging)
// async function sendTextMessage(to, text) {
//   const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
//   const payload = {
//     messaging_product: "whatsapp",
//     to: to,
//     type: "text",
//     text: { body: text },
//   };
//   try {
//     const response = await axios.post(url, payload, {
//       headers: {
//         Authorization: `Bearer ${WHATSAPP_TOKEN}`,
//         "Content-Type": "application/json",
//       },
//     });
//     return response.data.messages[0].id;
//   } catch (error) {
//     console.error(
//       "❌ sendTextMessage error:",
//       error.response?.data || error.message,
//     );
//     throw error; // re-throw so caller can handle
//   }
// }

// // Send template message
// async function sendTemplateMessage(
//   to,
//   templateName,
//   language = "en",
//   components = [],
// ) {
//   const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
//   const payload = {
//     messaging_product: "whatsapp",
//     to: to,
//     type: "template",
//     template: { name: templateName, language: { code: language }, components },
//   };
//   try {
//     const response = await axios.post(url, payload, {
//       headers: {
//         Authorization: `Bearer ${WHATSAPP_TOKEN}`,
//         "Content-Type": "application/json",
//       },
//     });
//     return response.data.messages[0].id;
//   } catch (error) {
//     console.error(
//       "❌ sendTemplateMessage error:",
//       error.response?.data || error.message,
//     );
//     throw error;
//   }
// }

// // Submit template to Meta for approval
// async function submitTemplateToMeta(payload) {
//   const url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`;

//   try {
//     const response = await axios.post(url, payload, {
//       headers: {
//         Authorization: `Bearer ${WHATSAPP_TOKEN}`,
//         "Content-Type": "application/json",
//       },
//     });
//     console.log("template meta res");
//     console.log(response);
//     return { success: true, metaId: response.data.id };
//   } catch (error) {
//     console.error(
//       "❌ submitTemplateToMeta error:",
//       error.response?.data?.error?.message,
//     );
//     return { success: false, error: error.response?.data?.error?.message };
//   }
// }

// // Webhook verification
// function verifyWebhook(req, res) {
//   const mode = req.query["hub.mode"];
//   const token = req.query["hub.verify_token"];
//   const challenge = req.query["hub.challenge"];
//   if (mode === "subscribe" && token === process.env.WHATSAPP_TOKEN) {
//     res.status(200).send(challenge);
//   } else {
//     res.sendStatus(403);
//   }
// }
// // async function fetchMetaTemplates() {
// //   try {
// //     const url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`;

// //     const res = await axios.get(url, {
// //       headers: {
// //         Authorization: `Bearer ${WHATSAPP_TOKEN}`,
// //         "Content-Type": "application/json",
// //       },
// //     });

// //     console.log("✅ Meta Templates:", res.data);

// //     return res.data.data; // 🔥 templates array
// //   } catch (error) {
// //     console.error("❌ Error fetching templates:", error.response?.data);
// //     return [];
// //   }
// // }
// const fetchMetaTemplates = async () => {
//   try {
//     let allTemplates = [];
//     let url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`;

//     while (url) {
//       const res = await axios.get(url, {
//         headers: {
//           Authorization: `Bearer ${WHATSAPP_TOKEN}`,
//         },
//       });

//       const data = res.data;
//       allTemplates = [...allTemplates, ...data.data];

//       url = data.paging?.next || null;
//     }

//     console.log("✅ Total Templates Fetched:", allTemplates.length);
//     return allTemplates;
//   } catch (error) {
//     console.error("❌ Error fetching templates:", error.response?.data);
//     return [];
//   }
// };
// async function handleWebhook(req, res) {
//   const body = req.body;
//   console.log("🔥 WEBHOOK TRIGGERED");

//   if (body.object === "whatsapp_business_account") {
//     for (const entry of body.entry) {
//       for (const change of entry.changes) {
//         if (change.field === "messages") {
//           // ================================
//           // ✅ 1. HANDLE STATUS UPDATES
//           // ================================
//           const statuses = change.value.statuses || [];

//           for (const status of statuses) {
//             const messageId = status.id;
//             const statusType = status.status; // sent | delivered | read

//             console.log(
//               "📊 Status Update:",
//               statusType,
//               "| Msg ID:",
//               messageId,
//             );

//             try {
//               await db.query(
//                 `UPDATE messages_wa
//    SET status = ?, is_read = ?
//    WHERE whatsapp_msg_id = ?`,
//                 [statusType, statusType === "read" ? 1 : 0, messageId],
//               );
//             } catch (err) {
//               console.error("❌ Status update failed:", err);
//             }
//           }

//           // ================================
//           // ✅ 2. HANDLE INCOMING MESSAGES
//           // ================================
//           const messages = change.value.messages || [];

//           for (const msg of messages) {
//             const from = msg.from;
//             const text = msg.text?.body || "";
//             const timestamp = msg.timestamp;

//             console.log("📩 Incoming message:", from, "|", text);

//             // 🔍 Find or create contact
//             let [contact] = await db.query(
//               "SELECT id FROM contacts_wa WHERE phone = ?",
//               [from],
//             );

//             if (contact.length === 0) {
//               const name =
//                 change.value.contacts?.[0]?.profile?.name ??
//                 `Customer ${from.slice(-4)}`;

//               const [result] = await db.query(
//                 "INSERT INTO contacts_wa (name, phone) VALUES (?, ?)",
//                 [name, from],
//               );

//               contact = [{ id: result.insertId }];

//               // 🧩 Create pipeline stages
//               const stages = [
//                 "New",
//                 "Enquiry",
//                 "Qualified",
//                 "Proposal",
//                 "Negotiation",
//                 "Closed Won",
//               ];

//               for (let s of stages) {
//                 await db.query(
//                   "INSERT INTO pipeline_stages (contact_id, stage_name, done) VALUES (?, ?, ?)",
//                   [result.insertId, s, false],
//                 );
//               }

//               console.log("✅ New contact created:", name);
//             }

//             const contactId = contact[0].id;

//             // 💾 Save incoming message
//             await db.query(
//               `INSERT INTO messages_wa
//    (contact_id, direction, text, time_sent, status, is_read)
//    VALUES (?, ?, ?, FROM_UNIXTIME(?), ?, ?)`,
//               [contactId, "in", text, timestamp, "read", 1],
//             );

//             await db.query(
//               "UPDATE contacts_wa SET last_message = ?, last_contact_time = NOW() WHERE id = ?",
//               [text, contactId],
//             );
//             // 🔥 ADD THIS
//             emitToUser(req.user.id || req.userId, "chat_update", {
//               contact_id: contactId,
//               text: text,
//             });

//             // ================================
//             // ✅ 3. AUTO REPLY + SAVE MESSAGE
//             // ================================
//             try {
//               const replyText = "Thanks for contacting us!";
//               const msgId = await sendTextMessage(from, replyText);

//               console.log("✅ Auto-reply sent:", msgId);

//               // 💾 Save outgoing message with msgId
//               await db.query(
//                 "INSERT INTO messages_wa (contact_id, direction, text, whatsapp_msg_id, status, time_sent) VALUES (?, ?, ?, ?, ?, NOW())",
//                 [contactId, "out", replyText, msgId, "sent"],
//               );
//             } catch (err) {
//               console.error(
//                 "❌ Auto-reply failed:",
//                 err.response?.data || err.message,
//               );
//             }

//             // ================================
//             // ✅ 4. AUTOMATION TRIGGER
//             // ================================
//             const {
//               triggerAutomation,
//             } = require("../services/automationEngine");
//             await triggerAutomation(contactId, text);
//           }
//         }
//       }
//     }

//     return res.sendStatus(200);
//   }

//   return res.sendStatus(404);
// }

// // Get template status from Meta
// async function getTemplateStatus(metaId) {
//   try {
//     const url = `https://graph.facebook.com/${API_VERSION}/${metaId}`;

//     const response = await axios.get(url, {
//       headers: {
//         Authorization: `Bearer ${WHATSAPP_TOKEN}`,
//       },
//     });

//     return {
//       status: response.data.status,
//       rejection_reason: response.data.rejection_reason || null,
//     };
//   } catch (error) {
//     console.error(
//       "❌ getTemplateStatus error:",
//       error.response?.data || error.message,
//     );
//     return null;
//   }
// }

// module.exports = {
//   sendTextMessage,
//   sendTemplateMessage,
//   submitTemplateToMeta,
//   getTemplateStatus,
//   verifyWebhook,
//   handleWebhook,
//   fetchMetaTemplates,
// };

const axios = require("axios");
const db = require("../config/database");
const { emitToUser } = require("../utils/socket");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WABA_ID = process.env.WABA_ID;
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

// Send text message
async function sendTextMessage(to, text) {
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: to,
    type: "text",
    text: { body: text },
  };
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    return response.data.messages[0].id;
  } catch (error) {
    console.error(
      "❌ sendTextMessage error:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

// Send template message
async function sendTemplateMessage(
  to,
  templateName,
  language = "en",
  components = [],
) {
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: to,
    type: "template",
    template: { name: templateName, language: { code: language }, components },
  };
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    return response.data.messages[0].id;
  } catch (error) {
    console.error(
      "❌ sendTemplateMessage error:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

// Submit template to Meta
async function submitTemplateToMeta(payload) {
  const url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`;
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    return { success: true, metaId: response.data.id };
  } catch (error) {
    console.error(
      "❌ submitTemplateToMeta error:",
      error.response?.data?.error?.message,
    );
    return { success: false, error: error.response?.data?.error?.message };
  }
}

// Webhook verification
function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
}

// Fetch Meta templates
const fetchMetaTemplates = async () => {
  try {
    let allTemplates = [];
    let url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`;
    while (url) {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      });
      const data = res.data;
      allTemplates = [...allTemplates, ...data.data];
      url = data.paging?.next || null;
    }
    console.log("✅ Total Templates Fetched:", allTemplates.length);
    return allTemplates;
  } catch (error) {
    console.error("❌ Error fetching templates:", error.response?.data);
    return [];
  }
};

// Handle webhook
async function handleWebhook(req, res) {
  const body = req.body;
  console.log("🔥 WEBHOOK TRIGGERED");

  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === "messages") {
          const messages = change.value.messages || [];
          for (const msg of messages) {
            const from = msg.from;
            const text = msg.text?.body || "";
            const timestamp = msg.timestamp;
            console.log("📩 Incoming message:", from, "|", text);

            let [contact] = await db.query(
              "SELECT id FROM contacts_wa WHERE phone = ?",
              [from],
            );
            if (contact.length === 0) {
              const name =
                change.value.contacts?.[0]?.profile?.name ??
                `Customer ${from.slice(-4)}`;
              const [result] = await db.query(
                "INSERT INTO contacts_wa (name, phone) VALUES (?, ?)",
                [name, from],
              );
              contact = [{ id: result.insertId }];
              console.log("✅ New contact created:", name);
            }
            const contactId = contact[0].id;

            await db.query(
              "INSERT INTO messages_wa (contact_id, direction, text, time_sent, status, is_read) VALUES (?, ?, ?, FROM_UNIXTIME(?), ?, ?)",
              [contactId, "in", text, timestamp, "read", 1],
            );
            await db.query(
              "UPDATE contacts_wa SET last_message = ?, last_contact_time = NOW() WHERE id = ?",
              [text, contactId],
            );

            // ✅ IMPORTANT: Require inside function to avoid circular dependency
            const {
              processChatbotMessage,
            } = require("../services/chatbotService");

            // Process chatbot
            try {
              const chatbotResult = await processChatbotMessage(
                contactId,
                text,
              );
              console.log("🤖 Chatbot processed:", chatbotResult);
            } catch (chatbotErr) {
              console.error("❌ Chatbot error:", chatbotErr.message);
            }
          }
        }
      }
    }
    return res.sendStatus(200);
  }
  return res.sendStatus(404);
}

// Get template status
async function getTemplateStatus(metaId) {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${metaId}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    return {
      status: response.data.status,
      rejection_reason: response.data.rejection_reason || null,
    };
  } catch (error) {
    console.error(
      "❌ getTemplateStatus error:",
      error.response?.data || error.message,
    );
    return null;
  }
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  submitTemplateToMeta,
  getTemplateStatus,
  verifyWebhook,
  handleWebhook,
  fetchMetaTemplates,
};