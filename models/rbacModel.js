// backend/models/rbacModel.js
const pool = require("../config/database"); // ✅ tumhara MySQL pool yahi hai

// ✅ Get permission keys for a role: ['user.create', 'lead.read', ...]
async function getRolePermissionKeys(roleId) {
  const [rows] = await pool.query(
    "SELECT permission_key FROM role_permissions WHERE role_id = ?",
    [roleId]
  );
  return rows.map((r) => r.permission_key);
}

// ✅ Replace all permissions for a role with new list
async function setRolePermissions(roleId, permissionKeys, createdBy) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1) Purane sab hatado
    await conn.query("DELETE FROM role_permissions WHERE role_id = ?", [
      roleId,
    ]);

    // 2) Naye daal do (agar kuch aaye hain to)
    if (Array.isArray(permissionKeys) && permissionKeys.length > 0) {
      const values = permissionKeys.map((key) => [
        roleId,
        String(key),
        createdBy || "system",
      ]);

      // mysql2: bulk insert with VALUES ?
      await conn.query(
        "INSERT INTO role_permissions (role_id, permission_key, created_by) VALUES ?",
        [values]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ✅ check if role has specific permission key
async function roleHasPermission(roleId, permissionKey) {
  const [rows] = await pool.query(
    "SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_key = ? LIMIT 1",
    [roleId, permissionKey]
  );
  return rows.length > 0;
}

module.exports = {
  getRolePermissionKeys,
  setRolePermissions,
  roleHasPermission,
};
