const db = require("../config/database"); // mysql2/promise pool

class User {
  constructor(user) {
    this.username = user.username;
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
  }

  static async create(newUser) {
    // Auto-fill module_permissions for admin
    let module_permissions = newUser.module_permissions || {};

    if (newUser.role === "admin") {
      module_permissions = {
        users: { create: true, read: true, update: true, delete: true, view: true },
        leads: { create: true, read: true, update: true, delete: true, view: true },
        properties: { create: true, read: true, update: true, delete: true, view: true },
        reports: { create: true, read: true, update: true, delete: true, view: true }
      };
    }

    const query = `
      INSERT INTO users (
        username, first_name, last_name, email, password, 
        phone, role, is_active, avatar, designation, department,
        total_leads, total_properties, total_revenue, module_permissions,
        dob, blood_group,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const values = [
      newUser.username,
      newUser.first_name,
      newUser.last_name,
      newUser.email,
      newUser.password,
      newUser.phone,
      newUser.role,
      newUser.is_active,
      newUser.avatar,
      newUser.designation || null,
      newUser.department || null,
      newUser.total_leads || 0,
      newUser.total_properties || 0,
      newUser.total_revenue || 0.0,
      JSON.stringify(module_permissions),
      newUser.dob || null,
      newUser.blood_group || null
    ];

    try {
      const [result] = await db.query(query, values);
      return { id: result.insertId, ...newUser, module_permissions };
    } catch (err) {
      console.error("Error creating user:", err);
      throw err;
    }
  }

  static async findById(userId) {
    try {
      const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
      return rows.length ? rows[0] : null;
    } catch (err) {
      console.error("Error finding user:", err);
      throw err;
    }
  }

  static async findByEmail(email) {
    try {
      const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
      return rows.length ? rows[0] : null;
    } catch (err) {
      console.error("Error finding user by email:", err);
      throw err;
    }
  }

  static async findByUsername(username) {
    try {
      const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
      return rows.length ? rows[0] : null;
    } catch (err) {
      console.error("Error finding user by username:", err);
      throw err;
    }
  }

  static async getAll() {
    const query = `
      SELECT id, username, first_name, last_name, email, phone, 
             role, is_active, avatar, designation, department,
             total_leads, total_properties, total_revenue,
             module_permissions, last_login, dob, blood_group,
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
      SELECT id, username, first_name, last_name, email, phone, 
             role, is_active, avatar, designation, department,
             total_leads, total_properties, total_revenue,
             module_permissions, last_login, dob, blood_group,
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
      "username", "first_name", "last_name", "email", "password",
      "phone", "role", "is_active", "avatar",
      "designation", "department",
      "total_leads", "total_properties", "total_revenue",
      "module_permissions", "dob", "blood_group"
    ];

    const fields = [];
    const values = [];

    allowedFields.forEach((field) => {
      if (user[field] !== undefined) {
        if (field === "module_permissions") {
          fields.push(`${field} = ?`);
          values.push(JSON.stringify(user[field]));
        } else {
          fields.push(`${field} = ?`);
          values.push(user[field]);
        }
      }
    });

    if (fields.length === 0) {
      return { kind: "no_changes" };
    }

    fields.push("updated_at = NOW()");
    values.push(id);

    const query = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;

    try {
      const [result] = await db.query(query, values);
      if (result.affectedRows === 0) return { kind: "not_found" };
      return { id, ...user };
    } catch (err) {
      console.error("Error updating user:", err);
      throw err;
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
