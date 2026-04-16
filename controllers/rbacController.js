// backend/controllers/rbacController.js
const rbacModel = require("../models/rbacModel");
const User = require("../models/User");

/**
 * GET /api/rbac/roles/:roleId/permissions
 * Returns: ['user.create', 'user.read', ...]
 */
exports.getRolePermissions = async (req, res) => {
  const { roleId } = req.params;

  try {
    const keys = await rbacModel.getRolePermissionKeys(roleId);
    return res.json(keys);
  } catch (err) {
    console.error("Error fetching role permissions:", err);
    return res.status(500).json({ message: "Failed to load role permissions" });
  }
};

/**
 * PUT /api/rbac/roles/:roleId/permissions
 * Body: { permissions: ['user.create', 'user.read', ...] }
 */
exports.updateRolePermissions = async (req, res) => {
  const { roleId } = req.params;
  const { permissions } = req.body;
  const userId = req.user?.id || "system"; // if auth enabled

  if (!Array.isArray(permissions)) {
    return res
      .status(400)
      .json({ message: "permissions must be an array of keys" });
  }

  try {
    // 1) RBAC table update
    await rbacModel.setRolePermissions(roleId, permissions, userId);

    // 2) us role ke sabhi users ke module_permissions sync
    await User.syncModulePermissionsForRole(roleId);

    return res.json({
      success: true,
      message: "Role permissions updated and users synced",
    });
  } catch (err) {
    console.error("Error updating role permissions:", err);
    return res
      .status(500)
      .json({ message: "Failed to update role permissions" });
  }
};
