const db = require("../config/database");

const Broadcast = {
  findAll: async () => {
    const [rows] = await db.query(`
            SELECT b.*, t.name as template_name 
            FROM broadcasts b JOIN templates t ON b.template_id = t.id 
            ORDER BY b.created_at DESC
        `);
    return rows;
  },
  create: async (data) => {
    const {
      name,
      template_id,
      segment,
      scheduled_date,
      scheduled_time,
      status,
    } = data;
    const [result] = await db.query(
      "INSERT INTO broadcasts (name, template_id, segment, scheduled_date, scheduled_time, status) VALUES (?, ?, ?, ?, ?, ?)",
      [
        name,
        template_id,
        segment,
        scheduled_date,
        scheduled_time,
        status || "scheduled",
      ],
    );
    return result.insertId;
  },
  updateStatus: async (id, status, sent_count = null) => {
    if (sent_count !== null) {
      await db.query(
        "UPDATE broadcasts SET status = ?, sent_count = ? WHERE id = ?",
        [status, sent_count, id],
      );
    } else {
      await db.query("UPDATE broadcasts SET status = ? WHERE id = ?", [
        status,
        id,
      ]);
    }
  },
  getPendingScheduled: async () => {
    const [rows] = await db.query(
      'SELECT * FROM broadcasts WHERE status = "scheduled" AND scheduled_date >= CURDATE()',
    );
    return rows;
  },
};

module.exports = Broadcast;
