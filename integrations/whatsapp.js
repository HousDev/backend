// const axios = require("axios");
// const db = require("../config/database");

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
// async function submitTemplateToMeta({ name, category, language, body }) {
//   const url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`;
//   const payload = {
//     name,
//     category,
//     language,
//     components: [{ type: "BODY", text: body }],
//   };
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

// // Handle incoming messages
// async function handleWebhook(req, res) {
//   const body = req.body;
//   console.log("🔥 WEBHOOK TRIGGERED");
//   if (body.object === "whatsapp_business_account") {
//     for (const entry of body.entry) {
//       for (const change of entry.changes) {
//         if (change.field === "messages") {
//           const messages = change.value.messages || [];
//           for (const msg of messages) {
//             const from = msg.from;
//             const text = msg.text?.body || "";
//             const timestamp = msg.timestamp;
//             console.log("📩 Incoming message from:", from, "| Text:", text);

//             // Find or create contact
//             let [contact] = await db.query(
//               "SELECT id FROM contacts_wa WHERE phone = ?",
//               [from],
//             );
//             if (contact.length === 0) {
//               const name = `Customer ${from.slice(-4)}`;
//               const [result] = await db.query(
//                 "INSERT INTO contacts_wa (name, phone) VALUES (?, ?)",
//                 [name, from],
//               );
//               contact = [{ id: result.insertId }];
//               // Initialize pipeline stages
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
//               console.log(
//                 "✅ New contact created:",
//                 name,
//                 "| ID:",
//                 result.insertId,
//               );
//             }
//             const contactId = contact[0].id;

//             // Save incoming message
//             await db.query(
//               "INSERT INTO messages_wa (contact_id, direction, text, time_sent) VALUES (?, ?, ?, FROM_UNIXTIME(?))",
//               [contactId, "in", text, timestamp],
//             );
//             await db.query(
//               "UPDATE contacts_wa SET last_message = ?, last_contact_time = NOW() WHERE id = ?",
//               [text, contactId],
//             );

//             // ---------- AUTO REPLY (WITH PROPER ERROR HANDLING) ----------
//             try {
//               const msgId = await sendTextMessage(
//                 from,
//                 "Thanks for contacting us!",
//               );
//               console.log(
//                 "✅ Auto-reply sent to",
//                 from,
//                 "| Message ID:",
//                 msgId,
//               );
//             } catch (err) {
//               console.error("❌ Auto-reply FAILED for", from);
//               console.error(
//                 "Error details:",
//                 err.response?.data || err.message,
//               );
//               // Optional: store failed attempt in a log table
//             }

//             // Trigger automation rules
//             const {
//               triggerAutomation,
//             } = require("../services/automationEngine");
//             await triggerAutomation(contactId, text);
//           }
//         }
//       }
//     }
//     res.sendStatus(200);
//   } else {
//     res.sendStatus(404);
//   }
// }

// module.exports = {
//   sendTextMessage,
//   sendTemplateMessage,
//   submitTemplateToMeta,
//   verifyWebhook,
//   handleWebhook,
// };
const axios = require("axios");
const db = require("../config/database");
const { emitToUser, getIO } = require("../utils/socket");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WABA_ID = process.env.WABA_ID;
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

// --------------------------------------------------------------
// WhatsApp API Helpers
// --------------------------------------------------------------
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

async function submitTemplateToMeta({ name, category, language, body }) {
  const url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`;
  const payload = {
    name,
    category,
    language,
    components: [{ type: "BODY", text: body }],
  };
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

// --------------------------------------------------------------
// Webhook handlers
// --------------------------------------------------------------
function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  // Use WEBHOOK_VERIFY_TOKEN from .env, NOT WHATSAPP_TOKEN
  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
}

async function handleWebhook(req, res) {
  const body = req.body;
  console.log("🔥 WEBHOOK TRIGGERED");

  if (body.object !== "whatsapp_business_account") {
    return res.sendStatus(404);
  }

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const messages = change.value.messages || [];
      for (const msg of messages) {
        const from = msg.from;
        const text = msg.text?.body || "";
        const timestamp = msg.timestamp;
        console.log("📩 Incoming message from:", from, "| Text:", text);

        // ------------------------------------------------------
        // 1. Find or create contact in `contacts` table
        // ------------------------------------------------------
        let [contact] = await db.query(
          "SELECT id, assigned_to FROM contacts WHERE phone = ?",
          [from],
        );

        let contactId;
        if (contact.length === 0) {
          const name = `Customer ${from.slice(-4)}`;
          const initials = name.slice(0, 2).toUpperCase();
          const [result] = await db.query(
            `INSERT INTO contacts (name, phone, tag, stage, assigned_to, color, initials)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, from, "new", "New", "Unassigned", "blue", initials],
          );
          contactId = result.insertId;

          // Create pipeline stages
          const stages = [
            "New",
            "Enquiry",
            "Qualified",
            "Proposal",
            "Negotiation",
            "Closed Won",
          ];
          for (const s of stages) {
            await db.query(
              "INSERT INTO pipeline_stages (contact_id, stage_name, done) VALUES (?, ?, ?)",
              [contactId, s, false],
            );
          }
          console.log("✅ New contact created:", name, "| ID:", contactId);
        } else {
          contactId = contact[0].id;
        }

        // ------------------------------------------------------
        // 2. Save incoming message to `messages` table
        // ------------------------------------------------------
        await db.query(
          `INSERT INTO messages (contact_id, direction, text, time_sent)
           VALUES (?, ?, ?, FROM_UNIXTIME(?))`,
          [contactId, "in", text, timestamp],
        );
        await db.query(
          `UPDATE contacts SET last_message = ?, last_contact_time = NOW()
           WHERE id = ?`,
          [text, contactId],
        );

        // ------------------------------------------------------
        // 3. Send auto‑reply (optional)
        // ------------------------------------------------------
        try {
          const msgId = await sendTextMessage(
            from,
            "Thanks for contacting us!",
          );
          console.log("✅ Auto-reply sent to", from, "| Message ID:", msgId);
          // Also save the auto-reply in messages (as 'bot')
          await db.query(
            `INSERT INTO messages (contact_id, direction, text, whatsapp_msg_id)
             VALUES (?, ?, ?, ?)`,
            [contactId, "bot", "Thanks for contacting us!", msgId],
          );
        } catch (err) {
          console.error("❌ Auto-reply FAILED for", from, err.message);
        }

        // ------------------------------------------------------
        // 4. Emit Socket.IO event for real‑time UI update
        // ------------------------------------------------------
        try {
          // Get the assigned agent's user ID (mapping name -> user_id)
          const assignedName = contact[0]?.assigned_to || "Unassigned";
          const agentIdMap = {
            Priya: 1,
            Rohan: 2,
            "Sales Team": 3,
            Unassigned: null,
            Bot: null,
            You: null,
          };
          const userId = agentIdMap[assignedName];

          if (userId) {
            emitToUser(userId, "new_message", {
              contact_id: contactId,
              message: {
                direction: "in",
                text: text,
                time_sent: new Date().toISOString(),
              },
            });
            console.log("📡 Socket emitted to user", userId);
          } else {
            // Fallback: broadcast to all connected clients
            const io = getIO();
            io.emit("new_message", {
              contact_id: contactId,
              message: {
                direction: "in",
                text: text,
                time_sent: new Date().toISOString(),
              },
            });
            console.log("📡 Socket broadcasted to all");
          }
        } catch (socketErr) {
          console.error("Socket emit error:", socketErr.message);
        }

        // ------------------------------------------------------
        // 5. Trigger automation rules (optional)
        // ------------------------------------------------------
        const { triggerAutomation } = require("../services/automationEngine");
        await triggerAutomation(contactId, text);
      }
    }
  }

  res.sendStatus(200);
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  submitTemplateToMeta,
  verifyWebhook,
  handleWebhook,
};