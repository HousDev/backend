const Message = require("../models/message.Model");
const Contact = require("../models/contact.Model");
const { sendTextMessage } = require("../integrations/whatsapp");
const { triggerAutomation } = require("../services/automationEngine");
const { emitToUser, emitToContactRoom } = require("../utils/socket");
const db = require("../config/database");

// Send message
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
      whatsappMsgId = await sendTextMessage(contact.phone, text);
    }

    const messageId = await Message.create({
      contact_id,
      direction: is_note ? "note" : "out",
      text: finalText,
      whatsapp_msg_id: whatsappMsgId,
    });

    if (!is_note) {
      await Message.updateLastMessage(contact_id, finalText);
      await triggerAutomation(contact_id, finalText);

      // ✅ Emit to assigned user
      if (contact.assigned_to) {
        emitToUser(contact.assigned_to, "chat_update", {
          contact_id,
          text: finalText,
          direction: "out",
          timestamp: new Date().toISOString(),
        });
      }

      // ✅ Emit to contact room for real-time updates - ADD isOwnMessage
      emitToContactRoom(contact_id, "chat_update", {
        contact_id,
        text: finalText,
        direction: "out",
        timestamp: new Date().toISOString(),
        isOwnMessage: true, // ✅ ADD THIS LINE
      });
    }

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

// Get messages and mark as read
exports.getMessages = async (req, res) => {
  try {
    const { contact_id } = req.params;

    const messages = await Message.findByContact(contact_id);

    // Mark all incoming messages as read
    await db.query(
      `UPDATE messages_wa 
       SET is_read = 1 
       WHERE contact_id = ? AND direction = 'in' AND is_read = 0`,
      [contact_id],
    );

    res.json(messages);
  } catch (err) {
    console.error("Error in getMessages:", err);
    res.status(500).json({ error: err.message });
  }
};

// Mark messages as read
exports.markAsRead = async (req, res) => {
  try {
    const { contact_id } = req.params;

    const [result] = await db.query(
      `UPDATE messages_wa 
       SET is_read = 1 
       WHERE contact_id = ? AND direction = 'in' AND is_read = 0`,
      [contact_id],
    );

    console.log(
      `✅ Marked ${result.affectedRows} messages as read for contact ${contact_id}`,
    );

    res.json({ success: true, message: "Messages marked as read" });
  } catch (err) {
    console.error("Error in markAsRead:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const { contact_id } = req.params;

    const [result] = await db.query(
      `SELECT COUNT(*) as unread_count 
       FROM messages_wa 
       WHERE contact_id = ? AND direction = 'in' AND is_read = 0`,
      [contact_id],
    );

    res.json({ unread_count: result[0]?.unread_count || 0 });
  } catch (err) {
    console.error("Error in getUnreadCount:", err);
    res.status(500).json({ error: err.message });
  }
};