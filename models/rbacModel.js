// backend/models/rbacModel.js
const db = require("../config/database"); // mysql2/promise pool

/**
 * Get permission keys for a role
 * Returns: ['user.create', 'user.read', 'lead.read', ...]
 */
async function getRolePermissionKeys(roleId) {
  const clean = String(roleId || "").trim();
  const slug = clean.toLowerCase().replace(/\s+/g, "_");
  const space = clean.toLowerCase().replace(/_/g, " ");

  const [rows] = await db.query(
    `SELECT permission_key FROM role_permissions 
     WHERE role_id = ? 
        OR LOWER(TRIM(role_id)) = LOWER(TRIM(?)) 
        OR role_id = ? 
        OR role_id = ?`,
    [clean, clean, slug, space]
  );
  return [...new Set(rows.map((r) => r.permission_key))];
}

/**
 * Replace all permissions for a role with new list
 * permissionKeys: ['user.create', 'user.read', ...]
 */
async function setRolePermissions(
  roleId,
  permissionKeys = [],
  createdBy = "system"
) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // Purane sab hatao
    await conn.query("DELETE FROM role_permissions WHERE role_id = ?", [
      roleId,
    ]);

    // Naye daal do
    if (Array.isArray(permissionKeys) && permissionKeys.length > 0) {
      const values = permissionKeys.map((key) => [roleId, key, createdBy]);

      await conn.query(
        `INSERT INTO role_permissions (role_id, permission_key, created_by)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    return { success: true };
  } catch (err) {
    await conn.rollback();
    console.error("Error in setRolePermissions:", err);
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  getRolePermissionKeys,
  setRolePermissions,
};
