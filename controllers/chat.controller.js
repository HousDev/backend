// backend/controllers/chat.controller.js
const ChatModel = require("../models/chat.model");
const db = require("../config/database");

/**
 * Helper: Determine sender type and permissions from role
 */
function getRoleInfo(role) {
  const normalized = String(role || "").toLowerCase().trim();
  const isAdmin = ["admin", "super_admin"].includes(normalized);
  const isExecutive = ["executive", "agent", "team leader", "manager"].includes(normalized);

  let senderType = "user";
  if (isAdmin) senderType = "admin";
  else if (isExecutive) senderType = "executive";

  return { isAdmin, isExecutive, senderType };
}

/**
 * POST /api/chat/conversations
 * Create a new conversation or return an existing active/reopened one
 */
exports.createOrGetConversation = async (req, res) => {
  try {
    const userId = req.userId;
    const { property_id, lead_id, initial_message, initial_message_uuid } = req.body;

    if (!property_id) {
      return res.status(400).json({
        success: false,
        message: "property_id is required",
      });
    }

    // 1. Validate property in my_properties
    const [propRows] = await db.execute(
      `SELECT id, title, slug, assigned_to, final_price, location_name, society_name
       FROM my_properties
       WHERE id = ?
       LIMIT 1`,
      [property_id]
    );

    if (!propRows || propRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    const property = propRows[0];

    // Determine initial executive from property.assigned_to
    let executiveId = property.assigned_to;
    if (!executiveId) {
      // Fallback: Find an active admin/executive or default to 1
      const [execRows] = await db.execute(
        `SELECT id FROM users WHERE role IN ('executive', 'admin', 'agent') AND is_active = 1 LIMIT 1`
      );
      executiveId = execRows.length > 0 ? execRows[0].id : 1;
    }

    // 2. Search for existing conversation for this user + property
    const existingConv = await ChatModel.findByUserAndProperty(userId, property_id);

    if (existingConv) {
      if (existingConv.status === "active") {
        return res.status(200).json({
          success: true,
          isNew: false,
          conversation: existingConv,
        });
      }

      if (existingConv.status === "closed") {
        const { senderType } = getRoleInfo(req.userRole);
        const reopened = await ChatModel.reopenConversation(existingConv.id, userId, senderType);

        // Notify room if socket is available
        if (global.io) {
          global.io.to(`conversation:${existingConv.id}`).emit("chat:conversation_reopened", {
            conversationId: existingConv.id,
            reopenedBy: userId,
          });
        }

        return res.status(200).json({
          success: true,
          isNew: false,
          reopened: true,
          conversation: reopened,
        });
      }
    }

    // 3. Create new conversation
    const { senderType } = getRoleInfo(req.userRole);
    const newConv = await ChatModel.createConversation({
      userId,
      propertyId: property.id,
      executiveId,
      leadId: lead_id || null,
      initialMessage: initial_message || null,
      initialMessageUuid: initial_message_uuid || null,
      senderType,
    });

    // Notify executive via Socket.IO if initial message was sent
    if (global.io && initial_message) {
      global.io.to(`user:${executiveId}`).emit("chat:unread_count_update", {
        conversationId: newConv.id,
        unreadCount: newConv.unread_executive_count,
      });
    }

    return res.status(201).json({
      success: true,
      isNew: true,
      conversation: newConv,
    });
  } catch (error) {
    console.error("Error in createOrGetConversation:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create or retrieve conversation",
    });
  }
};

/**
 * GET /api/chat/conversations
 * List conversations scoped strictly to user role
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.userId;
    const { isAdmin, isExecutive } = getRoleInfo(req.userRole);
    const { executive_id, property_id, user_id, status, limit, offset } = req.query;

    let conversations = [];

    if (isAdmin) {
      conversations = await ChatModel.listConversations({
        isAdmin: true,
        executiveId: executive_id || null,
        propertyId: property_id || null,
        targetUserId: user_id || null,
        status: status || null,
        limit,
        offset,
      });
    } else if (isExecutive) {
      conversations = await ChatModel.listConversations({
        isAdmin: false,
        executiveId: userId,
        status: status || null,
        limit,
        offset,
      });
    } else {
      // Normal user (buyer, seller, etc.)
      conversations = await ChatModel.listConversations({
        isAdmin: false,
        userId: userId,
        status: status || null,
        limit,
        offset,
      });
    }

    return res.status(200).json({
      success: true,
      count: conversations.length,
      conversations,
    });
  } catch (error) {
    console.error("Error in getConversations:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve conversations",
    });
  }
};

/**
 * GET /api/chat/conversations/:conversationId
 * Retrieve single conversation with strict IDOR verification
 */
exports.getConversationById = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const { isAdmin } = getRoleInfo(req.userRole);

    const conversation = await ChatModel.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // Access control: User must be conversation owner, assigned executive, or admin
    const isOwner = Number(conversation.user_id) === Number(userId);
    const isAssignedExecutive = Number(conversation.executive_id) === Number(userId);

    if (!isAdmin && !isOwner && !isAssignedExecutive) {
      return res.status(403).json({
        success: false,
        message: "Access forbidden: You do not have permission to view this conversation",
      });
    }

    return res.status(200).json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("Error in getConversationById:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve conversation",
    });
  }
};

/**
 * GET /api/chat/conversations/:conversationId/messages
 * Retrieve messages for a conversation with pagination
 */
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const { isAdmin } = getRoleInfo(req.userRole);
    const { limit, beforeId } = req.query;

    const conversation = await ChatModel.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const isOwner = Number(conversation.user_id) === Number(userId);
    const isAssignedExecutive = Number(conversation.executive_id) === Number(userId);

    if (!isAdmin && !isOwner && !isAssignedExecutive) {
      return res.status(403).json({
        success: false,
        message: "Access forbidden: You do not have permission to view these messages",
      });
    }

    const messages = await ChatModel.getMessages(conversation.id, {
      limit: limit ? parseInt(limit, 10) : 50,
      beforeId: beforeId ? parseInt(beforeId, 10) : null,
    });

    return res.status(200).json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (error) {
    console.error("Error in getMessages:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve messages",
    });
  }
};

/**
 * POST /api/chat/conversations/:conversationId/messages
 * Send message with server-determined sender identity, idempotency, and Socket emission
 */
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const { isAdmin, senderType } = getRoleInfo(req.userRole);
    const { message_text, message_type = "text", message_uuid, metadata_json } = req.body;

    // Validate message_text
    if (!message_text || typeof message_text !== "string" || !message_text.trim()) {
      return res.status(400).json({
        success: false,
        message: "message_text is required and cannot be empty",
      });
    }

    if (message_text.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Message exceeds maximum length of 5000 characters",
      });
    }

    const conversation = await ChatModel.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // Access control
    const isOwner = Number(conversation.user_id) === Number(userId);
    const isAssignedExecutive = Number(conversation.executive_id) === Number(userId);

    if (!isAdmin && !isOwner && !isAssignedExecutive) {
      return res.status(403).json({
        success: false,
        message: "Access forbidden: You do not have permission to send messages in this conversation",
      });
    }

    // Create message with idempotency
    const { message, isDuplicate } = await ChatModel.createMessage({
      conversationId: conversation.id,
      senderId: userId, // NEVER trust body sender_id
      senderType,
      messageType: message_type || "text",
      messageText: message_text,
      metadataJson: metadata_json || null,
      messageUuid: message_uuid || null,
    });

    // Real-time broadcast if not a duplicate
    if (!isDuplicate && global.io) {
      // 1. Emit to conversation room
      global.io.to(`conversation:${conversation.id}`).emit("chat:new_message", message);

      // 2. Emit unread update to the recipient's user room
      if (senderType === "user") {
        global.io.to(`user:${conversation.executive_id}`).emit("chat:unread_count_update", {
          conversationId: conversation.id,
          unreadCount: (conversation.unread_executive_count || 0) + 1,
        });
      } else {
        global.io.to(`user:${conversation.user_id}`).emit("chat:unread_count_update", {
          conversationId: conversation.id,
          unreadCount: (conversation.unread_user_count || 0) + 1,
        });
      }
    }

    return res.status(isDuplicate ? 200 : 201).json({
      success: true,
      isDuplicate,
      message,
    });
  } catch (error) {
    console.error("Error in sendMessage:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};

/**
 * POST /api/chat/conversations/:conversationId/read
 * Mark messages as read and reset unread count
 */
exports.markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const { isAdmin } = getRoleInfo(req.userRole);

    const conversation = await ChatModel.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const isOwner = Number(conversation.user_id) === Number(userId);
    const isAssignedExecutive = Number(conversation.executive_id) === Number(userId);

    if (!isAdmin && !isOwner && !isAssignedExecutive) {
      return res.status(403).json({
        success: false,
        message: "Access forbidden: You cannot mark this conversation as read",
      });
    }

    const result = await ChatModel.markMessagesAsRead(conversation.id, userId, req.userRole);

    // Notify room of read event
    if (global.io) {
      global.io.to(`conversation:${conversation.id}`).emit("chat:messages_read", {
        conversationId: conversation.id,
        readBy: userId,
        readAt: new Date().toISOString(),
      });
      global.io.to(`user:${userId}`).emit("chat:unread_count_update", {
        conversationId: conversation.id,
        unreadCount: 0,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Messages marked as read",
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error("Error in markAsRead:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark messages as read",
    });
  }
};

/**
 * POST /api/chat/conversations/:conversationId/reassign
 * Reassign conversation to another executive (admin / manager only)
 */
exports.reassignExecutive = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { executive_id } = req.body;
    const { isAdmin } = getRoleInfo(req.userRole);
    const isManagerRole = ["manager", "team leader"].includes(String(req.userRole || "").toLowerCase());

    if (!isAdmin && !isManagerRole) {
      return res.status(403).json({
        success: false,
        message: "Access forbidden: Only managers or administrators can reassign conversations",
      });
    }

    if (!executive_id) {
      return res.status(400).json({
        success: false,
        message: "executive_id is required",
      });
    }

    const conversation = await ChatModel.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // Verify target executive exists and is active
    const [execRows] = await db.execute(
      `SELECT id, first_name, last_name, role, is_active FROM users WHERE id = ? LIMIT 1`,
      [executive_id]
    );

    if (!execRows || execRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Target executive user not found",
      });
    }

    const targetExec = execRows[0];
    if (!targetExec.is_active) {
      return res.status(400).json({
        success: false,
        message: "Target executive account is inactive",
      });
    }

    const oldExecutiveId = conversation.executive_id;
    const execFullName = `${targetExec.first_name || ""} ${targetExec.last_name || ""}`.trim() || targetExec.role;

    const updatedConv = await ChatModel.reassignExecutive(
      conversation.id,
      targetExec.id,
      req.userId,
      execFullName
    );

    // Socket notification
    if (global.io) {
      global.io.to(`conversation:${conversation.id}`).emit("conversation:reassigned", {
        conversationId: conversation.id,
        oldExecutiveId,
        newExecutiveId: targetExec.id,
        executiveName: execFullName,
      });

      global.io.to(`user:${oldExecutiveId}`).emit("conversation:reassigned", {
        conversationId: conversation.id,
        newExecutiveId: targetExec.id,
      });

      global.io.to(`user:${targetExec.id}`).emit("conversation:reassigned", {
        conversationId: conversation.id,
        newExecutiveId: targetExec.id,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Conversation reassigned to ${execFullName}`,
      conversation: updatedConv,
    });
  } catch (error) {
    console.error("Error in reassignExecutive:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reassign conversation",
    });
  }
};
