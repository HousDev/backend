

const express = require("express");
const userController = require("../controllers/user.controller");
const { verifyToken } = require("../middleware/authJwt");
const { authorize } = require("../middleware/authorize"); // 🔥 NEW RBAC middleware
const { uploadAvatar, handleUploadErrors,uploadFile } = require("../middleware/upload");

const router = express.Router();

// 🔐 All routes require authentication
router.use(verifyToken);

/* -------------------------------------
   PROFILE ROUTES 
--------------------------------------*/
router.get(
  "/profile",
  authorize("user.read"), // 🔥 Only users with user.read can view profile
  userController.getProfile
);

router.put(
  "/profile",
  authorize("user.update"), // 🔥 user.update permission required
  userController.updateProfile
);

router.patch(
  "/change-password",
  authorize("user.update"),
  userController.changePassword
);

router.get(
  "/dashboard-stats",
  authorize("dashboard.read"), // if you want new resource: dashboard.read
  userController.getDashboardStats
);

/* -------------------------------------
   AVATAR UPLOAD ROUTES
--------------------------------------*/
router.post(
  "/upload-avatar",
  authorize("user.update"),
  uploadAvatar.single("avatar"),
  handleUploadErrors,
  userController.uploadAvatar
);

router.delete(
  "/remove-avatar",
  authorize("user.update"),
  userController.removeAvatar
);

/* -------------------------------------
   AGENTS ROUTES
--------------------------------------*/
router.get(
  "/agents",
  authorize("user.read"), // earlier isAgentOrAdmin → now permission-based
  userController.getAgents
);

/* -------------------------------------
   ADMIN (NOW RBAC) ROUTES
--------------------------------------*/

// 🔥 Get all users → user.read
router.get("/get-all-user", authorize("user.read"), userController.getAllUsers);

// 🔥 Fetch one user → user.read
router.get(
  "/get-user-by/:userId",
  authorize("user.read"),
  userController.getUserById
);

// 🔥 Create new user → user.create
router.post("/create", authorize("user.create"), userController.createUser);

// 🔥 Update user → user.update
router.put(
  "/update/:userId",
  authorize("user.update"),
  userController.updateUser
);

// 🔥 Delete user → user.delete
router.delete(
  "/delete/:userId",
  authorize("user.delete"),
  userController.deleteUser
);

// 🔥 Filter API → user.read
router.get("/filter", authorize("user.read"), userController.filterData);

// 🔥 Get users by dept & role → user.read
router.get(
  "/by-dept-role",
  authorize("user.read"),
  userController.getByDeptRole
);

// 🔥 Sales executives list → user.read
router.get(
  "/sales-executives",
  authorize("user.read"),
  userController.getSalesExecutives
);

router.get('/export', userController.exportUsers);

router.get('/import-template', userController.downloadImportTemplate);

router.post('/import', uploadFile.single('file'), userController.importUsers);
router.get('/export-by-tab', userController.exportUsersByTab);

// Import template with type
router.get('/import-template', userController.downloadImportTemplate);

// Import users with type
router.post('/import', uploadFile.single('file'), userController.importUsersByType);
module.exports = router;
