const express = require('express');
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/authJwt');

const router = express.Router();

// Authentication routes
router.post('/signup', authController.signup);
router.post('/signin', authController.signin);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/logout', [verifyToken], authController.logout);

module.exports = router;