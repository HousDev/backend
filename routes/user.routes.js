const express = require('express');
const userController = require('../controllers/user.controller');
const { verifyToken, isAdmin, isAgentOrAdmin } = require('../middleware/authJwt');
const { uploadAvatar, handleUploadErrors } = require("../middleware/upload");

const router = express.Router();

// Apply authentication to all user routes
router.use(verifyToken);

// Profile routes (accessible by all authenticated users)
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.patch('/change-password', userController.changePassword);
router.get('/dashboard-stats', userController.getDashboardStats);



router.post(
  "/upload-avatar",
  uploadAvatar.single("avatar"), // multer middleware
  handleUploadErrors,
  userController.uploadAvatar
);

router.delete("/remove-avatar", userController.removeAvatar);
// Agent routes (accessible by agents and admins)
router.get('/agents', [isAgentOrAdmin], userController.getAgents);

// Admin only routes
router.get('/get-all-user', [isAdmin], userController.getAllUsers);
router.get('/get-user-by:userId', [isAdmin], userController.getUserById);
router.put('/update/:userId', [isAdmin], userController.updateUser);
router.delete('/delete/:userId', [isAdmin], userController.deleteUser);
router.post('/create', [isAdmin], userController.createUser);
router.get('/filter', [isAdmin], userController.filterData);


module.exports = router;