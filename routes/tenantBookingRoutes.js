const express = require('express');
const router = express.Router();
const tenantBookingController = require('../controllers/tenantBookingController');

router.post('/', tenantBookingController.createBooking);
router.post('/:booking_id/claim-payment', tenantBookingController.claimPayment);
router.post('/:booking_id/verify-payment', tenantBookingController.verifyPayment);
router.post('/:booking_id/flag-issue', tenantBookingController.flagPaymentIssue);
router.get('/tenant/:tenant_id', tenantBookingController.getTenantBookings);
router.get('/property/:property_id', tenantBookingController.getPropertyBookings);

module.exports = router;