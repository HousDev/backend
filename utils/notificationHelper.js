const NotificationModel = require("../models/clientLeadNotificationModal");

function emitToUser(userId, event, payload) {
  if (!global.io) {
    console.warn("⚠️ Socket.IO global.io instance not initialized");
    return;
  }
  global.io.to(`user:${userId}`).emit(event, payload);
  console.log(`🔌 Emitted socket event "${event}" to user:${userId}`);
}

async function sendAssignmentNotification({ userId, type, itemId, itemName, message, link }) {
  if (!userId) return;

  try {
    // If not a lead assignment, link it to the system dummy lead to satisfy DB foreign key constraint
    const leadId = type === "lead_assign" ? itemId : "00000000-0000-0000-0000-000000000000";
    let id = null;

    try {
      id = await NotificationModel.create({
        leadId,
        userId,
        message,
        type,
        link
      });
    } catch (dbErr) {
      console.error("❌ Database insertion failed for notification:", dbErr.message);
    }

    emitToUser(userId, "notification:new", {
      id: id || Date.now(),
      lead_id: leadId,
      user_id: userId,
      message,
      type,
      link,
      is_read: 0,
      created_at: new Date().toISOString()
    });

    console.log(`🔔 Notification processed and pushed to user:${userId} for ${type} (Item ID: ${itemId})`);
  } catch (err) {
    console.error("❌ Error sending assignment notification:", err);
  }
}

module.exports = {
  sendAssignmentNotification,
  emitToUser
};
