// backend/routes/rbacRoutes.js
const express = require("express");
const router = express.Router();
const rbacController = require("../controllers/rbacController");



router.get("/roles/:roleId/permissions", rbacController.getRolePermissions);
router.put("/roles/:roleId/permissions", rbacController.updateRolePermissions);

module.exports = router;
