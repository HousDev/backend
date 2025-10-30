const db = require("../config/database"); // mysql2/promise pool instance

// ✅ Create Notification
exports.create = async ({ leadId, userId, message, type, link }) => {
  const [result] = await db.query(
    `INSERT INTO client_lead_notification 
      (lead_id, user_id, message, type, link) 
     VALUES (?, ?, ?, ?, ?)`,
    [leadId, userId, message, type || "lead_assign", link || `/leads/${leadId}`]
  );
  return result.insertId; // naya notification ka id return kare
};

exports.getByUserId = async (userId) => {
  const [rows] = await db.query(
    `SELECT 
        n.id,
        n.lead_id,
        n.user_id,     -- ✅ Add this line
        n.message,
        n.type,
        n.link,
        n.is_read,
        n.created_at,
        n.updated_at,
        l.name AS lead_name
     FROM client_lead_notification n
     LEFT JOIN client_leads l ON n.lead_id = l.id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC`,
    [userId]
  );
  return rows;
};



// ✅ Mark Notification as Read
exports.markAsRead = async (id) => {
  const [result] = await db.query(
    `UPDATE client_lead_notification 
     SET is_read = TRUE 
     WHERE id = ?`,
    [id]
  );
  return result.affectedRows; // kitne rows update huye
};


// ✅ Upsert Notification (unique per leadId + type)
exports.upsert = async ({ leadId, userId, message, type, link }) => {
  type = type || "lead_assign";
  link = link || `/leads/${leadId}`;

  // 1️⃣ Check if notification exists for this lead + type
  const [existing] = await db.query(
    `SELECT id FROM client_lead_notification 
     WHERE lead_id = ? AND type = ? 
     LIMIT 1`,
    [leadId, type]
  );

  if (existing.length > 0) {
    const notificationId = existing[0].id;

    // 2️⃣ Update existing notification (change user_id + message)
    await db.query(
      `UPDATE client_lead_notification
       SET 
         user_id = ?, 
         message = ?, 
         link    = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [userId, message, link, notificationId]
    );

    return { action: "updated", id: notificationId };
  }

  // 3️⃣ If not found, create new
  const [insertResult] = await db.query(
    `INSERT INTO client_lead_notification (lead_id, user_id, message, type, link)
     VALUES (?, ?, ?, ?, ?)`,
    [leadId, userId, message, type, link]
  );

  return { action: "created", id: insertResult.insertId };
};


// ✅ Mark All Notifications as Read (for a specific user)
exports.markAllAsRead = async (userId) => {
  const [result] = await db.query(
    `UPDATE client_lead_notification 
     SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP 
     WHERE user_id = ? AND is_read = FALSE`,
    [userId]
  );
  return result.affectedRows; // number of notifications updated
};

exports.getById = async (id) => {
  const [rows] = await db.query(`SELECT * FROM client_lead_notification WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
};

/** ✅ Delete by ID (single row) */
exports.deleteById = async (id) => {
  const [result] = await db.query(
    `DELETE FROM client_lead_notification WHERE id = ? LIMIT 1`,
    [id]
  );
  return result.affectedRows; // 0 ya 1
};

/** ✅ (Optional) Delete ALL for a user (use carefully) */
exports.deleteAllByUserId = async (userId) => {
  const [result] = await db.query(
    `DELETE FROM client_lead_notification WHERE user_id = ?`,
    [userId]
  );
  return result.affectedRows; // deleted count
};

/** ✅ (Optional) Delete only READ items for a user */
exports.deleteReadByUserId = async (userId) => {
  const [result] = await db.query(
    `DELETE FROM client_lead_notification WHERE user_id = ? AND is_read = TRUE`,
    [userId]
  );
  return result.affectedRows; // deleted count
};