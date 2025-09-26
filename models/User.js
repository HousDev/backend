const db = require("../config/database"); // mysql2/promise pool

 class User {
  constructor(user) {
    this.username = user.username;
    this.salutation = user.salutation || null;
    this.first_name = user.first_name;
    this.last_name = user.last_name;
    this.email = user.email;
    this.password = user.password;
    this.phone = user.phone;
    this.role = user.role || "agent";
    this.is_active = user.is_active !== undefined ? user.is_active : true;
    this.avatar = user.avatar;
    this.designation = user.designation || null;
    this.department = user.department || null;
    this.total_leads = user.total_leads || 0;
    this.total_properties = user.total_properties || 0;
    this.total_revenue = user.total_revenue || 0.0;
    this.module_permissions = user.module_permissions || {};
    this.last_login = user.last_login || null;
    this.created_at = user.created_at || new Date();
    this.updated_at = user.updated_at || new Date();
    this.dob = user.dob || null; // Date of Birth
    this.blood_group = user.blood_group || null; // Blood Group

    // relational fields
    this.buyer_id = user.buyer_id !== undefined ? user.buyer_id : null;
    this.seller_id = user.seller_id !== undefined ? user.seller_id : null;
  }

  static async create(newUser) {
    let module_permissions = newUser.module_permissions || {};

    if (newUser.role === "admin") {
      module_permissions = {
        users: { create: true, read: true, update: true, delete: true, view: true },
        leads: { create: true, read: true, update: true, delete: true, view: true },
        properties: { create: true, read: true, update: true, delete: true, view: true },
        reports: { create: true, read: true, update: true, delete: true, view: true },
      };
    }

    const query = `
      INSERT INTO users (
        username, salutation, first_name, last_name, email, password, 
        phone, role, is_active, avatar, designation, department,
        total_leads, total_properties, total_revenue, module_permissions,
        dob, blood_group, buyer_id, seller_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const normalizedBuyerId = newUser.buyer_id !== undefined && newUser.buyer_id !== null && newUser.buyer_id !== ""
        ? Number.isNaN(parseInt(newUser.buyer_id, 10)) ? null : parseInt(newUser.buyer_id, 10)
        : null;

    const normalizedSellerId = newUser.seller_id !== undefined && newUser.seller_id !== null && newUser.seller_id !== ""
        ? Number.isNaN(parseInt(newUser.seller_id, 10)) ? null : parseInt(newUser.seller_id, 10)
        : null;

    const values = [
      newUser.username,
      newUser.salutation || null,
      newUser.first_name,
      newUser.last_name,
      newUser.email,
      newUser.password,
      newUser.phone || null,
      newUser.role || "agent",
      newUser.is_active !== undefined ? newUser.is_active : true,
      newUser.avatar || null,
      newUser.designation || null,
      newUser.department || null,
      newUser.total_leads !== undefined ? newUser.total_leads : 0,
      newUser.total_properties !== undefined ? newUser.total_properties : 0,
      newUser.total_revenue !== undefined ? newUser.total_revenue : 0.0,
      JSON.stringify(module_permissions),
      newUser.dob || null,
      newUser.blood_group || null,
      normalizedBuyerId,
      normalizedSellerId,
    ];

    try {
      const [result] = await db.query(query, values);
      console.log("✅ User created successfully:", result.insertId);
      
      return {
        id: result.insertId,
        ...newUser,
        salutation: newUser.salutation || null,
        buyer_id: normalizedBuyerId,
        seller_id: normalizedSellerId,
        module_permissions,
      };
    } catch (err) {
      console.error("❌ Error creating user:", err.message);
      throw err;
    }
  }


  static async findById(userId) {
    try {
      const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [
        userId,
      ]);
      return rows.length ? rows[0] : null;
    } catch (err) {
      console.error("Error finding user:", err);
      throw err;
    }
  }

  static async findByEmail(email) {
    try {
      const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [
        email,
      ]);
      return rows.length ? rows[0] : null;
    } catch (err) {
      console.error("Error finding user by email:", err);
      throw err;
    }
  }

  static async findByUsername(username) {
    try {
      const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [
        username,
      ]);
      return rows.length ? rows[0] : null;
    } catch (err) {
      console.error("Error finding user by username:", err);
      throw err;
    }
  }

  static async getAll() {
    const query = `
        SELECT id, username, salutation, first_name, last_name, email, phone, 
              role, is_active, avatar, designation, department,
              total_leads, total_properties, total_revenue,
              module_permissions, last_login, dob, blood_group,
              buyer_id, seller_id,
              created_at, updated_at
        FROM users 
        ORDER BY created_at DESC
      `;
    try {
      const [rows] = await db.query(query);
      return rows;
    } catch (err) {
      console.error("Error fetching users:", err);
      throw err;
    }
  }

  static async getByRole(role) {
    const query = `
        SELECT id, username, salutation, first_name, last_name, email, phone, 
              role, is_active, avatar, designation, department,
              total_leads, total_properties, total_revenue,
              module_permissions, last_login, dob, blood_group,
              buyer_id, seller_id,
              created_at, updated_at
        FROM users 
        WHERE role = ? AND is_active = true
        ORDER BY first_name, last_name
      `;
    try {
      const [rows] = await db.query(query, [role]);
      return rows;
    } catch (err) {
      console.error("Error fetching users by role:", err);
      throw err;
    }
  }

static async updateById(id, user) {
  const allowedFields = [
    "username",
    "salutation",
    "first_name",
    "last_name",
    "email",
    "password",
    "phone",
    "role",
    "is_active",
    "avatar",
    "designation",
    "department",
    "total_leads",
    "total_properties",
    "total_revenue",
    "module_permissions",
    "dob",
    "blood_group",
    "buyer_id",
    "seller_id",
  ];

  // --- helpers ---
  const toTinyInt = (v) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["1", "true", "yes", "active"].includes(s)) return 1;
      if (["0", "false", "no", "inactive"].includes(s)) return 0;
      const n = Number(s);
      return Number.isNaN(n) ? 0 : (n ? 1 : 0);
    }
    if (v === true) return 1;
    if (v === false) return 0;
    const n = Number(v);
    return Number.isNaN(n) ? 0 : (n ? 1 : 0);
  };

  const normalizeId = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  };

  const provided = (k) => user[k] !== undefined;

  // --- build dynamic SET for users table ---
  const fields = [];
  const values = [];

  for (const field of allowedFields) {
    if (user[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(
        field === "module_permissions"
          ? JSON.stringify(user[field])
          : field === "is_active"
          ? toTinyInt(user[field])
          : user[field]
      );
    }
  }

  if (fields.length === 0) return { kind: "no_changes" };

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // --- fetch existing buyer/seller IDs ---
    const [rows] = await conn.query(
      "SELECT buyer_id, seller_id FROM users WHERE id = ? LIMIT 1",
      [id]
    );
    if (!rows || rows.length === 0) {
      await conn.rollback();
      return { kind: "not_found" };
    }

    const existingBuyerId = normalizeId(rows[0].buyer_id);
    const existingSellerId = normalizeId(rows[0].seller_id);

    const buyerId = user.buyer_id !== undefined ? normalizeId(user.buyer_id) : existingBuyerId;
    const sellerId = user.seller_id !== undefined ? normalizeId(user.seller_id) : existingSellerId;

    // --- finalize user update ---
    fields.push("updated_at = NOW()");
    values.push(id);

    const updateUserSql = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;
    const [userResult] = await conn.query(updateUserSql, values);
    if (userResult.affectedRows === 0) {
      await conn.rollback();
      return { kind: "not_found" };
    }

    const fullName =
      provided("first_name") || provided("last_name")
        ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim().replace(/\s+/g, " ")
        : undefined;

    // --- mirror to BUYERS ---
    if (buyerId) {
      const buyerSetParts = [];
      const buyerVals = [];

      if (provided("salutation")) { buyerSetParts.push("salutation = ?"); buyerVals.push(user.salutation || null); }
      if (fullName !== undefined) { buyerSetParts.push("name = ?"); buyerVals.push(fullName); }
      if (provided("phone")) { buyerSetParts.push("phone = ?"); buyerVals.push(user.phone || null); }
      if (provided("email")) { buyerSetParts.push("email = ?"); buyerVals.push(user.email || null); }
      if (provided("dob")) { buyerSetParts.push("dob = ?"); buyerVals.push(user.dob || null); }
      if (provided("is_active")) { buyerSetParts.push("is_active = ?"); buyerVals.push(toTinyInt(user.is_active)); }

      if (buyerSetParts.length > 0) {
        buyerSetParts.push("updated_at = NOW()");
        buyerVals.push(buyerId);
        await conn.query(`UPDATE buyers SET ${buyerSetParts.join(", ")} WHERE id = ?`, buyerVals);
      }
    }

    // --- mirror to SELLERS ---
    if (sellerId) {
      const sellerSetParts = [];
      const sellerVals = [];

      if (provided("salutation")) { sellerSetParts.push("salutation = ?"); sellerVals.push(user.salutation || null); }
      if (fullName !== undefined) { sellerSetParts.push("name = ?"); sellerVals.push(fullName); }
      if (provided("phone")) { sellerSetParts.push("phone = ?"); sellerVals.push(user.phone || null); }
      if (provided("email")) { sellerSetParts.push("email = ?"); sellerVals.push(user.email || null); }
      if (provided("dob")) { sellerSetParts.push("seller_dob = ?"); sellerVals.push(user.dob || null); }
      if (provided("is_active")) {
        sellerSetParts.push("is_active = ?"); sellerVals.push(toTinyInt(user.is_active));
        sellerSetParts.push("status = ?"); sellerVals.push(toTinyInt(user.is_active) ? "active" : "inactive");
      }

      if (sellerSetParts.length > 0) {
        sellerSetParts.push("updated_at = NOW()");
        sellerVals.push(sellerId);
        await conn.query(`UPDATE sellers SET ${sellerSetParts.join(", ")} WHERE id = ?`, sellerVals);
      }
    }

    await conn.commit();
    return { id, ...user, buyer_id: buyerId, seller_id: sellerId };
  } catch (err) {
    await conn.rollback();
    console.error("Error updating user (+ buyer/seller sync):", err);
    throw err;
  } finally {
    conn.release();
  }
}



  static async remove(id) {
    try {
      const [result] = await db.query("DELETE FROM users WHERE id = ?", [id]);
      if (result.affectedRows === 0) return { kind: "not_found" };
      return result;
    } catch (err) {
      console.error("Error deleting user:", err);
      throw err;
    }
  }

  static async updateLastLogin(id) {
    try {
      const query = "UPDATE users SET last_login = NOW() WHERE id = ?";
      const [result] = await db.query(query, [id]);
      return result;
    } catch (err) {
      console.error("Error updating last login:", err);
      throw err;
    }
  }

  static async getUsersStats() {
    const query = `
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
          COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
          COUNT(CASE WHEN role = 'agent' THEN 1 END) as agent_users,
          COUNT(CASE WHEN role = 'manager' THEN 1 END) as manager_users,
          COUNT(CASE WHEN DATE(last_login) = CURDATE() THEN 1 END) as users_logged_today,
          COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as users_created_today
        FROM users
      `;
    try {
      const [rows] = await db.query(query);
      return rows[0];
    } catch (err) {
      console.error("Error fetching users stats:", err);
      throw err;
    }
  }
}

module.exports = User;
