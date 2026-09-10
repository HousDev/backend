const NotificationModel = require("../models/clientLeadNotificationModal");

function emitToUser(userId, event, payload) {
  if (!global.io) {
    console.warn("⚠️ Socket.IO global.io instance not initialized");
    return;
  }
  global.io.to(`user:${userId}`).emit(event, payload);
}

async function sendAssignmentNotification({ userId, type, itemId, itemName, message, link }) {
  if (!userId) return;

  try {
    const db = require("../config/database");

    const [userRows] = await db.execute("SELECT id FROM users WHERE id = ? LIMIT 1", [userId]).catch(() => [[]]);
    if (!userRows || userRows.length === 0) {
      console.warn(`[Notification] Skipping notification for unknown userId=${userId}`);
      return;
    }

    let leadId = itemId;
    if (leadId) {
      const [leadRows] = await db.execute("SELECT id FROM client_leads WHERE id = ? LIMIT 1", [leadId]).catch(() => [[]]);
      if (!leadRows || leadRows.length === 0) {
        console.warn(`[Notification] Skipping notification for invalid leadId=${leadId} type=${type}`);
        return;
      }
    } else {
      console.warn(`[Notification] Skipping notification because itemId is missing type=${type}`);
      return;
    }

    let id = null;
    try {
      id = await NotificationModel.create({
        leadId,
        userId,
        message,
        type,
        link,
      });
    } catch (dbErr) {
      console.error("❌ Database insertion failed for notification:", dbErr.message);
      return;
    }

    emitToUser(userId, "notification:new", {
      id: id || Date.now(),
      lead_id: leadId,
      user_id: userId,
      message,
      type,
      link,
      is_read: 0,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Error sending assignment notification:", err);
  }
}

module.exports = {
  sendAssignmentNotification,
  emitToUser
};
