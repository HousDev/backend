

const axios = require("axios");
const db = require("../config/database");
const fs = require("fs");
const FormData = require("form-data");
// const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
// const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
// const WABA_ID = process.env.WABA_ID;
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";
const Integration = require("../models/integration.model");

async function getWhatsAppConfig() {
  const [token, phoneId, wabaId, version] = await Promise.all([
    Integration.getSetting("whatsapp", "access_token"),
    Integration.getSetting("whatsapp", "phone_number_id"),
    Integration.getSetting("whatsapp", "waba_id"),
    Integration.getSetting("whatsapp", "api_version"),
  ]);
  return {
    WHATSAPP_TOKEN: token,
    PHONE_NUMBER_ID: phoneId,
    WABA_ID: wabaId,
    API_VERSION: version?.trim() || "v23.0",
  };
}

async function downloadWhatsAppMedia(mediaId) {
  try {
    const { WHATSAPP_TOKEN, API_VERSION } = await getWhatsAppConfig();

    const UPLOAD_ROOT = process.env.UPLOAD_ROOT
      ? require("path").resolve(process.env.UPLOAD_ROOT)
      : require("path").join(__dirname, "..", "uploads");
    const UPLOAD_PUBLIC_BASE = process.env.UPLOAD_PUBLIC_BASE || "/uploads";

    const metaRes = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${mediaId}`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } },
    );

    const downloadUrl = metaRes.data.url;
    const mimeType = metaRes.data.mime_type || "image/jpeg";
    if (!downloadUrl) return null;

    const fileRes = await axios.get(downloadUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    const ext =
      mimeType.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") || "bin";
    const fileName = `wa_${mediaId}_${Date.now()}.${ext}`;
    const saveDir = require("path").join(UPLOAD_ROOT, "messages");

    if (!require("fs").existsSync(saveDir)) {
      require("fs").mkdirSync(saveDir, { recursive: true });
    }

    const savePath = require("path").join(saveDir, fileName);
    require("fs").writeFileSync(savePath, fileRes.data);

    const publicUrl = `${UPLOAD_PUBLIC_BASE}/messages/${fileName}`;
    console.log("✅ Media saved:", savePath);
    console.log("✅ Public URL:", publicUrl);
    return publicUrl;
  } catch (err) {
    console.error("❌ downloadWhatsAppMedia failed:", err.message);
    return null;
  }
}

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
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, API_VERSION } = await getWhatsAppConfig();

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
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, API_VERSION } = await getWhatsAppConfig();

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
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, API_VERSION } = await getWhatsAppConfig();

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

      // await db.query(
      //   `INSERT INTO messages_wa 
      //    (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, sender_name) 
      //    VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), '🤖 Bot')`,
      //   [contact[0].id, messageText, messageId],
      // );

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
        isOwnMessage: true,
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
// async function sendTemplateMessage(
//   to,
//   templateName,
//   language = "en",
//   components = [],
// ) {
// const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, API_VERSION } = await getWhatsAppConfig();

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

// Send template message - FIXED VERSION
// async function sendTemplateMessage(to, templateName, language = "en", variables = []) {
//   const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, API_VERSION } = await getWhatsAppConfig();

//   const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  
//   // ✅ Build components array from variables (FIX)
//   let components = [];
//   if (variables && variables.length > 0) {
//     components = [
//       {
//         type: "body",
//         parameters: variables.map(v => ({
//           type: "text",
//           text: String(v)
//         }))
//       }
//     ];
//   }
  
//   const payload = {
//     messaging_product: "whatsapp",
//     to: to,
//     type: "template",
//     template: {
//       name: templateName,
//       language: { code: language },
//       components  // ← Now this will have the variables
//     },
//   };

//   console.log("📤 Template payload:", JSON.stringify(payload, null, 2));

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

//     // if (contact.length > 0) {
//     //   const templateText = `Template: ${templateName}`;
//     //   await db.query(
//     //     `INSERT INTO messages_wa
//     //      (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, template_name)
//     //      VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), ?)`,
//     //     [contact[0].id, templateText, messageId, templateName],
//     //   );
//     //   console.log("💾 Outgoing template message saved to DB for contact:", contact[0].id);
//     // }
//     if (contact.length > 0) {
//   // ✅ Build actual message body from variables
//   let actualBody = templateName;
//   if (variables && variables.length > 0) {
//     actualBody = variables.join(' ') || templateName;
//   }
  
//   await db.query(
//     `INSERT INTO messages_wa
//      (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, template_name)
//      VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), ?)`,
//     [contact[0].id, actualBody, messageId, templateName],
//   );
//   console.log("💾 Outgoing template message saved to DB with body:", actualBody);
//     }
//     if (contact.length > 0) {
//   // ✅ Fetch actual template body from database
//   const [templateRows] = await db.query(
//     `SELECT body FROM templates_wa WHERE name = ?`,
//     [templateName]
//   );
  
//   let actualBody = templateName;
//   if (templateRows.length > 0 && templateRows[0].body) {
//     actualBody = templateRows[0].body;
//     // Replace variables in body
//     if (variables && variables.length > 0) {
//       variables.forEach((v, i) => {
//         actualBody = actualBody.replace(`{{${i + 1}}}`, v);
//       });
//     }
//   }
  
//   await db.query(
//     `INSERT INTO messages_wa
//      (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, template_name)
//      VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), ?)`,
//     [contact[0].id, actualBody, messageId, templateName],
//   );
// }

//     return messageId;
//   } catch (error) {
//     console.error("❌ sendTemplateMessage error:", error.response?.data || error.message);
//     throw error;
//   }
// }
// Submit template to Meta

// async function sendTemplateMessage(
//   to,
//   templateName,
//   language = "en",
//   variables = [],
// ) {
//   const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, API_VERSION } =
//     await getWhatsAppConfig();

//   const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

//   let components = [];
//   if (variables && variables.length > 0) {
//     components = [
//       {
//         type: "body",
//         parameters: variables.map((v) => ({
//           type: "text",
//           text: String(v),
//         })),
//       },
//     ];
//   }

//   const payload = {
//     messaging_product: "whatsapp",
//     to: to,
//     type: "template",
//     template: {
//       name: templateName,
//       language: { code: language },
//       components,
//     },
//   };

//   try {
//     const response = await axios.post(url, payload, {
//       headers: {
//         Authorization: `Bearer ${WHATSAPP_TOKEN}`,
//         "Content-Type": "application/json",
//       },
//     });

//     const messageId = response.data.messages[0].id;

//     const [contact] = await db.query(
//       "SELECT id FROM contacts_wa WHERE phone = ?",
//       [to],
//     );

//     if (contact.length > 0) {
//       // ✅ DEBUG: Check what's in database
//       const [templateRows] = await db.query(
//         `SELECT id, name, body FROM templates_wa WHERE name = ?`,
//         [templateName],
//       );

//       console.log("🔍 Template query result:", templateRows);
//       console.log("🔍 Template body from DB:", templateRows[0]?.body);

//       let actualBody = templateName;
//       if (templateRows.length > 0 && templateRows[0].body) {
//         actualBody = templateRows[0].body;
//         console.log("🔍 Before replace:", actualBody);

//         // Replace placeholders with actual values
//         if (variables && variables.length > 0) {
//           variables.forEach((v, i) => {
//             const placeholder = new RegExp(`\\{\\{${i + 1}\\}\\}`, "g");
//             actualBody = actualBody.replace(placeholder, v);
//             console.log(
//               `🔍 After replacing {{${i + 1}}} with "${v}":`,
//               actualBody,
//             );
//           });
//         }
//       } else {
//         console.log(
//           "❌ No template body found! templateRows length:",
//           templateRows.length,
//         );
//         console.log("❌ Using fallback:", actualBody);
//       }

//       // ✅ SINGLE INSERT
//       await db.query(
//         `INSERT INTO messages_wa
//          (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, template_name)
//          VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), ?)`,
//         [contact[0].id, actualBody, messageId, templateName],
//       );
//       console.log("💾 Saved message with body:", actualBody.substring(0, 100));
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


async function sendTemplateMessage(
  to,
  templateName,
  language = "en",
  variables = [],
) {
  const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, API_VERSION } =
    await getWhatsAppConfig();

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  let components = [];
  if (variables && variables.length > 0) {
    components = [
      {
        type: "body",
        parameters: variables.map((v) => ({
          type: "text",
          text: String(v),
        })),
      },
    ];
  }

  const payload = {
    messaging_product: "whatsapp",
    to: to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  };

  console.log("📤 [sendTemplateMessage] Sending to:", to);
  console.log("📤 [sendTemplateMessage] Template:", templateName);
  console.log("📤 [sendTemplateMessage] Variables:", variables);

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const messageId = response.data.messages[0].id;
    console.log("📤 [sendTemplateMessage] Sent, ID:", messageId);

    // Normalize phone
    let lookupPhone = to;
    if (!lookupPhone.startsWith("+")) {
      lookupPhone = "+" + lookupPhone;
    }

    let [contact] = await db.query(
      "SELECT id FROM contacts_wa WHERE phone = ?",
      [lookupPhone],
    );
    if (contact.length === 0) {
      [contact] = await db.query("SELECT id FROM contacts_wa WHERE phone = ?", [
        to,
      ]);
    }

    if (contact.length > 0) {
      // ✅ ALWAYS fetch template body from database
      const [templateRows] = await db.query(
        `SELECT body FROM templates_wa WHERE name = ? LIMIT 1`,
        [templateName],
      );

      let messageText = `Template: ${templateName}`; // fallback

      if (templateRows.length > 0 && templateRows[0].body) {
        messageText = templateRows[0].body;

        // Replace variables in body
        if (variables && variables.length > 0) {
          variables.forEach((val, idx) => {
            const placeholder = new RegExp(`\\{\\{${idx + 1}\\}\\}`, "g");
            messageText = messageText.replace(placeholder, val || "");
          });
        }
      }

      console.log(
        "📤 [sendTemplateMessage] Saving message:",
        messageText.substring(0, 100),
      );

      await db.query(
        `INSERT INTO messages_wa 
        (contact_id, direction, text, whatsapp_msg_id, status, is_read, time_sent, template_name) 
        VALUES (?, 'out', ?, ?, 'sent', 1, NOW(), ?)`,
        [contact[0].id, messageText, messageId, templateName],
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

async function submitTemplateToMeta(payload) {
const { WHATSAPP_TOKEN, WABA_ID, API_VERSION } = await getWhatsAppConfig();
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
const { WHATSAPP_TOKEN, WABA_ID, API_VERSION } = await getWhatsAppConfig();
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
      emitToContactRoom(msgRow[0].contact_id, "message_status_update", {
        whatsapp_msg_id: messageId,
        status: statusType,
      });
    }
  } catch (e) {
    console.error("❌ Failed to emit status update:", e);
  }

  // ✅ NEW: sync campaign_logs + campaign counters
  try {
    const [logRows] = await db.query(
      `SELECT id, campaign_id, status as current_status 
       FROM campaign_logs WHERE whatsapp_msg_id = ?`,
      [messageId],
    );

    if (logRows.length > 0) {
      const log = logRows[0];

      // Only update if status is actually changing (avoid double-counting)
      if (log.current_status !== statusType) {
        // Update campaign_log status + timestamp
        let timeField = "";
        if (statusType === "delivered") timeField = ", delivered_at = NOW()";
        else if (statusType === "read")
          timeField =
            ", delivered_at = COALESCE(delivered_at, NOW()), read_at = NOW()";

        await db.query(
          `UPDATE campaign_logs SET status = ?, updated_at = NOW()${timeField} 
           WHERE id = ?`,
          [statusType, log.id],
        );

        // Update campaign aggregate counter
        if (statusType === "delivered") {
          await db.query(
            `UPDATE campaigns SET delivered_count = delivered_count + 1, 
             updated_at = NOW() WHERE id = ?`,
            [log.campaign_id],
          );
        } else if (statusType === "read") {
          await db.query(
            `UPDATE campaigns SET read_count = read_count + 1, 
             updated_at = NOW() WHERE id = ?`,
            [log.campaign_id],
          );
        }

        // Emit live update to frontend
        if (global.io) {
          const [campRows] = await db.query(
            `SELECT id, delivered_count, read_count, sent_count, 
             failed_count, total_contacts FROM campaigns WHERE id = ?`,
            [log.campaign_id],
          );
          if (campRows.length > 0) {
            global.io.emit("campaign_stats_update", {
              campaign_id: log.campaign_id,
              stats: campRows[0],
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("❌ Failed to sync campaign log status:", e);
  }
} catch (err) {
  console.error("❌ Status update failed:", err);
}
          }

          // ================= HANDLE INCOMING MESSAGES =================
          const messages = change.value.messages || [];
          for (const msg of messages) {
            const from = msg.from;

            // Normalise phone: add '+' if missing
            let lookupPhone = from;
            if (!lookupPhone.startsWith('+')) {
              lookupPhone = '+' + lookupPhone;
            }

            let [contact] = await db.query(
              "SELECT id FROM contacts_wa WHERE phone = ?",
              [lookupPhone]
            );

            // Fallback for old records without '+'
            if (contact.length === 0 && lookupPhone.startsWith('+')) {
              const withoutPlus = lookupPhone.substring(1);
              [contact] = await db.query(
                "SELECT id FROM contacts_wa WHERE phone = ?",
                [withoutPlus]
              );
            }

            // If still not found, create a new contact
            if (contact.length === 0) {
              // const name =
              //   change.value.contacts?.[0]?.profile?.name ??
              //   `Customer ${from.slice(-4)}`;
              const profileName = change.value.contacts?.[0]?.profile?.name;

              const name =
                profileName && profileName.trim() ? profileName : lookupPhone;
              
              
              const [result] = await db.query(
                "INSERT INTO contacts_wa (name, phone) VALUES (?, ?)",
                [name, lookupPhone]  // Store with '+'
              );
              contact = [{ id: result.insertId }];
              console.log("✅ New contact created:", name);
            }

            const contactId = contact[0].id;

            // ✅ Extract text from different message types
            let text = "";
            let messageType = "text";
            let mediaUrl = null;
            let mediaType = null;
            let fileName = null;

   if (msg.text?.body) {
  text = msg.text.body;
  messageType = "text";
  console.log("📩 Text message:", from, "|", text);

} else if (msg.image) {
  messageType = "image";
  const mediaId = msg.image.media_id || msg.image.id;
  mediaType = "image/jpeg";
  if (mediaId) {
    mediaUrl = await downloadWhatsAppMedia(mediaId);
  }
  text = msg.image.caption || "";
  console.log("🖼️ Image message:", from, "| mediaUrl:", mediaUrl);

} else if (msg.video) {
  messageType = "video";
  const mediaId = msg.video.media_id || msg.video.id;
  mediaType = "video/mp4";
  if (mediaId) {
    mediaUrl = await downloadWhatsAppMedia(mediaId);
  }
  text = msg.video.caption || "";
  console.log("🎥 Video message:", from, "| mediaUrl:", mediaUrl);

} else if (msg.audio) {
  messageType = "audio";
  const mediaId = msg.audio.media_id || msg.audio.id;
  mediaType = "audio/mpeg";
  if (mediaId) {
    mediaUrl = await downloadWhatsAppMedia(mediaId);
  }
  text = "🎵 Audio";
  console.log("🎵 Audio message:", from);

} else if (msg.document) {
  messageType = "document";
  const mediaId = msg.document.media_id || msg.document.id;
  mediaType = msg.document.mime_type || "application/pdf";
  fileName = msg.document.filename || "document";
  if (mediaId) {
    mediaUrl = await downloadWhatsAppMedia(mediaId);
  }
  text = msg.document.caption || fileName;
  console.log("📄 Document message:", from, "| file:", fileName);

}  else if (msg.sticker) {
  text = "🎨 Sticker";
  messageType = "sticker";
} else if (msg.location) {
  text = `📍 Location: ${msg.location.latitude}, ${msg.location.longitude}`;
  messageType = "location";
} else if (msg.interactive?.button_reply) {
  text = msg.interactive.button_reply.title;
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
  continue;
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

            // ✅ Save incoming message with is_read = 0 (UNREAD)
            await db.query(
              `INSERT INTO messages_wa 
   (contact_id, direction, text, time_sent, status, is_read, media_url, media_type, file_name) 
   VALUES (?, 'in', ?, FROM_UNIXTIME(?), 'delivered', 0, ?, ?, ?)`,
              [contactId, text, timestamp, mediaUrl, mediaType, fileName],
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
                media_url: mediaUrl,
                media_type: mediaType,
                file_name: fileName,
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
              media_url: mediaUrl,
              media_type: mediaType,
              file_name: fileName,
            });

            // Process chatbot
            const {
              processChatbotMessage,
            } = require("../services/chatbotService");

            try {
              const chatbotInput = msg.interactive?.button_reply?.id || text;
              const chatbotResult = await processChatbotMessage(
                contactId,
                chatbotInput,
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
const { WHATSAPP_TOKEN, API_VERSION } = await getWhatsAppConfig();

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