

const NotificationModel = require("../models/clientLeadNotificationModal");
const { emitToUser } = require("../utils/socket"); // <<< add

// ✅ Create Notification
exports.createNotification = async (req, res) => {
  try {
    const { leadId, userId, message, type, link } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User not assigned" });
    }

    const id = await NotificationModel.create({ leadId, userId, message, type, link });

    // 🔔 realtime push to that user
    emitToUser(userId, "notification:new", {
      id,
      lead_id: leadId,
      user_id: userId,
      message,
      type: type || "lead_assign",
      link: link || `/leads/${leadId}`,
      is_read: 0,
      created_at: new Date().toISOString(),
    });

    res.json({ success: true, message: "Notification created successfully", id });
  } catch (err) {
    console.error("❌ Error creating notification:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Get Notifications for a User (no emit needed)
exports.getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const rows = await NotificationModel.getByUserId(userId);

    const notifications = (Array.isArray(rows) ? rows : []).map((r) => {
      const id = r.id ?? r.notification_id ?? r._id ?? null;
      const lead_id = r.lead_id ?? r.leadId ?? r.lead ?? null;
      const user_id = r.user_id ?? r.userId ?? r.to_user ?? null;
      const message = r.message ?? r.msg ?? r.description ?? "";
      const type = r.type ?? r.notification_type ?? "general";
      const link = r.link ?? r.url ?? null;
      const is_read = r.is_read === 1 || r.is_read === true || r.read === 1 || r.read === true ? 1 : 0;

      const toIso = (raw) => {
        if (!raw) return null;
        if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
        if (typeof raw === "number") return new Date(raw).toISOString();
        if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
          const d = new Date(raw.replace(" ", "T"));
          if (!Number.isNaN(d.getTime())) return d.toISOString();
        }
        const parsed = new Date(raw);
        return !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
      };

      return {
        id,
        lead_id,
        user_id,
        message,
        type,
        link,
        is_read,
        created_at: toIso(r.created_at ?? r.createdAt ?? r.created ?? null),
        updated_at: toIso(r.updated_at ?? r.updatedAt ?? r.updated ?? null),
      };
    });

    res.json({ success: true, notifications });
  } catch (err) {
    console.error("❌ Error fetching notifications:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Mark Notification as Read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await NotificationModel.getById?.(id); // optional helper; agar nahi hai to userId body/query se bhej dein
    await NotificationModel.markAsRead(id);

    // 🔔 realtime: notify that user's bell to update
    const userId = row?.user_id ?? req.body?.userId ?? req.query?.userId;
    if (userId) {
      emitToUser(userId, "notification:read", { id, is_read: 1, updated_at: new Date().toISOString() });
    }

    res.json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    console.error("❌ Error marking notification as read:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Upsert Notification
exports.upsertNotification = async (req, res) => {
  try {
    const { leadId, userId, message, type, link } = req.body;
    if (!leadId || !userId) {
      return res.status(400).json({ success: false, message: "leadId and userId are required" });
    }

    const result = await NotificationModel.upsert({ leadId, userId, message, type, link });

    // 🔔 realtime: either created or updated
    emitToUser(userId, `notification:${result.action}`, {
      id: result.id,
      lead_id: leadId,
      user_id: userId,
      message,
      type: type || "lead_assign",
      link: link || `/leads/${leadId}`,
      is_read: 0,
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true, message: `Notification ${result.action} successfully`, id: result.id });
  } catch (err) {
    console.error("❌ Error upserting notification:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Mark All as Read
exports.markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.params;
    const updatedCount = await NotificationModel.markAllAsRead(userId);

    // 🔔 realtime: bulk read for that user
    emitToUser(userId, "notification:readAll", {
      user_id: userId,
      updated_count: updatedCount,
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true, message: `${updatedCount} notifications marked as read` });
  } catch (err) {
    console.error("❌ Error marking all notifications as read:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/** ✅ DELETE /:id — single notification */
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const affected = await NotificationModel.deleteById(id);

    if (!affected) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    // (optional) userId pass kara ho to realtime emit kar do
    // const userId = req.query.userId || req.body?.userId;
    // if (userId) emitToUser(userId, "notification:deleted", { id: Number(id) });

    res.json({ success: true, message: "Notification deleted", id: Number(id) });
  } catch (err) {
    console.error("❌ Error deleting notification:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** ✅ (Optional) DELETE /user/:userId/all — delete all for a user */
exports.deleteAllForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await NotificationModel.deleteAllByUserId(userId);

    // (optional) emitToUser(userId, "notification:deletedAll", { count });

    res.json({ success: true, message: `Deleted ${count} notifications`, count });
  } catch (err) {
    console.error("❌ Error deleting all notifications:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** ✅ (Optional) DELETE /user/:userId/read — delete only read ones */
exports.deleteReadForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await NotificationModel.deleteReadByUserId(userId);

    // (optional) emitToUser(userId, "notification:deletedRead", { count });

    res.json({ success: true, message: `Deleted ${count} read notifications`, count });
  } catch (err) {
    console.error("❌ Error deleting read notifications:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};