const express = require('express');
const router = express.Router();
const tenantBookingController = require('../controllers/tenantBookingController');

// Create booking / reserve property
router.post('/', tenantBookingController.createBooking);

// Get bookings for a tenant
router.get('/tenant/:tenant_id', tenantBookingController.getTenantBookings);

// Get bookings for a property
router.get('/property/:property_id', tenantBookingController.getPropertyBookings);

module.exports = router;
