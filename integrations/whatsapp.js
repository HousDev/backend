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

// const axios = require("axios");
// const db = require("../config/database");
// // const { emitToUser, emitToContactRoom } = require("../utils/socket");
// const fs = require('fs');        // ← ADD THIS LINE
// const FormData = require('form-data');
// const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
// const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
// const WABA_ID = process.env.WABA_ID;
// const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

// function emitToUser(userId, event, payload) {
//   if (!global.io) return;
//   global.io.to(`user:${userId}`).emit(event, payload);
// }

// function emitToContactRoom(contactId, event, payload) {
//   if (!global.io) return;
//   global.io.to(`contact:${contactId}`).emit(event, payload);
// }
// // Send media message (Image, Video, Audio, Document)
// async function sendMediaMessage(to, filePath, mimeType, caption = '') {
//   const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

//   // Determine media type from mimeType
// let mediaType = 'document';
// if (['image/jpeg', 'image/png', 'image/jpg', 'image/gif'].includes(mimeType)) {
//   mediaType = 'image';
// } else if (mimeType.startsWith('video/')) {
//   mediaType = 'video';
// } else if (mimeType.startsWith('audio/')) {
//   mediaType = 'audio';
// }

//   try {
//     // Step 1: Upload media to WhatsApp
//     const mediaUrl = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/media`;
//     const formData = new FormData();
//     formData.append('messaging_product', 'whatsapp');
//     formData.append('file', fs.createReadStream(filePath));
//     formData.append('type', mimeType);

//     const uploadResponse = await axios.post(mediaUrl, formData, {
//       headers: {
//         ...formData.getHeaders(),
//         'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
//       },
//     });

//     const mediaId = uploadResponse.data.id;
//     console.log('📤 Media uploaded, ID:', mediaId);

//   const mediaPayload = { id: mediaId };

// if (mediaType === 'document') {
//   // Always use original filename from path, not caption
//   mediaPayload.filename = require('path').basename(filePath)
//     .replace(/^file-\d+-\d+-/, '');  // strip the multer prefix like "file-1778304324172-969728086-"
// } else if (caption) {
//   mediaPayload.caption = caption;
// }

// const payload = {
//   messaging_product: 'whatsapp',
//   to: to,
//   type: mediaType,
//   [mediaType]: mediaPayload
// };

//     const response = await axios.post(url, payload, {
//       headers: {
//         Authorization: `Bearer ${WHATSAPP_TOKEN}`,
//         "Content-Type": "application/json",
//       },
//     });

//     const messageId = response.data.messages[0].id;
//     console.log("📤 Media message sent, ID:", messageId);

//     // Step 3: Save to database

//     return messageId;
//   } catch (error) {
//     console.error("❌ sendMediaMessage error:", error.response?.data || error.message);
//     throw error;
//   }
// }
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

//     // ❌ REMOVED - Database insert is now handled by sendMessage controller
//     // This prevents duplicate messages and ensures sender_name is saved correctly

//     // ✅ Keep ONLY the socket emit functionality (optional - can also be removed if controller handles it)
//     const [contact] = await db.query(
//       "SELECT id FROM contacts_wa WHERE phone = ?",
//       [to],
//     );

//     if (contact.length > 0) {
//       // Get assigned user for socket emit only
//       const [assignedResult] = await db.query(
//         "SELECT assigned_to FROM contacts_wa WHERE id = ?",
//         [contact[0].id],
//       );
//       const assignedTo = assignedResult[0]?.assigned_to;

//       // Emit socket event for real-time update (optional - controller also emits)
//       if (assignedTo) {
//         emitToUser(assignedTo, "chat_update", {
//           contact_id: contact[0].id,
//           text: text,
//           direction: "out",
//           timestamp: new Date().toISOString(),
//         });
//       }

//       emitToContactRoom(contact[0].id, "chat_update", {
//         contact_id: contact[0].id,
//         text: text,
//         direction: "out",
//         timestamp: new Date().toISOString(),
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

//     const [contact] = await db.query(
//       "SELECT id FROM contacts_wa WHERE phone = ?",
//       [to],
//     );

//     if (contact.length > 0) {
//       const templateText = `Template: ${templateName}`;
//       await db.query(
//         `INSERT INTO messages_wa
//          (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, template_name)
//          VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), ?)`,
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
//             console.log(
//               "📊 Status Update:",
//               statusType,
//               "| Msg ID:",
//               messageId,
//             );

//             try {
//               await db.query(
//   `UPDATE messages_wa SET status = ?, is_read = ? WHERE whatsapp_msg_id = ?`,
//   [statusType, statusType === "read" ? 1 : 0, messageId],
// );

// // ✅ Emit real-time status update to frontend
// try {
//   const [msgRow] = await db.query(
//     `SELECT contact_id FROM messages_wa WHERE whatsapp_msg_id = ?`,
//     [messageId]
//   );
//   if (msgRow.length > 0) {
//     emitToContactRoom(msgRow[0].contact_id, 'message_status_update', {
//       whatsapp_msg_id: messageId,
//       status: statusType,
//     });
//   }
// } catch (e) {
//   console.error('❌ Failed to emit status update:', e);
// }
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

//             // ✅ Save incoming message with is_read = 0 (UNREAD)
//             await db.query(
//               `INSERT INTO messages_wa
//                (contact_id, direction, text, time_sent, status, is_read)
//                VALUES (?, 'in', ?, FROM_UNIXTIME(?), 'delivered', 0)`,
//               [contactId, text, timestamp],
//             );

//             await db.query(
//               `UPDATE contacts_wa SET last_message = ?, last_contact_time = NOW() WHERE id = ?`,
//               [text, contactId],
//             );

//             // ✅ Emit presence: contact is online when they send a message
// emitToContactRoom(contactId, 'contact_presence', {
//   contact_id: contactId,
//   status: 'online',   // they just messaged = online
//   last_seen: new Date().toISOString(),
// });

// // ✅ Auto set offline after 5 minutes
// setTimeout(() => {
//   emitToContactRoom(contactId, 'contact_presence', {
//     contact_id: contactId,
//     status: 'offline',
//     last_seen: new Date().toISOString(),
//   });
// }, 5 * 60 * 1000);

//             // ✅ Get assigned user
//             const [assignedResult] = await db.query(
//               "SELECT assigned_to FROM contacts_wa WHERE id = ?",
//               [contactId],
//             );
//             const assignedTo = assignedResult[0]?.assigned_to;

//             // ✅ Emit to assigned user
//             if (assignedTo) {
//               emitToUser(assignedTo, "chat_update", {
//                 contact_id: contactId,
//                 text: text,
//                 direction: "in",
//                 timestamp: new Date().toISOString(),
//                 is_read: 0,
//               });
//             }

//             // ✅ Emit to contact room for real-time chat
//             emitToContactRoom(contactId, "chat_update", {
//               contact_id: contactId,
//               text: text,
//               direction: "in",
//               timestamp: new Date().toISOString(),
//               is_read: 0,
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
//   sendMediaMessage,
//   submitTemplateToMeta,
//   getTemplateStatus,
//   verifyWebhook,
//   handleWebhook,
//   fetchMetaTemplates,
// };

const axios = require("axios");
const db = require("../config/database");
const fs = require("fs");
const FormData = require("form-data");
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WABA_ID = process.env.WABA_ID;
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

function emitToUser(userId, event, payload) {
  if (!global.io) return;
  global.io.to(`user:${userId}`).emit(event, payload);
}

function emitToContactRoom(contactId, event, payload) {
  if (!global.io) return;
  global.io.to(`contact:${contactId}`).emit(event, payload);
}

// Send media message (Image, Video, Audio, Document)
async function sendMediaMessage(to, filePath, mimeType, caption = "") {
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  let mediaType = "document";
  if (
    ["image/jpeg", "image/png", "image/jpg", "image/gif"].includes(mimeType)
  ) {
    mediaType = "image";
  } else if (mimeType.startsWith("video/")) {
    mediaType = "video";
  } else if (mimeType.startsWith("audio/")) {
    mediaType = "audio";
  }

  try {
    const mediaUrl = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/media`;
    const formData = new FormData();
    formData.append("messaging_product", "whatsapp");
    formData.append("file", fs.createReadStream(filePath));
    formData.append("type", mimeType);

    const uploadResponse = await axios.post(mediaUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
    });

    const mediaId = uploadResponse.data.id;
    console.log("📤 Media uploaded, ID:", mediaId);

    const mediaPayload = { id: mediaId };

    if (mediaType === "document") {
      mediaPayload.filename = require("path")
        .basename(filePath)
        .replace(/^file-\d+-\d+-/, "");
    } else if (caption) {
      mediaPayload.caption = caption;
    }

    const payload = {
      messaging_product: "whatsapp",
      to: to,
      type: mediaType,
      [mediaType]: mediaPayload,
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const messageId = response.data.messages[0].id;
    console.log("📤 Media message sent, ID:", messageId);

    return messageId;
  } catch (error) {
    console.error(
      "❌ sendMediaMessage error:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

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

    const [contact] = await db.query(
      "SELECT id FROM contacts_wa WHERE phone = ?",
      [to],
    );

    if (contact.length > 0) {
      const [assignedResult] = await db.query(
        "SELECT assigned_to FROM contacts_wa WHERE id = ?",
        [contact[0].id],
      );
      const assignedTo = assignedResult[0]?.assigned_to;

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

// Send Interactive Message (Buttons, Lists, etc.)
async function sendInteractiveMessage(to, interactiveMessage) {
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "interactive",
    interactive: interactiveMessage.interactive,
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const messageId = response.data.messages[0]?.id;
    console.log("📤 Interactive message sent, ID:", messageId);

    const [contact] = await db.query(
      "SELECT id FROM contacts_wa WHERE phone = ?",
      [to],
    );

    if (contact.length > 0 && messageId) {
      const messageText =
        interactiveMessage.interactive.body?.text || "Interactive message";

      await db.query(
        `INSERT INTO messages_wa 
         (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, sender_name) 
         VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), '🤖 Bot')`,
        [contact[0].id, messageText, messageId],
      );

      const [assignedResult] = await db.query(
        "SELECT assigned_to FROM contacts_wa WHERE id = ?",
        [contact[0].id],
      );
      const assignedTo = assignedResult[0]?.assigned_to;

      if (assignedTo) {
        emitToUser(assignedTo, "chat_update", {
          contact_id: contact[0].id,
          text: messageText,
          direction: "out",
          timestamp: new Date().toISOString(),
          isInteractive: true,
        });
      }

      emitToContactRoom(contact[0].id, "chat_update", {
        contact_id: contact[0].id,
        text: messageText,
        direction: "out",
        timestamp: new Date().toISOString(),
        isInteractive: true,
      });
    }

    return messageId;
  } catch (error) {
    console.error(
      "❌ sendInteractiveMessage error:",
      error.response?.data || error.message,
    );

    if (interactiveMessage.interactive?.body?.text) {
      console.log("⚠️ Falling back to text message...");
      return await sendTextMessage(
        to,
        interactiveMessage.interactive.body.text,
      );
    }

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

              try {
                const [msgRow] = await db.query(
                  `SELECT contact_id FROM messages_wa WHERE whatsapp_msg_id = ?`,
                  [messageId],
                );
                if (msgRow.length > 0) {
                  emitToContactRoom(
                    msgRow[0].contact_id,
                    "message_status_update",
                    {
                      whatsapp_msg_id: messageId,
                      status: statusType,
                    },
                  );
                }
              } catch (e) {
                console.error("❌ Failed to emit status update:", e);
              }
            } catch (err) {
              console.error("❌ Status update failed:", err);
            }
          }

          // ================= HANDLE INCOMING MESSAGES =================
          // ✅ FIX: Handle BOTH text messages AND button clicks
          const messages = change.value.messages || [];
          for (const msg of messages) {
            const from = msg.from;

            // ✅ Extract text from different message types
            let text = "";
            let messageType = "text";

            if (msg.text?.body) {
              text = msg.text.body;
              messageType = "text";
              console.log("📩 Text message:", from, "|", text);
            } else if (msg.interactive?.button_reply) {
              text = msg.interactive.button_reply.id;
              messageType = "button";
              console.log("🔘 Button clicked:", {
                from: from,
                id: msg.interactive.button_reply.id,
                title: msg.interactive.button_reply.title,
              });
            } else if (msg.interactive?.list_reply) {
              text = msg.interactive.list_reply.id;
              messageType = "list";
              console.log("📋 List selected:", from, "|", text);
            } else if (msg.button?.payload) {
              text = msg.button.payload;
              messageType = "button";
              console.log("🔘 Button payload:", from, "|", text);
            } else {
              console.log("⚠️ Unknown message type:", JSON.stringify(msg));
              continue; // Skip unknown message types
            }

            const timestamp = msg.timestamp;
            console.log(
              "📩 Processed:",
              from,
              "|",
              text,
              "| Type:",
              messageType,
            );

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

            // ✅ Emit presence: contact is online when they send a message
            emitToContactRoom(contactId, "contact_presence", {
              contact_id: contactId,
              status: "online",
              last_seen: new Date().toISOString(),
            });

            // ✅ Auto set offline after 5 minutes
            setTimeout(
              () => {
                emitToContactRoom(contactId, "contact_presence", {
                  contact_id: contactId,
                  status: "offline",
                  last_seen: new Date().toISOString(),
                });
              },
              5 * 60 * 1000,
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
                message_type: messageType,
              });
            }

            // ✅ Emit to contact room for real-time chat
            emitToContactRoom(contactId, "chat_update", {
              contact_id: contactId,
              text: text,
              direction: "in",
              timestamp: new Date().toISOString(),
              is_read: 0,
              message_type: messageType,
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
  sendMediaMessage,
  sendInteractiveMessage,
  submitTemplateToMeta,
  getTemplateStatus,
  verifyWebhook,
  handleWebhook,
  fetchMetaTemplates,
};