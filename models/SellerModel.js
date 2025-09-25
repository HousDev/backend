// // models/SellerModel.js
// const pool = require("../config/database");
// // models/Seller.js
// const toDateOnly = (v) => {
//   if (!v) return null;
//   const d = new Date(v);
//   if (Number.isNaN(d.getTime())) return null;
//   const mm = String(d.getMonth() + 1).padStart(2, '0');
//   const dd = String(d.getDate()).padStart(2, '0');
//   return `${d.getFullYear()}-${mm}-${dd}`;
// };
// const SellerModel = {
//   async getAll() {
//     const [rows] = await pool.query("SELECT * FROM sellers ORDER BY id DESC");
//     return rows;
//   },

//   async getById(id) {
//     const [rows] = await pool.query("SELECT * FROM sellers WHERE id = ?", [id]);
//     return rows[0];
//   },

//   async updateWithCoSellers(id, data, cosellers = [], deleteIds = []) {
//   const conn = await pool.getConnection();
//   try {
//     await conn.beginTransaction();

//     // 👇 sanitize DATE fields defensively
//     data.seller_dob = toDateOnly(data.seller_dob);
//     if (data.expected_close) data.expected_close = toDateOnly(data.expected_close);
//     if (data.last_activity) data.last_activity = toDateOnly(data.last_activity);


//       // --- update main seller row ---
//       const sql = `
//         UPDATE sellers SET
//           salutation=?, name=?, phone=?, whatsapp=?, email=?, state=?, city=?,
//           location=?, stage=?, leadType=?, priority=?, status=?, notes=?,
//           seller_dob=?, countryCode=?, assigned_to=?, assigned_to_name=?,
//           lead_score=?, deal_value=?, expected_close=?, source=?, visits=?,
//           total_visits=?, last_activity=?, notifications=?, current_stage=?,
//           stage_progress=?, deal_potential=?, response_rate=?, avg_response_time=?,
//           updated_at=CURRENT_TIMESTAMP
//         WHERE id=?
//       `;
//       const params = [
//         data.salutation, data.name, data.phone, data.whatsapp, data.email,
//         data.state, data.city, data.location, data.stage, data.leadType,
//         data.priority, data.status, data.notes, data.seller_dob,
//         data.countryCode, data.assigned_to, data.assigned_to_name,
//         data.lead_score, data.deal_value, data.expected_close, data.source,
//         data.visits, data.total_visits, data.last_activity, data.notifications,
//         data.current_stage, data.stage_progress, data.deal_potential,
//         data.response_rate, data.avg_response_time,
//         id
//       ];

//       const [result] = await conn.query(sql, params);
//       if (result.affectedRows === 0) {
//         await conn.rollback();
//         return 0; // not found
//       }

//       // --- handle co-seller deletes ---
//       if (Array.isArray(deleteIds) && deleteIds.length > 0) {
//         await conn.query(
//           `DELETE FROM seller_cosellers WHERE seller_id=? AND id IN (${deleteIds.map(() => '?').join(',')})`,
//           [id, ...deleteIds]
//         );
//       }

//       // split: updates (have id) vs inserts (no id)
//       const toUpdate = cosellers.filter(c => Number.isFinite(c.id));
//       const toInsert = cosellers.filter(c => !c.id);

//       // --- updates ---
//       for (const c of toUpdate) {
//         await conn.query(
//           `UPDATE seller_cosellers
//              SET salutation=?, name=?, phone=?, whatsapp=?, email=?, relation=?, dob=?, updated_at=CURRENT_TIMESTAMP
//            WHERE id=? AND seller_id=?`,
//           [
//             c.salutation, c.name, c.phone, c.whatsapp, c.email, c.relation, c.dob,
//             Number(c.id), id
//           ]
//         );
//       }

//       // --- inserts (bulk) ---
//       if (toInsert.length > 0) {
//         const values = toInsert.map(c => [
//           id,
//           c.salutation, c.name, c.phone, c.whatsapp, c.email, c.relation, c.dob
//         ]);
//         await conn.query(
//           `INSERT INTO seller_cosellers
//             (seller_id, salutation, name, phone, whatsapp, email, relation, dob)
//            VALUES ?`,
//           [values]
//         );
//       }

//       await conn.commit();
//       return result.affectedRows;
//     } catch (e) {
//       await conn.rollback();
//       throw e;
//     } finally {
//       conn.release();
//     }
//   },

//   async getByIdWithCoSellers(id) {
//     const [rows] = await pool.query(`SELECT * FROM sellers WHERE id=? LIMIT 1`, [id]);
//     if (!rows.length) return null;
//     const seller = rows[0];

//     const [coRows] = await pool.query(
//       `SELECT id, seller_id, salutation, name, phone, whatsapp, email, relation, dob
//          FROM seller_cosellers WHERE seller_id=? ORDER BY id ASC`,
//       [id]
//     );

//     // shape close to your UI mapping
//     return {
//       ...seller,
//       coSellers: coRows,      // UI friendly
//       cosellers: coRows,      // backend friendly
//       seller_cosellers: coRows,     // snake_case variant
//     };
//   },

//   async delete(id) {
//     const [result] = await pool.query("DELETE FROM sellers WHERE id = ?", [id]);
//     return result.affectedRows;
//   },
// };

// module.exports = SellerModel;
// models/SellerModel.js
const pool = require("../config/database");

// helpers
const toDateOnly = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const safeStringify = (v, fallback = null) => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return fallback; }
};

const runQuery = async (connOrPool, sql, params = []) => {
  if (!connOrPool) connOrPool = pool;
  return connOrPool.query(sql, params);
};

const SellerModel = {
  async getAll(conn = null) {
    const [rows] = await runQuery(conn, "SELECT * FROM sellers ORDER BY id DESC");
    return rows;
  },

  async getById(id, conn = null) {
    const [rows] = await runQuery(conn, "SELECT * FROM sellers WHERE id = ? LIMIT 1", [id]);
    return rows && rows[0] ? rows[0] : null;
  },

  async create(data = {}, conn = null) {
    const payload = {
      salutation: data.salutation ?? null,
      name: data.name ?? null,
      phone: data.phone ?? null,
      whatsapp: data.whatsapp ?? data.whatsapp_number ?? null,
      email: data.email ?? null,
      state: data.state ?? null,
      city: data.city ?? null,
      location: data.location ?? null,
      stage: data.stage ?? null,
      leadType: data.leadType ?? data.lead_type ?? null,
      priority: data.priority ?? null,
      status: data.status ?? null,
      notes: data.notes ??  null,
      seller_dob: toDateOnly(data.seller_dob),
      countryCode: data.countryCode ?? null,
      assigned_to: data.assigned_to ?? data.assigned_executive ?? null,
      assigned_to_name: data.assigned_to_name ?? data.assigned_executive_name ?? null,
      lead_score: data.lead_score ?? null,
      deal_value: data.deal_value ?? null,
      expected_close: toDateOnly(data.expected_close),
      source: data.source ?? data.lead_source ?? null,
      visits: data.visits ?? 0,
      total_visits: data.total_visits ?? 0,
      last_activity: toDateOnly(data.last_activity),
      notifications: data.notifications ? safeStringify(data.notifications, null) : null,
      current_stage: data.current_stage ?? null,
      stage_progress: data.stage_progress ?? null,
      deal_potential: data.deal_potential ?? null,
      response_rate: data.response_rate ?? null,
      avg_response_time: data.avg_response_time ?? null,
      created_at: data.created_at ?? new Date().toISOString(),
      updated_at: data.updated_at ?? new Date().toISOString(),
      lead_id: data.lead_id ?? null,
      is_active: data.is_active != null ? (data.is_active ? 1 : 0) : 1,
      created_by: data.created_by ?? null,
      updated_by: data.updated_by ?? null,
      property_id: data.property_id ?? null, // if you want to link property
    };

    const cols = Object.keys(payload).filter(k => payload[k] !== undefined);
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map(k => payload[k]);

    const sql = `INSERT INTO sellers (${cols.join(", ")}) VALUES (${placeholders})`;
    const [res] = await runQuery(conn, sql, values);

    const insertId = res && (res.insertId || (Array.isArray(res) && res[0] && res[0].insertId))
      ? (res.insertId || res[0].insertId)
      : null;

    if (insertId) {
      const [rows] = await runQuery(conn, "SELECT * FROM sellers WHERE id = ? LIMIT 1", [insertId]);
      return rows && rows[0] ? rows[0] : { id: insertId };
    }

    // fallback: find recent by lead_id
    if (payload.lead_id) {
      const [rows] = await runQuery(conn, "SELECT * FROM sellers WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1", [payload.lead_id]);
      return rows && rows[0] ? rows[0] : null;
    }

    return null;
  },

  async updateWithCoSellers(id, data, cosellers = [], deleteIds = [], conn = null) {
    const connection = conn || await pool.getConnection();
    let createdLocally = false;
    try {
      if (!conn) {
        await connection.beginTransaction();
        createdLocally = true;
      }

      // sanitize date fields
      data.seller_dob = toDateOnly(data.seller_dob);
      if (data.expected_close) data.expected_close = toDateOnly(data.expected_close);
      if (data.last_activity) data.last_activity = toDateOnly(data.last_activity);

      // Ensure notifications is JSON string or null before updating DB
      data.notifications = safeStringify(data.notifications, null);

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

      const [result] = await connection.query(sql, params);
      if (result.affectedRows === 0) {
        if (createdLocally) {
          await connection.rollback();
          connection.release();
        }
        return 0; // not found
      }

      // delete cosellers
      if (Array.isArray(deleteIds) && deleteIds.length > 0) {
        await connection.query(
          `DELETE FROM seller_cosellers WHERE seller_id=? AND id IN (${deleteIds.map(() => '?').join(',')})`,
          [id, ...deleteIds]
        );
      }

      const toUpdate = cosellers.filter(c => Number.isFinite(c.id));
      const toInsert = cosellers.filter(c => !c.id);

      for (const c of toUpdate) {
        await connection.query(
          `UPDATE seller_cosellers
             SET salutation=?, name=?, phone=?, whatsapp=?, email=?, relation=?, dob=?, updated_at=CURRENT_TIMESTAMP
           WHERE id=? AND seller_id=?`,
          [
            c.salutation, c.name, c.phone, c.whatsapp, c.email, c.relation, c.dob,
            Number(c.id), id
          ]
        );
      }

      if (toInsert.length > 0) {
        const values = toInsert.map(c => [
          id,
          c.salutation, c.name, c.phone, c.whatsapp, c.email, c.relation, c.dob
        ]);
        await connection.query(
          `INSERT INTO seller_cosellers
            (seller_id, salutation, name, phone, whatsapp, email, relation, dob)
           VALUES ?`,
          [values]
        );
      }

      if (createdLocally) {
        await connection.commit();
        connection.release();
      }

      return result.affectedRows;
    } catch (e) {
      if (createdLocally && connection) {
        await connection.rollback();
        connection.release();
      }
      throw e;
    }
  },

  async getByIdWithCoSellers(id, conn = null) {
    const [rows] = await runQuery(conn, `SELECT * FROM sellers WHERE id=? LIMIT 1`, [id]);
    if (!rows || !rows.length) return null;
    const seller = rows[0];

    const [coRows] = await runQuery(conn,
      `SELECT id, seller_id, salutation, name, phone, whatsapp, email, relation, dob
         FROM seller_cosellers WHERE seller_id=? ORDER BY id ASC`,
      [id]
    );

    return {
      ...seller,
      coSellers: coRows,
      cosellers: coRows,
      seller_cosellers: coRows,
    };
  },

  async delete(id, conn = null) {
    const [result] = await runQuery(conn, "DELETE FROM sellers WHERE id = ?", [id]);
    return result.affectedRows;
  },
};

module.exports = SellerModel;
