// const express = require('express');
// const router = express.Router();
// const tenantBookingController = require('../controllers/tenantBookingController');

// router.post('/', tenantBookingController.createBooking);
// router.post('/:booking_id/claim-payment', tenantBookingController.claimPayment);
// router.post('/:booking_id/verify-payment', tenantBookingController.verifyPayment);
// router.post('/:booking_id/flag-issue', tenantBookingController.flagPaymentIssue);
// router.get('/tenant/:tenant_id', tenantBookingController.getTenantBookings);
// router.get('/property/:property_id', tenantBookingController.getPropertyBookings);

// module.exports = router;

const express = require('express');
const router = express.Router();
const tenantBookingController = require('../controllers/tenantBookingController');
const { uploadTenant, attachPublicUrls } = require('../middleware/upload');

router.post('/', tenantBookingController.createBooking);
router.post('/:booking_id/claim-payment', tenantBookingController.claimPayment);
router.post('/:booking_id/verify-payment', tenantBookingController.verifyPayment);
router.post('/:booking_id/flag-issue', tenantBookingController.flagPaymentIssue);
router.post('/:booking_id/verify-kyc', tenantBookingController.verifyKyc);
router.post('/:booking_id/reject-kyc', tenantBookingController.rejectKyc);
router.post('/:booking_id/cancel', tenantBookingController.cancelBooking);

router.get('/tenant/:tenant_id', tenantBookingController.getTenantBookings);
router.get('/owner/:owner_id', tenantBookingController.getOwnerBookings);
router.get('/property/:property_id', tenantBookingController.getPropertyBookings);
router.post('/:booking_id/request-kyc', tenantBookingController.requestKyc);
router.post('/:booking_id/upload-agreement', uploadTenant.single('agreement_file'), attachPublicUrls, tenantBookingController.uploadAgreement);
router.post('/:booking_id/sign-agreement', tenantBookingController.signAgreement);
router.post('/:booking_id/finalize-agreement', tenantBookingController.finalizeAgreement);
module.exports = router;