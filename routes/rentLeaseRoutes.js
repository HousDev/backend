const express = require('express');
const router = express.Router();
const rentLeaseController = require('../controllers/rentLeaseController');
const { verifyToken } = require('../middleware/authJwt');

router.get('/booking/:booking_id', rentLeaseController.getLease);
router.get('/tenant/:tenant_id', rentLeaseController.getTenantLeaseAndLedger);
router.post('/booking/:booking_id/claim-rent', rentLeaseController.claimRentPayment);
router.post('/payment/:payment_id/verify', rentLeaseController.verifyRentPayment);
router.post('/payment/:payment_id/issue', rentLeaseController.flagRentPaymentIssue);

module.exports = router;
