const db = require('../config/database');

const TenantBooking = {
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

  create: async (data) => {
    const {
      booking_id,
      tenant_id,
      property_id,
      owner_id,
      interest_id = null,
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
        (booking_id, tenant_id, property_id, owner_id, interest_id, monthly_rent, security_deposit, token_amount, move_in_date, lock_in_period, reservation_valid_until, payment_method, payment_status, booking_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const [result] = await db.query(sql, [
        booking_id,
        tenant_id,
        property_id,
        owner_id || null,
        interest_id,
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
      console.error('tenant_bookings insert error:', err.message);
      if (err.code === 'ER_BAD_FIELD_ERROR' || err.message?.includes('Unknown column')) {
        console.warn('Fallback insert without interest_id column...');
        const fallbackSql = `
          INSERT INTO tenant_bookings 
          (booking_id, tenant_id, property_id, owner_id, monthly_rent, security_deposit, token_amount, move_in_date, lock_in_period, reservation_valid_until, payment_method, payment_status, booking_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(fallbackSql, [
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
      }
      throw err;
    }
  },

  // Tenant clicks "Yes, I've Paid" -> PENDING -> CLAIMED
  claimPayment: async (bookingId, paymentReference, paymentNotes = null) => {
    try {
      const sql = `
        UPDATE tenant_bookings 
        SET payment_status = 'CLAIMED', payment_reference = ?, payment_notes = ?, payment_claimed_at = NOW()
        WHERE booking_id = ?
      `;
      const [result] = await db.query(sql, [paymentReference, paymentNotes, bookingId]);
      return result.affectedRows > 0;
    } catch (err) {
      console.warn('claimPayment db update note:', err.message);
      return false;
    }
  },

  // Owner clicks "Verify Payment" -> CLAIMED -> VERIFIED
  verifyPayment: async (bookingId, verifiedByUserId) => {
    try {
      const sql = `
        UPDATE tenant_bookings 
        SET payment_status = 'VERIFIED', payment_verified_at = NOW(), verified_by_user_id = ?, booking_status = 'KYC_PENDING'
        WHERE booking_id = ?
      `;
      const [result] = await db.query(sql, [verifiedByUserId || null, bookingId]);
      return result.affectedRows > 0;
    } catch (err) {
      console.warn('verifyPayment db update note:', err.message);
      return false;
    }
  },

  flagPaymentIssue: async (bookingId, notes = null) => {
    try {
      const sql = `UPDATE tenant_bookings SET payment_status = 'ISSUE', payment_notes = ? WHERE booking_id = ?`;
      const [result] = await db.query(sql, [notes, bookingId]);
      return result.affectedRows > 0;
    } catch (err) {
      console.warn('flagPaymentIssue db update note:', err.message);
      return false;
    }
  },

  getByBookingId: async (bookingId) => {
    try {
      const [rows] = await db.query('SELECT * FROM tenant_bookings WHERE booking_id = ?', [bookingId]);
      return rows[0] || null;
    } catch (err) {
      console.warn('getByBookingId error:', err.message);
      return null;
    }
  },

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

  getByOwnerId: async (ownerId) => {
    try {
      const [rows] = await db.query(
        `SELECT b.*, t.full_name as tenant_name, t.email as tenant_email, t.phone as tenant_phone, t.kyc_status, t.id_proof_type, t.id_proof_number, t.id_proof_document 
         FROM tenant_bookings b 
         LEFT JOIN tenants t ON b.tenant_id = t.id 
         WHERE b.owner_id = ? 
         ORDER BY b.created_at DESC`,
        [ownerId]
      );
      return rows;
    } catch (err) {
      console.warn('getByOwnerId error:', err.message);
      return [];
    }
  },

  verifyKyc: async (bookingId) => {
    try {
      const [result] = await db.query(
        "UPDATE tenant_bookings SET booking_status = 'KYC_APPROVED' WHERE booking_id = ?",
        [bookingId]
      );
      const [bookingRows] = await db.query("SELECT tenant_id FROM tenant_bookings WHERE booking_id = ?", [bookingId]);
      if (bookingRows.length > 0 && bookingRows[0].tenant_id) {
        await db.query(
          "UPDATE tenants SET kyc_status = 'KYC_VERIFIED', kyc_verified_at = NOW() WHERE id = ?",
          [bookingRows[0].tenant_id]
        );
      }
      return result.affectedRows > 0;
    } catch (err) {
      console.warn('verifyKyc error:', err.message);
      return false;
    }
  },

  rejectKyc: async (bookingId, reason = null) => {
    try {
      const [result] = await db.query(
        "UPDATE tenant_bookings SET booking_status = 'KYC_REJECTED' WHERE booking_id = ?",
        [bookingId]
      );
      const [bookingRows] = await db.query("SELECT tenant_id FROM tenant_bookings WHERE booking_id = ?", [bookingId]);
      if (bookingRows.length > 0 && bookingRows[0].tenant_id) {
        await db.query(
          "UPDATE tenants SET kyc_status = 'KYC_REJECTED', kyc_rejection_reason = ? WHERE id = ?",
          [reason, bookingRows[0].tenant_id]
        );
      }
      return result.affectedRows > 0;
    } catch (err) {
      console.warn('rejectKyc error:', err.message);
      return false;
    }
  },
};

module.exports = TenantBooking;