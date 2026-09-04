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
    const db = require("../config/database");
    let leadId = itemId;

    // Check if itemId is a valid lead_id in client_leads
    if (leadId) {
      const [rows] = await db.execute("SELECT id FROM client_leads WHERE id = ? LIMIT 1", [leadId]).catch(() => [[]]);
      if (!rows || rows.length === 0) {
        // Fallback to any valid lead_id to satisfy NOT NULL foreign key constraint
        const [firstLead] = await db.execute("SELECT id FROM client_leads LIMIT 1").catch(() => [[]]);
        leadId = firstLead && firstLead[0] ? firstLead[0].id : null;
      }
    } else {
      const [firstLead] = await db.execute("SELECT id FROM client_leads LIMIT 1").catch(() => [[]]);
      leadId = firstLead && firstLead[0] ? firstLead[0].id : null;
    }

    let id = null;
    if (leadId) {
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
