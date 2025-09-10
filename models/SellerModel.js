// models/SellerModel.js
const pool = require("../config/database");
// models/Seller.js
const toDateOnly = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};
const SellerModel = {
  async getAll() {
    const [rows] = await pool.query("SELECT * FROM sellers ORDER BY id DESC");
    return rows;
  },

  async getById(id) {
    const [rows] = await pool.query("SELECT * FROM sellers WHERE id = ?", [id]);
    return rows[0];
  },

  async updateWithCoSellers(id, data, cosellers = [], deleteIds = []) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 👇 sanitize DATE fields defensively
    data.seller_dob = toDateOnly(data.seller_dob);
    if (data.expected_close) data.expected_close = toDateOnly(data.expected_close);
    if (data.last_activity) data.last_activity = toDateOnly(data.last_activity);


      // --- update main seller row ---
      const sql = `
        UPDATE sellers SET 
          salutation=?, name=?, phone=?, whatsapp=?, email=?, state=?, city=?, 
          location=?, stage=?, leadType=?, priority=?, status=?, notes=?, 
          seller_dob=?, countryCode=?, assigned_to=?, assigned_to_name=?,
          lead_score=?, deal_value=?, expected_close=?, source=?, visits=?, 
          total_visits=?, last_activity=?, notifications=?, current_stage=?, 
          stage_progress=?, deal_potential=?, response_rate=?, avg_response_time=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `;
      const params = [
        data.salutation, data.name, data.phone, data.whatsapp, data.email,
        data.state, data.city, data.location, data.stage, data.leadType,
        data.priority, data.status, data.notes, data.seller_dob,
        data.countryCode, data.assigned_to, data.assigned_to_name,
        data.lead_score, data.deal_value, data.expected_close, data.source,
        data.visits, data.total_visits, data.last_activity, data.notifications,
        data.current_stage, data.stage_progress, data.deal_potential,
        data.response_rate, data.avg_response_time,
        id
      ];

      const [result] = await conn.query(sql, params);
      if (result.affectedRows === 0) {
        await conn.rollback();
        return 0; // not found
      }

      // --- handle co-seller deletes ---
      if (Array.isArray(deleteIds) && deleteIds.length > 0) {
        await conn.query(
          `DELETE FROM seller_cosellers WHERE seller_id=? AND id IN (${deleteIds.map(() => '?').join(',')})`,
          [id, ...deleteIds]
        );
      }

      // split: updates (have id) vs inserts (no id)
      const toUpdate = cosellers.filter(c => Number.isFinite(c.id));
      const toInsert = cosellers.filter(c => !c.id);

      // --- updates ---
      for (const c of toUpdate) {
        await conn.query(
          `UPDATE seller_cosellers
             SET salutation=?, name=?, phone=?, whatsapp=?, email=?, relation=?, dob=?, updated_at=CURRENT_TIMESTAMP
           WHERE id=? AND seller_id=?`,
          [
            c.salutation, c.name, c.phone, c.whatsapp, c.email, c.relation, c.dob,
            Number(c.id), id
          ]
        );
      }

      // --- inserts (bulk) ---
      if (toInsert.length > 0) {
        const values = toInsert.map(c => [
          id,
          c.salutation, c.name, c.phone, c.whatsapp, c.email, c.relation, c.dob
        ]);
        await conn.query(
          `INSERT INTO seller_cosellers
            (seller_id, salutation, name, phone, whatsapp, email, relation, dob)
           VALUES ?`,
          [values]
        );
      }

      await conn.commit();
      return result.affectedRows;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },

  async getByIdWithCoSellers(id) {
    const [rows] = await pool.query(`SELECT * FROM sellers WHERE id=? LIMIT 1`, [id]);
    if (!rows.length) return null;
    const seller = rows[0];

    const [coRows] = await pool.query(
      `SELECT id, seller_id, salutation, name, phone, whatsapp, email, relation, dob
         FROM seller_cosellers WHERE seller_id=? ORDER BY id ASC`,
      [id]
    );

    // shape close to your UI mapping
    return {
      ...seller,
      coSellers: coRows,      // UI friendly
      cosellers: coRows,      // backend friendly
      seller_cosellers: coRows,     // snake_case variant
    };
  },

  async delete(id) {
    const [result] = await pool.query("DELETE FROM sellers WHERE id = ?", [id]);
    return result.affectedRows;
  },
};

module.exports = SellerModel;
