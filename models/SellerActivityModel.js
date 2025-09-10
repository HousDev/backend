const pool = require("../config/database");

const SellerActivityModel = {
  async create(data) {
    const sql = `
      INSERT INTO seller_activities
      (seller_id, activity_type, description, activity_date, activity_time, stage, duration, outcome, next_action, executed_by, remarks)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `;
    const params = [
      data.seller_id, data.activity_type, data.description, data.activity_date,
      data.activity_time, data.stage, data.duration, data.outcome, data.next_action,
      data.executed_by, data.remarks
    ];
    const [rs] = await pool.query(sql, params);
    return rs.insertId;
  },

  async listBySeller(sellerId) {
    const [rows] = await pool.query(
      `SELECT * FROM seller_activities WHERE seller_id = ? ORDER BY id DESC`,
      [sellerId]
    );
    return rows;
  },

  async get(id) {
    const [rows] = await pool.query(`SELECT * FROM seller_activities WHERE id = ?`, [id]);
    return rows[0];
  },

  async update(id, data) {
    const sql = `
      UPDATE seller_activities SET
        activity_type=?, description=?, activity_date=?, activity_time=?, stage=?, duration=?,
        outcome=?, next_action=?, executed_by=?, remarks=?
      WHERE id=?
    `;
    const params = [
      data.activity_type, data.description, data.activity_date, data.activity_time, data.stage,
      data.duration, data.outcome, data.next_action, data.executed_by, data.remarks, id
    ];
    const [rs] = await pool.query(sql, params);
    return rs.affectedRows;
  },

  async remove(id) {
    const [rs] = await pool.query(`DELETE FROM seller_activities WHERE id = ?`, [id]);
    return rs.affectedRows;
  }
};

module.exports = SellerActivityModel;
