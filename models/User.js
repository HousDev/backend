const db = require("../config/database"); // mysql2/promise pool

class User {
  constructor(user) {
    this.username = user.username;
    this.salutation = user.salutation || null; // नया
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

    // नए relational fields
    this.buyer_id = user.buyer_id !== undefined ? user.buyer_id : null;
    this.seller_id = user.seller_id !== undefined ? user.seller_id : null;
  }

  static async create(newUser) {
    let module_permissions = newUser.module_permissions || {};

    if (newUser.role === "admin") {
      module_permissions = {
        users: {
          create: true,
          read: true,
          update: true,
          delete: true,
          view: true,
        },
        leads: {
          create: true,
          read: true,
          update: true,
          delete: true,
          view: true,
        },
        properties: {
          create: true,
          read: true,
          update: true,
          delete: true,
          view: true,
        },
        reports: {
          create: true,
          read: true,
          update: true,
          delete: true,
          view: true,
        },
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

    const normalizedBuyerId =
      newUser.buyer_id !== undefined &&
      newUser.buyer_id !== null &&
      newUser.buyer_id !== ""
        ? Number.isNaN(parseInt(newUser.buyer_id, 10))
          ? null
          : parseInt(newUser.buyer_id, 10)
        : null;

    const normalizedSellerId =
      newUser.seller_id !== undefined &&
      newUser.seller_id !== null &&
      newUser.seller_id !== ""
        ? Number.isNaN(parseInt(newUser.seller_id, 10))
          ? null
          : parseInt(newUser.seller_id, 10)
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

    // debug
    console.log("INSERT values length:", values.length);
    console.log("INSERT values:", values);

    try {
      const [result] = await db.query(query, values);
      return {
        id: result.insertId,
        ...newUser,
        salutation: newUser.salutation || null,
        buyer_id: normalizedBuyerId,
        seller_id: normalizedSellerId,
        module_permissions,
      };
    } catch (err) {
      console.error("Error creating user:", err);
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
      if (s === "1" || s === "true" || s === "yes" || s === "active") return 1;
      if (s === "0" || s === "false" || s === "no" || s === "inactive") return 0;
      const n = Number(s);
      if (!Number.isNaN(n)) return n ? 1 : 0;
      return 0;
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

  // Build dynamic SET for users table
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

  // If nothing to update, short-circuit
  if (fields.length === 0) {
    return { kind: "no_changes" };
  }

  // We also want to mirror is_active to buyer/seller even if buyer_id/seller_id
  // were NOT sent in payload. So fetch existing relations first.
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Get current linkage if missing
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

    // Resolve buyer/seller IDs (payload overrides existing if present)
    const buyerId = user.buyer_id !== undefined ? normalizeId(user.buyer_id) : existingBuyerId;
    const sellerId = user.seller_id !== undefined ? normalizeId(user.seller_id) : existingSellerId;

    fields.push("updated_at = NOW()");
    values.push(id);

    const updateUserSql = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;

    // 1) Update users
    const [userResult] = await conn.query(updateUserSql, values);
    if (userResult.affectedRows === 0) {
      await conn.rollback();
      return { kind: "not_found" };
    }

    // Compute derived fullName only if either part was provided
    const fullName =
      provided("first_name") || provided("last_name")
        ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim().replace(/\s+/g, " ")
        : undefined;

    // 2) Sync to BUYERS (mirror important fields)
    if (buyerId) {
      const buyerSetParts = [];
      const buyerVals = [];

      if (provided("salutation")) {
        buyerSetParts.push("salutation = ?");
        buyerVals.push(user.salutation || null);
      }
      if (fullName !== undefined) {
        buyerSetParts.push("name = ?");
        buyerVals.push(fullName || null);
      }
      if (provided("phone")) {
        buyerSetParts.push("phone = ?");
        buyerVals.push(user.phone || null);
      }
      if (provided("email")) {
        buyerSetParts.push("email = ?");
        buyerVals.push(user.email || null);
      }

      
      // ✅ Mirror is_active from user to buyer whenever user.is_active is provided
if (provided("is_active")) {
  buyerSetParts.push("is_active = ?");
  buyerVals.push(toTinyInt(user.is_active));
}

      if (provided("dob")) {
        buyerSetParts.push("dob = ?");
        buyerVals.push(user.dob || null);
      }

      if (buyerSetParts.length > 0) {
        buyerSetParts.push("updated_at = NOW()");
        const buyerSql = `
          UPDATE buyers
          SET ${buyerSetParts.join(", ")}
          WHERE id = ?
        `;
        buyerVals.push(buyerId);
        await conn.query(buyerSql, buyerVals);
      }
    }

    // 3) Sync to SELLERS (optional mirror)
    if (sellerId) {
      const sellerSetParts = [];
      const sellerVals = [];

      if (provided("salutation")) {
        sellerSetParts.push("salutation = ?");
        sellerVals.push(user.salutation || null);
      }
      if (fullName !== undefined) {
        sellerSetParts.push("name = ?");
        sellerVals.push(fullName || null);
      }
      if (provided("phone")) {
        sellerSetParts.push("phone = ?");
        sellerVals.push(user.phone || null);
      }
      if (provided("email")) {
        sellerSetParts.push("email = ?");
        sellerVals.push(user.email || null);
      }
      if (provided("dob")) {
        sellerSetParts.push("seller_dob = ?");
        sellerVals.push(user.dob || null);
      }

      // Mirror is_active from user to seller (if you want this behavior)
      if (provided("is_active")) {
        sellerSetParts.push("is_active = ?");
        sellerVals.push(toTinyInt(user.is_active));

        // Optional: also maintain a text status
        sellerSetParts.push("status = ?");
        sellerVals.push(toTinyInt(user.is_active) ? "active" : "inactive");
      }

      if (sellerSetParts.length > 0) {
        sellerSetParts.push("updated_at = NOW()");
        const sellerSql = `
          UPDATE sellers
          SET ${sellerSetParts.join(", ")}
          WHERE id = ?
        `;
        sellerVals.push(sellerId);
        await conn.query(sellerSql, sellerVals);
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
