const express = require('express');
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/authJwt');

const router = express.Router();

// Authentication routes
router.post('/signup', authController.signup);
router.post('/signin', authController.signin);
router.post('/send-login-otp', authController.sendLoginOTP);
router.post('/verify-otp-login', authController.verifyOTPAndLogin);
router.post('/send-registration-otp', authController.sendRegistrationOTP);
router.post('/verify-otp-register', authController.verifyOTPAndRegister);
router.post('/google-auth', authController.googleAuth);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/logout', [verifyToken], authController.logout);
router.get('/me', [verifyToken], authController.me);
router.get('/profile', [verifyToken], authController.me);

module.exports = router;