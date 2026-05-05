// const axios = require("axios");
// const db = require("../config/database");
// const { emitToUser } = require("../utils/socket");

// const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
// const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
// const WABA_ID = process.env.WABA_ID;
// const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

// // Send text message
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

//     const messageId = response.data.messages[0].id;
//     console.log("📤 Message sent, ID:", messageId);

//     // ✅ Save outgoing message to database
//     const [contact] = await db.query(
//       "SELECT id FROM contacts_wa WHERE phone = ?",
//       [to],
//     );

//     if (contact.length > 0) {
//       await db.query(
//         `INSERT INTO messages_wa
//          (contact_id, direction, text, whatsapp_msg_id, status, time_sent)
//          VALUES (?, 'out', ?, ?, 'sent', NOW())`,
//         [contact[0].id, text, messageId],
//       );
//       console.log(
//         "💾 Outgoing message saved to DB for contact:",
//         contact[0].id,
//       );

//       // Emit socket event for real-time update
//       emitToUser(null, "new_message", {
//         contact_id: contact[0].id,
//         message: {
//           id: messageId,
//           direction: "out",
//           text: text,
//           time_sent: new Date().toISOString(),
//         },
//       });
//     } else {
//       console.log("⚠️ Contact not found for phone:", to);
//     }

//     return messageId;
//   } catch (error) {
//     console.error(
//       "❌ sendTextMessage error:",
//       error.response?.data || error.message,
//     );
//     throw error;
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

//     const messageId = response.data.messages[0].id;
//     console.log("📤 Template message sent, ID:", messageId);

//     // ✅ Save outgoing template message to database
//     const [contact] = await db.query(
//       "SELECT id FROM contacts_wa WHERE phone = ?",
//       [to],
//     );

//     if (contact.length > 0) {
//       const templateText = `Template: ${templateName}`;
//       await db.query(
//         `INSERT INTO messages_wa
//          (contact_id, direction, text, whatsapp_msg_id, status, time_sent, template_name)
//          VALUES (?, 'out', ?, ?, 'sent', NOW(), ?)`,
//         [contact[0].id, templateText, messageId, templateName],
//       );
//       console.log(
//         "💾 Outgoing template message saved to DB for contact:",
//         contact[0].id,
//       );
//     }

//     return messageId;
//   } catch (error) {
//     console.error(
//       "❌ sendTemplateMessage error:",
//       error.response?.data || error.message,
//     );
//     throw error;
//   }
// }

// // Submit template to Meta
// async function submitTemplateToMeta(payload) {
//   const url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`;
//   try {
//     const response = await axios.post(url, payload, {
//       headers: {
//         Authorization: `Bearer ${WHATSAPP_TOKEN}`,
//         "Content-Type": "application/json",
//       },
//     });
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

// // Fetch Meta templates
// const fetchMetaTemplates = async () => {
//   try {
//     let allTemplates = [];
//     let url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`;
//     while (url) {
//       const res = await axios.get(url, {
//         headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
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

// // Handle webhook
// // async function handleWebhook(req, res) {
// //   const body = req.body;
// //   console.log("🔥 WEBHOOK TRIGGERED");

// //   if (body.object === "whatsapp_business_account") {
// //     for (const entry of body.entry) {
// //       for (const change of entry.changes) {
// //         if (change.field === "messages") {
// //           // Handle status updates
// //           const statuses = change.value.statuses || [];
// //           for (const status of statuses) {
// //             const messageId = status.id;
// //             const statusType = status.status;
// //             console.log(
// //               "📊 Status Update:",
// //               statusType,
// //               "| Msg ID:",
// //               messageId,
// //             );

// //             try {
// //               await db.query(
// //                 `UPDATE messages_wa SET status = ?, is_read = ? WHERE whatsapp_msg_id = ?`,
// //                 [statusType, statusType === "read" ? 1 : 0, messageId],
// //               );
// //             } catch (err) {
// //               console.error("❌ Status update failed:", err);
// //             }
// //           }

// //           // Handle incoming messages
// //           const messages = change.value.messages || [];
// //           for (const msg of messages) {
// //             const from = msg.from;
// //             const text = msg.text?.body || "";
// //             const timestamp = msg.timestamp;
// //             console.log("📩 Incoming message:", from, "|", text);

// //             let [contact] = await db.query(
// //               "SELECT id FROM contacts_wa WHERE phone = ?",
// //               [from],
// //             );

// //             if (contact.length === 0) {
// //               const name =
// //                 change.value.contacts?.[0]?.profile?.name ??
// //                 `Customer ${from.slice(-4)}`;
// //               const [result] = await db.query(
// //                 "INSERT INTO contacts_wa (name, phone) VALUES (?, ?)",
// //                 [name, from],
// //               );
// //               contact = [{ id: result.insertId }];
// //               console.log("✅ New contact created:", name);
// //             }

// //             const contactId = contact[0].id;

// //             // Save incoming message
// //             await db.query(
// //               `INSERT INTO messages_wa
// //                (contact_id, direction, text, time_sent, status, is_read)
// //                VALUES (?, 'in', ?, FROM_UNIXTIME(?), 'read', 1)`,
// //               [contactId, text, timestamp],
// //             );

// //             await db.query(
// //               `UPDATE contacts_wa SET last_message = ?, last_contact_time = NOW() WHERE id = ?`,
// //               [text, contactId],
// //             );

// //             // Emit socket event for real-time update
// //             emitToUser(null, "new_message", {
// //               contact_id: contactId,
// //               message: {
// //                 direction: "in",
// //                 text: text,
// //                 time_sent: new Date().toISOString(),
// //               },
// //             });

// //             // Process chatbot
// //             const {
// //               processChatbotMessage,
// //             } = require("../services/chatbotService");

// //             try {
// //               const chatbotResult = await processChatbotMessage(
// //                 contactId,
// //                 text,
// //               );
// //               console.log("🤖 Chatbot processed:", chatbotResult);
// //             } catch (chatbotErr) {
// //               console.error("❌ Chatbot error:", chatbotErr.message);
// //             }
// //           }
// //         }
// //       }
// //     }
// //     return res.sendStatus(200);
// //   }
// //   return res.sendStatus(404);
// // }
// // Handle webhook
// async function handleWebhook(req, res) {
//   const body = req.body;
//   console.log("🔥 WEBHOOK TRIGGERED");

//   if (body.object === "whatsapp_business_account") {
//     for (const entry of body.entry) {
//       for (const change of entry.changes) {
//         if (change.field === "messages") {
//           // Handle status updates
//           const statuses = change.value.statuses || [];
//           for (const status of statuses) {
//             const messageId = status.id;
//             const statusType = status.status;
//             console.log("📊 Status Update:", statusType, "| Msg ID:", messageId);

//             try {
//               await db.query(
//                 `UPDATE messages_wa SET status = ?, is_read = ? WHERE whatsapp_msg_id = ?`,
//                 [statusType, statusType === "read" ? 1 : 0, messageId],
//               );
//             } catch (err) {
//               console.error("❌ Status update failed:", err);
//             }
//           }

//           // Handle incoming messages
//           const messages = change.value.messages || [];
//           for (const msg of messages) {
//             const from = msg.from;
//             const text = msg.text?.body || "";
//             const timestamp = msg.timestamp;
//             console.log("📩 Incoming message:", from, "|", text);

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
//               console.log("✅ New contact created:", name);
//             }

//             const contactId = contact[0].id;

//             // ✅ CHANGE HERE: Save incoming message with is_read = 0 (UNREAD)
//             await db.query(
//               `INSERT INTO messages_wa
//                (contact_id, direction, text, time_sent, status, is_read)
//                VALUES (?, 'in', ?, FROM_UNIXTIME(?), 'delivered', 0)`,  // ← is_read = 0
//               [contactId, text, timestamp],
//             );

//             await db.query(
//               `UPDATE contacts_wa SET last_message = ?, last_contact_time = NOW() WHERE id = ?`,
//               [text, contactId],
//             );

//             // Emit socket event for real-time update
//             emitToUser(null, "new_message", {
//               contact_id: contactId,
//               message: {
//                 id: Date.now(),
//                 direction: "in",
//                 text: text,
//                 time_sent: new Date().toISOString(),
//                 is_read: 0,  // ← Unread
//               },
//             });

//             // Process chatbot
//             const {
//               processChatbotMessage,
//             } = require("../services/chatbotService");

//             try {
//               const chatbotResult = await processChatbotMessage(
//                 contactId,
//                 text,
//               );
//               console.log("🤖 Chatbot processed:", chatbotResult);
//             } catch (chatbotErr) {
//               console.error("❌ Chatbot error:", chatbotErr.message);
//             }
//           }
//         }
//       }
//     }
//     return res.sendStatus(200);
//   }
//   return res.sendStatus(404);
// }
// // Get template status
// async function getTemplateStatus(metaId) {
//   try {
//     const url = `https://graph.facebook.com/${API_VERSION}/${metaId}`;
//     const response = await axios.get(url, {
//       headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
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
const { emitToUser, emitToContactRoom } = require("../utils/socket");

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

    const messageId = response.data.messages[0].id;
    console.log("📤 Message sent, ID:", messageId);

    // ✅ Save outgoing message to database
    const [contact] = await db.query(
      "SELECT id FROM contacts_wa WHERE phone = ?",
      [to],
    );

    if (contact.length > 0) {
      await db.query(
        `INSERT INTO messages_wa 
         (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent) 
         VALUES (?, 'out', ?, ?, 'sent', 1, NOW())`,
        [contact[0].id, text, messageId],
      );
      console.log(
        "💾 Outgoing message saved to DB for contact:",
        contact[0].id,
      );

      // Get assigned user
      const [assignedResult] = await db.query(
        "SELECT assigned_to FROM contacts_wa WHERE id = ?",
        [contact[0].id],
      );
      const assignedTo = assignedResult[0]?.assigned_to;

      // Emit socket event for real-time update
      if (assignedTo) {
        emitToUser(assignedTo, "chat_update", {
          contact_id: contact[0].id,
          text: text,
          direction: "out",
          timestamp: new Date().toISOString(),
        });
      }

      emitToContactRoom(contact[0].id, "chat_update", {
        contact_id: contact[0].id,
        text: text,
        direction: "out",
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log("⚠️ Contact not found for phone:", to);
    }

    return messageId;
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

    const messageId = response.data.messages[0].id;
    console.log("📤 Template message sent, ID:", messageId);

    const [contact] = await db.query(
      "SELECT id FROM contacts_wa WHERE phone = ?",
      [to],
    );

    if (contact.length > 0) {
      const templateText = `Template: ${templateName}`;
      await db.query(
        `INSERT INTO messages_wa 
         (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, template_name) 
         VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), ?)`,
        [contact[0].id, templateText, messageId, templateName],
      );
      console.log(
        "💾 Outgoing template message saved to DB for contact:",
        contact[0].id,
      );
    }

    return messageId;
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
          // Handle status updates
          const statuses = change.value.statuses || [];
          for (const status of statuses) {
            const messageId = status.id;
            const statusType = status.status;
            console.log(
              "📊 Status Update:",
              statusType,
              "| Msg ID:",
              messageId,
            );

            try {
              await db.query(
                `UPDATE messages_wa SET status = ?, is_read = ? WHERE whatsapp_msg_id = ?`,
                [statusType, statusType === "read" ? 1 : 0, messageId],
              );
            } catch (err) {
              console.error("❌ Status update failed:", err);
            }
          }

          // Handle incoming messages
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

            // ✅ Save incoming message with is_read = 0 (UNREAD)
            await db.query(
              `INSERT INTO messages_wa 
               (contact_id, direction, text, time_sent, status, is_read) 
               VALUES (?, 'in', ?, FROM_UNIXTIME(?), 'delivered', 0)`,
              [contactId, text, timestamp],
            );

            await db.query(
              `UPDATE contacts_wa SET last_message = ?, last_contact_time = NOW() WHERE id = ?`,
              [text, contactId],
            );

            // ✅ Get assigned user
            const [assignedResult] = await db.query(
              "SELECT assigned_to FROM contacts_wa WHERE id = ?",
              [contactId],
            );
            const assignedTo = assignedResult[0]?.assigned_to;

            // ✅ Emit to assigned user
            if (assignedTo) {
              emitToUser(assignedTo, "chat_update", {
                contact_id: contactId,
                text: text,
                direction: "in",
                timestamp: new Date().toISOString(),
                is_read: 0,
              });
            }

            // ✅ Emit to contact room for real-time chat
            emitToContactRoom(contactId, "chat_update", {
              contact_id: contactId,
              text: text,
              direction: "in",
              timestamp: new Date().toISOString(),
              is_read: 0,
            });

            // Process chatbot
            const {
              processChatbotMessage,
            } = require("../services/chatbotService");

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