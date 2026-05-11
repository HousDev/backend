

// const Message = require("../models/message.Model");
// const Contact = require("../models/contact.Model");
// const { sendTextMessage } = require("../integrations/whatsapp");
// const { triggerAutomation } = require("../services/automationEngine");
// const { emitToUser, emitToContactRoom } = require("../utils/socket");
// const db = require("../config/database");

// // Send message
// exports.sendMessage = async (req, res) => {
//   try {
//     const { contact_id, text, is_note } = req.body;
//     const contact = await Contact.findById(contact_id);

//     if (!contact) {
//       return res.status(404).json({ error: "Contact not found" });
//     }

//     let finalText = text;
//     let whatsappMsgId = null;

//     if (!is_note) {
//       whatsappMsgId = await sendTextMessage(contact.phone, text);
//     }

//     const messageId = await Message.create({
//       contact_id,
//       direction: is_note ? "note" : "out",
//       text: finalText,
//       whatsapp_msg_id: whatsappMsgId,
//     });

//     if (!is_note) {
//       await Message.updateLastMessage(contact_id, finalText);
//       await triggerAutomation(contact_id, finalText);

//       // ✅ Emit to assigned user
//       if (contact.assigned_to) {
//         emitToUser(contact.assigned_to, "chat_update", {
//           contact_id,
//           text: finalText,
//           direction: "out",
//           timestamp: new Date().toISOString(),
//         });
//       }

//       // ✅ Emit to contact room for real-time updates - ADD isOwnMessage
//       emitToContactRoom(contact_id, "chat_update", {
//         contact_id,
//         text: finalText,
//         direction: "out",
//         timestamp: new Date().toISOString(),
//         isOwnMessage: true, // ✅ ADD THIS LINE
//       });
//     }

//     res.json({
//       id: messageId,
//       contact_id: contact_id,
//       conversation_id: `conv_${contact_id}`,
//       direction: "out",
//       message_type: "text",
//       body: finalText,
//       text: finalText,
//       timestamp: new Date().toISOString(),
//       status: "sent",
//       sender: { name: "You" },
//     });
//   } catch (err) {
//     console.error("Send message error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Get messages and mark as read
// exports.getMessages = async (req, res) => {
//   try {
//     const { contact_id } = req.params;

//     const messages = await Message.findByContact(contact_id);

//     // Mark all incoming messages as read
//     await db.query(
//       `UPDATE messages_wa 
//        SET is_read = 1 
//        WHERE contact_id = ? AND direction = 'in' AND is_read = 0`,
//       [contact_id],
//     );

//     res.json(messages);
//   } catch (err) {
//     console.error("Error in getMessages:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Mark messages as read
// exports.markAsRead = async (req, res) => {
//   try {
//     const { contact_id } = req.params;

//     const [result] = await db.query(
//       `UPDATE messages_wa 
//        SET is_read = 1 
//        WHERE contact_id = ? AND direction = 'in' AND is_read = 0`,
//       [contact_id],
//     );

//     console.log(
//       `✅ Marked ${result.affectedRows} messages as read for contact ${contact_id}`,
//     );

//     res.json({ success: true, message: "Messages marked as read" });
//   } catch (err) {
//     console.error("Error in markAsRead:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Get unread count
// exports.getUnreadCount = async (req, res) => {
//   try {
//     const { contact_id } = req.params;

//     const [result] = await db.query(
//       `SELECT COUNT(*) as unread_count 
//        FROM messages_wa 
//        WHERE contact_id = ? AND direction = 'in' AND is_read = 0`,
//       [contact_id],
//     );

//     res.json({ unread_count: result[0]?.unread_count || 0 });
//   } catch (err) {
//     console.error("Error in getUnreadCount:", err);
//     res.status(500).json({ error: err.message });
//   }
// };




const Message = require("../models/message.Model");
const Contact = require("../models/contact.Model");
const { sendTextMessage } = require("../integrations/whatsapp");
const { triggerAutomation } = require("../services/automationEngine");
// const { emitToUser, emitToContactRoom } = require("../utils/socket");
const db = require("../config/database");
const path = require('path');
const { makeUploadTarget } = require('../middleware/upload');
const fs = require('fs');
// Add whatsapp media send function - import from your integration
const { sendMediaMessage } = require('../integrations/whatsapp');

function emitToUser(userId, event, payload) {
  if (!global.io) return;
  global.io.to(`user:${userId}`).emit(event, payload);
}

function emitToContactRoom(contactId, event, payload) {
  if (!global.io) return;
  global.io.to(`contact:${contactId}`).emit(event, payload);
}
// Send message
exports.sendMessage = async (req, res) => {
  try {
    const { contact_id, text, is_note, sender_name } = req.body;
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
      sender_name: sender_name || null,
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
exports.sendMedia = async (req, res) => {
  let filePath = null;
  
  try {
    const { contact_id, caption } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    filePath = file.path;

    const contact = await Contact.findById(contact_id);
    if (!contact) {
      // if (filePath && fs.existsSync(filePath)) {
      //   fs.unlinkSync(filePath);
      // }
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Send via WhatsApp API
    let whatsappMsgId = null;
    try {
      whatsappMsgId = await sendMediaMessage(
        contact.phone, 
        filePath, 
        file.mimetype, 
        caption || ''
      );
    } catch (whatsappError) {
      console.error('WhatsApp API error:', whatsappError);
      throw new Error(`Failed to send via WhatsApp: ${whatsappError.message}`);
    }

    // ✅ USE CAPTION INSTEAD OF PLACEHOLDER
    const messageText = caption && caption.trim() ? caption.trim() : `📎 ${file.originalname || 'Media file'}`;

   const messageId = await Message.create({
  contact_id,
  direction: 'out',
  text: messageText,
  whatsapp_msg_id: whatsappMsgId,
  media_url: file.publicUrl || null,   // ← ADD
  media_type: file.mimetype || null,   // ← ADD
  file_name: file.originalname || null,
  sender_name: req.body.sender_name || null, // ← ADD
});

    await Message.updateLastMessage(contact_id, messageText);

    // Clean up file
    // if (filePath && fs.existsSync(filePath)) {
    //   fs.unlinkSync(filePath);
    // }
    if (process.env.NODE_ENV === 'production' && filePath && fs.existsSync(filePath)) {
  fs.unlinkSync(filePath);
}

    // Emit socket update
    emitToContactRoom(contact_id, 'chat_update', {
      contact_id,
      text: messageText,
      direction: 'out',
      timestamp: new Date().toISOString(),
      isOwnMessage: true,
      media_url: file.publicUrl || null,
      media_type: file.mimetype,
    });

    res.json({
      id: messageId,
      direction: 'out',
      text: messageText,  // ← Return caption to frontend
      media_url: file.publicUrl || null,
      media_type: file.mimetype,
      file_name: file.originalname,
      status: 'sent',
      timestamp: new Date().toISOString(),
      sender: { name: req.body.sender_name || 'You' },
    });
    
  } catch (err) {
    console.error('Send media error:', err);
    
    // if (filePath && fs.existsSync(filePath)) {
    //   try {
    //     fs.unlinkSync(filePath);
    //   } catch (cleanupError) {
    //     console.error('Failed to cleanup file:', cleanupError);
    //   }
    // }
    if (process.env.NODE_ENV === 'production' && filePath && fs.existsSync(filePath)) {
  try {
    fs.unlinkSync(filePath);
  } catch (cleanupError) {
    console.error('Failed to cleanup file:', cleanupError);
  }
}
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

exports.sendLocation = async (req, res) => {
  try {
    const { contact_id, latitude, longitude, name, address, sender_name } = req.body;  // ← ADD sender_name
    const contact = await Contact.findById(contact_id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const axios = require('axios');
    const response = await axios.post(
      `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v23.0'}/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: contact.phone,
        type: 'location',
        location: {
          latitude,
          longitude,
          name: name || 'Location',
          address: address || ''
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const messageText = `📍 Location shared`;
    await Message.create({ 
      contact_id, 
      direction: 'out', 
      text: messageText, 
      whatsapp_msg_id: response.data.messages[0].id,
      sender_name: sender_name || null  // ← ADD THIS LINE
    });
    await Message.updateLastMessage(contact_id, messageText);

    res.json({ 
      success: true, 
      text: messageText,
      sender: { name: sender_name || 'You' }  // ← ADD THIS LINE
    });
  } catch (err) {
    console.error('Send location error:', err);
    res.status(500).json({ error: err.message });
  }
};