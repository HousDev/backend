const NotificationModel = require("../models/clientLeadNotificationModal");

// ✅ Create Notification
exports.createNotification = async (req, res) => {
  try {
    const { leadId, userId, message, type, link } = req.body;
    console.log("first",req.body)

    if (!userId) {
      return res.status(400).json({ success: false, message: "User not assigned" });
    }

    await NotificationModel.create({ leadId, userId, message, type, link });

    res.json({ success: true, message: "Notification created successfully" });
  } catch (err) {
    console.error("❌ Error creating notification:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Get Notifications for a User
exports.getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;

    const rows = await NotificationModel.getByUserId(userId);

    res.json({ success: true, notifications: rows });
  } catch (err) {
    console.error("❌ Error fetching notifications:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ✅ Mark Notification as Read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    await NotificationModel.markAsRead(id);

    res.json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    console.error("❌ Error marking notification as read:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


exports.upsertNotification = async (req, res) => {
  try {
    const { leadId, userId, message, type, link } = req.body;

    if (!leadId || !userId) {
      return res.status(400).json({
        success: false,
        message: "leadId and userId are required",
      });
    }

    const result = await NotificationModel.upsert({
      leadId,
      userId,
      message,
      type,
      link,
    });

    res.json({
      success: true,
      message: `Notification ${result.action} successfully`,
      id: result.id,
    });
  } catch (err) {
    console.error("❌ Error upserting notification:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ✅ Mark All Notifications as Read
exports.markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.params;

    const updatedCount = await NotificationModel.markAllAsRead(userId);

    res.json({
      success: true,
      message: `${updatedCount} notifications marked as read`,
    });
  } catch (err) {
    console.error("❌ Error marking all notifications as read:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


