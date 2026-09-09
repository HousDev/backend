const TenantBooking = require('../models/tenantBookingModel');
const db = require('../config/database');

const tenantBookingController = {
  // Create a new property booking
  createBooking: async (req, res) => {
    try {
      const {
        property_id,
        property_title,
        token_amount,
        move_in_date,
        payment_method = 'UPI',
        monthly_rent = 0,
        security_deposit = 0,
        lock_in_period = '11 Months',
        owner_id = null,
        owner_name = null,
      } = req.body;

      // 1. Extract tenant ID from auth or request
      const tenant_id = req.user?.tenant_id || req.user?.id || req.body.tenant_id;
      if (!tenant_id) {
        return res.status(401).json({
          success: false,
          message: 'Tenant authentication required to reserve a property.',
        });
      }

      if (!property_id) {
        return res.status(400).json({
          success: false,
          message: 'Property ID is required for reservation.',
        });
      }

      if (!move_in_date) {
        return res.status(400).json({
          success: false,
          message: 'Target move-in date is required.',
        });
      }

      const effectiveToken = Number(token_amount) || 5000;
      if (effectiveToken <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Advance token amount must be greater than zero.',
        });
      }

      // 2. Duplicate Check: Check if this tenant already has an active booking for this property
      const existingTenantBooking = await TenantBooking.checkTenantActiveBooking(tenant_id, property_id);
      if (existingTenantBooking) {
        return res.status(200).json({
          success: true,
          message: 'You already have an active reservation for this property.',
          data: existingTenantBooking,
          isExisting: true,
        });
      }

      // 3. Availability Check: Check if property is already reserved by another tenant
      const otherReservation = await TenantBooking.checkActivePropertyReservation(property_id);
      if (otherReservation && String(otherReservation.tenant_id) !== String(tenant_id)) {
        return res.status(409).json({
          success: false,
          message: 'This property has already been reserved by another tenant.',
        });
      }

      // 4. Server-Side BKG ID Generation: BKG-YYYY-XXXXX
      const year = new Date().getFullYear();
      const randomSuffix = Math.floor(10000 + Math.random() * 90000);
      const booking_id = `BKG-${year}-${randomSuffix}`;

      // 5. Create Booking in PENDING status first
      const bookingData = {
        booking_id,
        tenant_id: Number(tenant_id),
        property_id: Number(property_id),
        owner_id: owner_id ? Number(owner_id) : null,
        monthly_rent: Number(monthly_rent) || 0,
        security_deposit: Number(security_deposit) || 0,
        token_amount: effectiveToken,
        move_in_date,
        lock_in_period,
        reservation_valid_until: null,
        payment_method,
        payment_status: 'PENDING',
        booking_status: 'RESERVED',
      };

      const createdBooking = await TenantBooking.create(bookingData);

      // 6. Process Payment Confirmation (transitions to PAID)
      await TenantBooking.confirmPayment(booking_id, payment_method);
      createdBooking.payment_status = 'PAID';

      // 7. Update tenant profile with linked property & status
      try {
        await db.query(
          'UPDATE tenants SET rental_property_id = ?, property_title = ?, owner_name = ?, status = ? WHERE id = ?',
          [
            property_id,
            property_title || `Rental Unit RENT-${property_id}`,
            owner_name || 'Landlord',
            'Agreement Pending',
            tenant_id,
          ]
        );
      } catch (err) {
        console.warn('Tenant profile update note:', err.message);
      }

      // 8. Emit socket notification to Landlord/Owner
      try {
        if (global.io && owner_id) {
          global.io.to(`user:${owner_id}`).emit('notification', {
            badge: 'Property Reserved',
            title: `New Reservation: Token Paid ₹${effectiveToken.toLocaleString('en-IN')}`,
            message: `Property ${property_title || `RENT-${property_id}`} has been reserved. Move-in: ${move_in_date}. Booking Ref: ${booking_id}`,
            type: 'booking',
            tab: 'properties',
          });
        }
      } catch (err) {
        console.warn('Socket notification dispatch note:', err.message);
      }

      return res.status(201).json({
        success: true,
        message: `Property reserved successfully! Booking ID: ${booking_id}`,
        data: createdBooking,
      });
    } catch (err) {
      console.error('Error creating tenant booking:', err);
      return res.status(500).json({
        success: false,
        message: 'Server error while reserving property. Please try again.',
      });
    }
  },

  // Get active bookings for logged-in tenant
  getTenantBookings: async (req, res) => {
    try {
      const tenant_id = req.params.tenant_id || req.user?.tenant_id || req.user?.id;
      if (!tenant_id) {
        return res.status(400).json({ success: false, message: 'Tenant ID required.' });
      }

      const bookings = await TenantBooking.getByTenantId(tenant_id);
      return res.status(200).json({
        success: true,
        data: bookings,
      });
    } catch (err) {
      console.error('Error getting tenant bookings:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch bookings.' });
    }
  },

  // Get bookings for a property
  getPropertyBookings: async (req, res) => {
    try {
      const { property_id } = req.params;
      if (!property_id) {
        return res.status(400).json({ success: false, message: 'Property ID required.' });
      }

      const bookings = await TenantBooking.getByPropertyId(property_id);
      return res.status(200).json({
        success: true,
        data: bookings,
      });
    } catch (err) {
      console.error('Error getting property bookings:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch property bookings.' });
    }
  },
};

module.exports = tenantBookingController;
