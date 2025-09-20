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

// controllers/notificationController.js (or wherever you have it)

// ✅ Get Notifications for a User
exports.getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;

    // fetch DB rows (your model)
    const rows = await NotificationModel.getByUserId(userId);

    // helpful debug in dev to inspect actual DB columns
    if (process.env.NODE_ENV !== "production") {
      console.debug("Notification rows raw:", JSON.stringify(rows?.slice?.(0, 20) ?? rows, null, 2));
    }

    // normalize each row into a stable shape the frontend expects
    const notifications = (Array.isArray(rows) ? rows : []).map((r) => {
      // try multiple possible column names to be robust
      const id = r.id ?? r.notification_id ?? r._id ?? null;
      const lead_id = r.lead_id ?? r.leadId ?? r.lead ?? null;
      const user_id = r.user_id ?? r.userId ?? r.to_user ?? null;
      const message = r.message ?? r.msg ?? r.description ?? "";
      const type = r.type ?? r.notification_type ?? "general";
      const link = r.link ?? r.url ?? null;
      const is_read = r.is_read === 1 || r.is_read === true || r.read === 1 || r.read === true ? 1 : 0;

      // Prefer DB created_at/updated_at variants and coerce to ISO string if present
      const createdRaw = r.created_at ?? r.createdAt ?? r.created ?? null;
      const updatedRaw = r.updated_at ?? r.updatedAt ?? r.updated ?? null;

      const toIso = (raw) => {
        if (!raw) return null;
        // If raw is already a Date object
        if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
        // If raw is a numeric timestamp
        if (typeof raw === "number") return new Date(raw).toISOString();
        // If raw is a string like "YYYY-MM-DD HH:mm:ss" convert the space to 'T' first
        if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
          const isoLike = raw.replace(" ", "T");
          const d = new Date(isoLike);
          if (!Number.isNaN(d.getTime())) return d.toISOString();
        }
        // try generic parse
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
        // fallback null if cannot parse
        return null;
      };

      return {
        id,
        lead_id,
        user_id,
        message,
        type,
        link,
        is_read,
        created_at: toIso(createdRaw),
        updated_at: toIso(updatedRaw),
        // include the raw DB row for debugging if needed (optional)
        // raw: r,
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


