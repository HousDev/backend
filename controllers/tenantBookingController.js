const TenantBooking = require('../models/tenantBookingModel');
const db = require('../config/database');

const tenantBookingController = {
  // Create a new property booking (stays PENDING — no popup skip)
  createBooking: async (req, res) => {
    try {
      const {
        property_id,
        property_title,
        interest_id = null,
        token_amount,
        move_in_date,
        payment_method = 'UPI',
        monthly_rent = 0,
        security_deposit = 0,
        lock_in_period = '11 Months',
        owner_id = null,
        owner_name = null,
      } = req.body;

      const tenant_id = req.user?.tenant_id || req.user?.id || req.body.tenant_id;
      if (!tenant_id) {
        return res.status(401).json({ success: false, message: 'Tenant authentication required to reserve a property.' });
      }
      if (!property_id) {
        return res.status(400).json({ success: false, message: 'Property ID is required for reservation.' });
      }
      if (!move_in_date) {
        return res.status(400).json({ success: false, message: 'Target move-in date is required.' });
      }

      const effectiveToken = Number(token_amount) || 5000;
      if (effectiveToken <= 0) {
        return res.status(400).json({ success: false, message: 'Advance token amount must be greater than zero.' });
      }

      // Already has active booking for this property? Return it (so popup can re-open)
      const existingTenantBooking = await TenantBooking.checkTenantActiveBooking(tenant_id, property_id);
      if (existingTenantBooking) {
        return res.status(200).json({
          success: true,
          message: 'You already have an active reservation for this property.',
          data: existingTenantBooking,
          isExisting: true,
        });
      }

      const otherReservation = await TenantBooking.checkActivePropertyReservation(property_id);
      if (otherReservation && String(otherReservation.tenant_id) !== String(tenant_id)) {
        return res.status(409).json({ success: false, message: 'This property has already been reserved by another tenant.' });
      }

      const year = new Date().getFullYear();
      const randomSuffix = Math.floor(10000 + Math.random() * 90000);
      const booking_id = `BKG-${year}-${randomSuffix}`;

      const reservation_valid_until = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const bookingData = {
        booking_id,
        tenant_id: Number(tenant_id),
        property_id: Number(property_id),
        owner_id: owner_id ? Number(owner_id) : null,
        interest_id: interest_id ? Number(interest_id) : null,
        monthly_rent: Number(monthly_rent) || 0,
        security_deposit: Number(security_deposit) || 0,
        token_amount: effectiveToken,
        move_in_date,
        lock_in_period,
        reservation_valid_until,
        payment_method,
        payment_status: 'PENDING',   // <-- stays PENDING, popup will handle rest
        booking_status: 'RESERVED',
      };

      const createdBooking = await TenantBooking.create(bookingData);

      // Update tenant profile linkage
      try {
        await db.query(
          'UPDATE tenants SET rental_property_id = ?, property_title = ?, owner_name = ?, status = ? WHERE id = ?',
          [property_id, property_title || `Rental Unit RENT-${property_id}`, owner_name || 'Landlord', 'Interested', tenant_id]
        );
      } catch (err) {
        console.warn('Tenant profile update note:', err.message);
      }

      try {
        if (global.io && owner_id) {
          global.io.to(`user:${owner_id}`).emit('notification', {
            badge: 'Property Reserved',
            title: `New Reservation: Awaiting Payment`,
            message: `Property ${property_title || `RENT-${property_id}`} reserved by tenant. Awaiting token payment. Booking Ref: ${booking_id}`,
            type: 'booking',
            tab: 'inquiries',
          });
        }
      } catch (err) {
        console.warn('Socket notification dispatch note:', err.message);
      }

      return res.status(201).json({
        success: true,
        message: `Property reserved! Booking ID: ${booking_id}. Please complete payment.`,
        data: createdBooking,
      });
    } catch (err) {
      console.error('Error creating tenant booking:', err);
      return res.status(500).json({ success: false, message: 'Server error while reserving property. Please try again.' });
    }
  },

  // Tenant clicks "Yes, I've Paid" in the popup
  claimPayment: async (req, res) => {
    try {
      const { booking_id } = req.params;
      const { payment_reference, payment_notes } = req.body;

      if (!payment_reference) {
        return res.status(400).json({ success: false, message: 'UPI/Bank reference number is required.' });
      }

      const ok = await TenantBooking.claimPayment(booking_id, payment_reference, payment_notes);
      if (!ok) {
        return res.status(404).json({ success: false, message: 'Booking not found or could not be updated.' });
      }

      const booking = await TenantBooking.getByBookingId(booking_id);

      try {
        if (global.io && booking?.owner_id) {
          global.io.to(`user:${booking.owner_id}`).emit('notification', {
            badge: 'Payment Claimed',
            title: `Tenant claims payment for Booking ${booking_id}`,
            message: `Reference: ${payment_reference}. Please verify and confirm.`,
            type: 'payment_claimed',
            tab: 'inquiries',
          });
        }
      } catch (e) { console.warn('Socket note:', e.message); }

      return res.status(200).json({
        success: true,
        message: 'Payment marked as claimed. Owner will verify shortly.',
        data: booking,
      });
    } catch (err) {
      console.error('Error claiming payment:', err);
      return res.status(500).json({ success: false, message: 'Failed to submit payment claim.' });
    }
  },

  // Owner clicks "Verify Payment"
  verifyPayment: async (req, res) => {
    try {
      const { booking_id } = req.params;
      const verified_by_user_id = req.user?.id || req.body.verified_by_user_id || null;

      const ok = await TenantBooking.verifyPayment(booking_id, verified_by_user_id);
      if (!ok) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
      }

      const booking = await TenantBooking.getByBookingId(booking_id);

      try {
        if (global.io) {
          global.io.emit('notification', {
            badge: 'Payment Verified',
            title: `Your payment for Booking ${booking_id} is verified!`,
            message: 'Your property reservation is now confirmed. KYC review starting.',
            type: 'payment_verified',
            tab: 'linked',
          });
        }
      } catch (e) { console.warn('Socket note:', e.message); }

      return res.status(200).json({ success: true, message: 'Payment verified successfully.', data: booking });
    } catch (err) {
      console.error('Error verifying payment:', err);
      return res.status(500).json({ success: false, message: 'Failed to verify payment.' });
    }
  },

  flagPaymentIssue: async (req, res) => {
    try {
      const { booking_id } = req.params;
      const { notes } = req.body;
      const ok = await TenantBooking.flagPaymentIssue(booking_id, notes);
      if (!ok) return res.status(404).json({ success: false, message: 'Booking not found.' });
      return res.status(200).json({ success: true, message: 'Payment issue flagged.' });
    } catch (err) {
      console.error('Error flagging payment issue:', err);
      return res.status(500).json({ success: false, message: 'Failed to flag payment issue.' });
    }
  },

  getTenantBookings: async (req, res) => {
    try {
      const tenant_id = req.params.tenant_id || req.user?.tenant_id || req.user?.id;
      if (!tenant_id) return res.status(400).json({ success: false, message: 'Tenant ID required.' });
      const bookings = await TenantBooking.getByTenantId(tenant_id);
      return res.status(200).json({ success: true, data: bookings });
    } catch (err) {
      console.error('Error getting tenant bookings:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch bookings.' });
    }
  },

  verifyKyc: async (req, res) => {
    try {
      const { booking_id } = req.params;
      const ok = await TenantBooking.verifyKyc(booking_id);
      if (!ok) return res.status(404).json({ success: false, message: 'Booking not found.' });
      const booking = await TenantBooking.getByBookingId(booking_id);
      return res.status(200).json({ success: true, message: 'KYC verified and approved for booking.', data: booking });
    } catch (err) {
      console.error('Error verifying KYC:', err);
      return res.status(500).json({ success: false, message: 'Failed to verify KYC.' });
    }
  },

  rejectKyc: async (req, res) => {
    try {
      const { booking_id } = req.params;
      const { reason } = req.body;
      const ok = await TenantBooking.rejectKyc(booking_id, reason);
      if (!ok) return res.status(404).json({ success: false, message: 'Booking not found.' });
      const booking = await TenantBooking.getByBookingId(booking_id);
      return res.status(200).json({ success: true, message: 'KYC rejected.', data: booking });
    } catch (err) {
      console.error('Error rejecting KYC:', err);
      return res.status(500).json({ success: false, message: 'Failed to reject KYC.' });
    }
  },

  getOwnerBookings: async (req, res) => {
    try {
      const owner_id = req.params.owner_id || req.user?.owner_id || req.user?.id;
      if (!owner_id) return res.status(400).json({ success: false, message: 'Owner ID required.' });
      const bookings = await TenantBooking.getByOwnerId(owner_id);
      return res.status(200).json({ success: true, data: bookings });
    } catch (err) {
      console.error('Error getting owner bookings:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch owner bookings.' });
    }
  },

  getPropertyBookings: async (req, res) => {
    try {
      const { property_id } = req.params;
      if (!property_id) return res.status(400).json({ success: false, message: 'Property ID required.' });
      const bookings = await TenantBooking.getByPropertyId(property_id);
      return res.status(200).json({ success: true, data: bookings });
    } catch (err) {
      console.error('Error getting property bookings:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch property bookings.' });
    }
  },
};

module.exports = tenantBookingController;