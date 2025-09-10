// routes/razorpayRoutes.js
const express = require('express');
const router = express.Router();
const razorpayController = require('../controllers/razorpayController');
const { authJwt } = require('../middleware'); // <- uses middleware/index.js

router.post('/save', authJwt.verifyToken, razorpayController.saveConfig);
router.get('/get', authJwt.verifyToken, razorpayController.getConfig);
router.post('/toggle', authJwt.verifyToken, razorpayController.toggleActive);
router.post('/create-order', authJwt.verifyToken, razorpayController.createOrder);

module.exports = router;