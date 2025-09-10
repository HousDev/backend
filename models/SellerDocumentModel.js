const pool = require("../config/database");

const SellerDocumentModel = {
  async create(data) {
    const sql = `
      INSERT INTO seller_documents
      (seller_id, doc_type, doc_path, status, doc_date, category)
      VALUES (?,?,?,?,?,?)
    `;
    const params = [
      data.seller_id, data.doc_type, data.doc_path, data.status, data.doc_date, data.category
    ];
    const [rs] = await pool.query(sql, params);
    return rs.insertId;
  },

  async listBySeller(sellerId) {
    const [rows] = await pool.query(
      `SELECT * FROM seller_documents WHERE seller_id = ? ORDER BY id DESC`,
      [sellerId]
    );
    return rows;
  },

  async get(id) {
    const [rows] = await pool.query(`SELECT * FROM seller_documents WHERE id = ?`, [id]);
    return rows[0];
  },

  async update(id, data) {
    const sql = `
      UPDATE seller_documents SET
        doc_type=?, doc_path=?, status=?, doc_date=?, category=?
      WHERE id=?
    `;
    const params = [
      data.doc_type, data.doc_path, data.status, data.doc_date, data.category, id
    ];
    const [rs] = await pool.query(sql, params);
    return rs.affectedRows;
  },

  async remove(id) {
    const [rs] = await pool.query(`DELETE FROM seller_documents WHERE id = ?`, [id]);
    return rs.affectedRows;
  }
};

module.exports = SellerDocumentModel;
