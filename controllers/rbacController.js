// backend/controllers/rbacController.js
const {
  getRolePermissionKeys,
  setRolePermissions,
} = require("../models/rbacModel");

// GET /api/rbac/roles/:roleId/permissions
// -> ['user.create', 'lead.read', ...]
async function getRolePermissions(req, res) {
  const { roleId } = req.params;

  try {
    const permissionKeys = await getRolePermissionKeys(roleId);
    res.json({
      success: true,
      data: permissionKeys,
    });
  } catch (err) {
    console.error("Error in getRolePermissions:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load role permissions",
    });
  }
}

// PUT /api/rbac/roles/:roleId/permissions
// body: { permissions: ['user.create', 'lead.read', ...] }
async function updateRolePermissions(req, res) {
  const { roleId } = req.params;
  const { permissions } = req.body;

  if (!Array.isArray(permissions)) {
    return res.status(400).json({
      success: false,
      message: 'permissions must be an array of "resource.action" strings',
    });
  }

  try {
    // yaha tumhara auth middleware se user aa sakta hai
    const user = req.user || {};
    const userId =
      user.id || user.user_id || user.uuid || user.email || "system";

    await setRolePermissions(roleId, permissions, userId);

    const updatedKeys = await getRolePermissionKeys(roleId);

    res.json({
      success: true,
      message: "Role permissions updated successfully",
      data: updatedKeys,
    });
  } catch (err) {
    console.error("Error in updateRolePermissions:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update role permissions",
    });
  }
}

module.exports = {
  getRolePermissions,
  updateRolePermissions,
};
