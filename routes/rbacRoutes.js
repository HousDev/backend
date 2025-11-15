// backend/routes/rbacRoutes.js
const express = require("express");
const router = express.Router();

const rbacController = require("../controllers/rbacController");
// agar auth middleware hai to yaha import kar ke lagaa sakte ho
// const auth = require('../middleware/auth');
// const authorize = require('../middleware/authorize');

// 👉 abhi simple rakha hai: bina auth ke
router.get(
  "/roles/:roleId/permissions",
  // auth,
  // authorize('system.manage'),
  rbacController.getRolePermissions
);

router.put(
  "/roles/:roleId/permissions",
  // auth,
  // authorize('system.manage'),
  rbacController.updateRolePermissions
);

module.exports = router;
