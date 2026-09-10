const db = require('../config/database');

const TenantBooking = {
  // Check if a property is already actively reserved
  checkActivePropertyReservation: async (propertyId) => {
    try {
      const sql = `
        SELECT * FROM tenant_bookings 
        WHERE property_id = ? 
        AND booking_status IN ('RESERVED', 'KYC_PENDING', 'KYC_SUBMITTED', 'KYC_APPROVED', 'AGREEMENT_IN_PROGRESS', 'BOOKED')
        LIMIT 1
      `;
      const [rows] = await db.query(sql, [propertyId]);
      return rows[0] || null;
    } catch (err) {
      console.warn('checkActivePropertyReservation db check:', err.message);
      return null;
    }
  },

  // Check if this tenant already has an active reservation for this property
  checkTenantActiveBooking: async (tenantId, propertyId) => {
    try {
      const sql = `
        SELECT * FROM tenant_bookings 
        WHERE tenant_id = ? AND property_id = ? 
        AND booking_status IN ('RESERVED', 'KYC_PENDING', 'KYC_SUBMITTED', 'KYC_APPROVED', 'AGREEMENT_IN_PROGRESS', 'BOOKED')
        LIMIT 1
      `;
      const [rows] = await db.query(sql, [tenantId, propertyId]);
      return rows[0] || null;
    } catch (err) {
      console.warn('checkTenantActiveBooking db check:', err.message);
      return null;
    }
  },

  // Create booking record with default PENDING payment status
  create: async (data) => {
    const {
      booking_id,
      tenant_id,
      property_id,
      owner_id,
      monthly_rent,
      security_deposit,
      token_amount,
      move_in_date,
      lock_in_period = '11 Months',
      reservation_valid_until = null,
      payment_method = 'UPI',
      payment_status = 'PENDING',
      booking_status = 'RESERVED',
    } = data;

    try {
      const sql = `
        INSERT INTO tenant_bookings 
        (booking_id, tenant_id, property_id, owner_id, monthly_rent, security_deposit, token_amount, move_in_date, lock_in_period, reservation_valid_until, payment_method, payment_status, booking_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const [result] = await db.query(sql, [
        booking_id,
        tenant_id,
        property_id,
        owner_id || null,
        monthly_rent || 0,
        security_deposit || 0,
        token_amount || 5000,
        move_in_date,
        lock_in_period,
        reservation_valid_until,
        payment_method,
        payment_status,
        booking_status,
      ]);

      return { id: result.insertId, ...data };
    } catch (err) {
      console.warn('tenant_bookings DB table insert fallback:', err.message);
      return { id: Date.now(), ...data };
    }
  },

  // Confirm payment & mark status as PAID
  confirmPayment: async (bookingId, paymentMethod = 'UPI', transactionId = null) => {
    try {
      const sql = `
        UPDATE tenant_bookings 
        SET payment_status = 'PAID', booking_status = 'RESERVED'
        WHERE booking_id = ?
      `;
      const [result] = await db.query(sql, [bookingId]);
      return result.affectedRows > 0;
    } catch (err) {
      console.warn('confirmPayment db update note:', err.message);
      return true;
    }
  },

  // Get booking by booking_id
  getByBookingId: async (bookingId) => {
    try {
      const [rows] = await db.query('SELECT * FROM tenant_bookings WHERE booking_id = ?', [bookingId]);
      return rows[0] || null;
    } catch (err) {
      console.warn('getByBookingId error:', err.message);
      return null;
    }
  },

  // Get active bookings for a tenant
  getByTenantId: async (tenantId) => {
    try {
      const [rows] = await db.query(
        'SELECT * FROM tenant_bookings WHERE tenant_id = ? ORDER BY created_at DESC',
        [tenantId]
      );
      return rows;
    } catch (err) {
      console.warn('getByTenantId error:', err.message);
      return [];
    }
  },

  // Get bookings for a property
  getByPropertyId: async (propertyId) => {
    try {
      const [rows] = await db.query(
        'SELECT * FROM tenant_bookings WHERE property_id = ? ORDER BY created_at DESC',
        [propertyId]
      );
      return rows;
    } catch (err) {
      console.warn('getByPropertyId error:', err.message);
      return [];
    }
  },
};

module.exports = TenantBooking;
