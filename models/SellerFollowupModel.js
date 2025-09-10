const pool = require("../config/database");

const SellerFollowupModel = {
  async create(data) {
    const sql = `
      INSERT INTO seller_followups
      (seller_id, followup_date, followup_type, followup_time, status, priority, assigned_to, reminder, notes)
      VALUES (?,?,?,?,?,?,?,?,?)
    `;
    const params = [
      data.seller_id, data.followup_date, data.followup_type, data.followup_time,
      data.status, data.priority, data.assigned_to, !!data.reminder, data.notes
    ];
    const [rs] = await pool.query(sql, params);
    return rs.insertId;
  },

  async listBySeller(sellerId) {
    const [rows] = await pool.query(
      `SELECT * FROM seller_followups WHERE seller_id = ? ORDER BY id DESC`,
      [sellerId]
    );
    return rows;
  },

  async get(id) {
    const [rows] = await pool.query(`SELECT * FROM seller_followups WHERE id = ?`, [id]);
    return rows[0];
  },

  async update(id, data) {
    const sql = `
      UPDATE seller_followups SET
        followup_date=?, followup_type=?, followup_time=?, status=?, priority=?,
        assigned_to=?, reminder=?, notes=?
      WHERE id=?
    `;
    const params = [
      data.followup_date, data.followup_type, data.followup_time, data.status, data.priority,
      data.assigned_to, !!data.reminder, data.notes, id
    ];
    const [rs] = await pool.query(sql, params);
    return rs.affectedRows;
  },

  async remove(id) {
    const [rs] = await pool.query(`DELETE FROM seller_followups WHERE id = ?`, [id]);
    return rs.affectedRows;
  }
};

module.exports = SellerFollowupModel;
