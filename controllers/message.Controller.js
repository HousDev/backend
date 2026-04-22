// const Message = require("../models/message.Model");
// const Contact = require("../models/contact.Model");
// const Template = require("../models/template.Model");
// const {
//   sendTextMessage,
//   sendTemplateMessage,
// } = require("../integrations/whatsapp");
// const { triggerAutomation } = require("../services/automationEngine");

// exports.sendMessage = async (req, res) => {
//   const { contact_id, text, is_note, template_id } = req.body;
//   const contact = await Contact.findById(contact_id);
//   if (!contact) return res.status(404).json({ error: "Contact not found" });

//   let finalText = text;
//   let whatsappMsgId = null;

//   if (!is_note) {
//     if (template_id) {
//       const template = await Template.findById(template_id);
//       if (!template || template.status !== "approved")
//         return res.status(400).json({ error: "Template not approved" });
//       finalText = template.body.replace(/{{1}}/g, contact.name);
//       whatsappMsgId = await sendTemplateMessage(
//         contact.phone,
//         template.name,
//         template.language,
//       );
//       await Template.incrementUsage(template_id);
//     } else {
//       whatsappMsgId = await sendTextMessage(contact.phone, text);
//     }
//   }

//   await Message.create({
//     contact_id,
//     direction: is_note ? "note" : "out",
//     text: finalText,
//     whatsapp_msg_id: whatsappMsgId,
//   });
//   await Message.updateLastMessage(contact_id, finalText);
//   if (!is_note) await triggerAutomation(contact_id, finalText);
//   res.json({ success: true, messageId: whatsappMsgId });
// };

// exports.getMessages = async (req, res) => {
//   const messages = await Message.findByContact(req.params.contact_id);
//   res.json(messages);
// };
const Message = require("../models/message.Model");
const Contact = require("../models/contact.Model");
const { sendTextMessage } = require("../integrations/whatsapp");
const { triggerAutomation } = require("../services/automationEngine");
const { emitToUser } = require("../utils/socket"); // path adjust karo
exports.sendMessage = async (req, res) => {
  try {
    const { contact_id, text, is_note } = req.body;
    const contact = await Contact.findById(contact_id);

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    let finalText = text;
    let whatsappMsgId = null;

    if (!is_note) {
      // Send actual WhatsApp message
      whatsappMsgId = await sendTextMessage(contact.phone, text);
    }

    // Save message to database
    const messageId = await Message.create({
      contact_id,
      direction: is_note ? "note" : "out",
      text: finalText,
      whatsapp_msg_id: whatsappMsgId,
    });

    // Update last message in contact
    if (!is_note) {
      await Message.updateLastMessage(contact_id, finalText);
      await triggerAutomation(contact_id, finalText);
        // 🔥 ADD THIS (REALTIME EMIT)
  emitToUser(contact.assigned_to, "chat_update", {
    contact_id,
    text: finalText,
  });
    }

    // Return response compatible with frontend
    res.json({
      id: messageId,
      contact_id: contact_id,
      conversation_id: `conv_${contact_id}`,
      direction: "out",
      message_type: "text",
      body: finalText,
      text: finalText,
      timestamp: new Date().toISOString(),
      status: "sent",
      sender: { name: "You" },
    });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const messages = await Message.findByContact(req.params.contact_id);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};