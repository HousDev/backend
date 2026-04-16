// backend/routes/rbacRoutes.js
const express = require("express");
const router = express.Router();
const rbacController = require("../controllers/rbacController");

// Yaha apna auth/role middleware laga sakte ho:
// const { requireAuth, requireAdmin } = require("../middleware/auth");
// router.use(requireAuth);
// router.use(requireAdmin);

router.get("/roles/:roleId/permissions", rbacController.getRolePermissions);
router.put("/roles/:roleId/permissions", rbacController.updateRolePermissions);

module.exports = router;
