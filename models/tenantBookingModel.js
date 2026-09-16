const db = require('../config/database');

async function enrichBooking(b) {
  if (!b) return b;
  try {
    if (b.booking_status === 'AGREEMENT_IN_PROGRESS' || b.booking_status === 'AGREEMENT_SENT' || b.booking_status === 'AGREEMENT_SIGNED') {
      if (b.agreement_signed_by && String(b.agreement_signed_by).trim() !== '') {
        b.booking_status = 'AGREEMENT_SIGNED';
      } else {
        b.booking_status = 'AGREEMENT_SENT';
      }
    }

    const [users] = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [b.tenant_id]);
    const user = users[0] || null;

    const userEmail = user?.email || null;
    const userPhone = user?.phone || null;

    const [tenants] = await db.query(
      `SELECT * FROM tenants 
       WHERE id = ? OR tenant_id = ? ${userEmail ? 'OR email = ?' : ''} ${userPhone ? 'OR phone = ?' : ''}
       ORDER BY CASE WHEN id_proof_document IS NOT NULL AND TRIM(id_proof_document) != '' THEN 1 ELSE 2 END, id DESC
       LIMIT 1`,
      userEmail && userPhone ? [b.tenant_id, b.tenant_id, userEmail, userPhone] :
      userEmail ? [b.tenant_id, b.tenant_id, userEmail] :
      userPhone ? [b.tenant_id, b.tenant_id, userPhone] : [b.tenant_id, b.tenant_id]
    );
    const tenant = tenants[0] || null;

    b.tenant_name = tenant?.name || (user ? [user.salutation, user.first_name, user.last_name].filter(Boolean).join(' ') || user.username : null) || `Tenant #${b.tenant_id}`;
    b.tenant_email = tenant?.email || userEmail || null;
    b.tenant_phone = tenant?.phone || userPhone || null;
    b.kyc_status = tenant?.kyc_status || 'KYC_PENDING';
    b.id_proof_type = tenant?.id_proof_type || 'Aadhaar';
    b.id_proof_number = tenant?.id_proof_number || '';
    b.id_proof_document = tenant?.id_proof_document || null;
    b.kyc_verified_at = tenant?.kyc_verified_at || null;

    try {
      const fs = require('fs');
      const path = require('path');
      const sigFile1 = path.join(__dirname, `../uploads/signatures/sig_${b.booking_id}.png`);
      const sigFile2 = path.join(__dirname, `../uploads/signatures/sig_${b.id}.png`);
      if (fs.existsSync(sigFile1)) {
        b.signature_image_url = `/uploads/signatures/sig_${b.booking_id}.png`;
      } else if (fs.existsSync(sigFile2)) {
        b.signature_image_url = `/uploads/signatures/sig_${b.id}.png`;
      }
    } catch (_) {}
  } catch (e) {
    console.warn('enrichBooking error:', e.message);
  }
  return b;
}

const TenantBooking = {
  checkActivePropertyReservation: async (propertyId) => {
    try {
      const sql = `
        SELECT * FROM tenant_bookings 
        WHERE property_id = ? 
        AND booking_status IN ('RESERVED', 'KYC_PENDING', 'KYC_SUBMITTED', 'KYC_APPROVED', 'AGREEMENT_IN_PROGRESS', 'AGREEMENT_SENT', 'AGREEMENT_SIGNED', 'BOOKED')
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
        AND booking_status IN ('RESERVED', 'KYC_PENDING', 'KYC_SUBMITTED', 'KYC_APPROVED', 'AGREEMENT_IN_PROGRESS', 'AGREEMENT_SENT', 'AGREEMENT_SIGNED', 'BOOKED')
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
      const cleanId = String(bookingId || '').trim();
      const rawNumber = Number(cleanId.replace(/\D/g, '')) || 0;
      const [rows] = await db.query(
        `SELECT b.*, 
                COALESCE(p.society_name, p.property_type_name, 'Rental Property') as property_title, 
                p.society_name as society_name, 
                p.unit_type as unit_type, 
                p.monthly_rent as prop_monthly_rent
         FROM tenant_bookings b 
         LEFT JOIN rental_properties p ON b.property_id = p.id
         WHERE b.booking_id = ? OR b.id = ? OR b.booking_id LIKE ?
         ORDER BY b.id DESC
         LIMIT 1`,
        [cleanId, rawNumber, `%${cleanId.replace('BKG-', '')}%`]
      );
      if (rows[0]) {
        return await enrichBooking(rows[0]);
      }
      const [fallback] = await db.query('SELECT * FROM tenant_bookings WHERE booking_id = ?', [cleanId]);
      if (fallback[0]) {
        return await enrichBooking(fallback[0]);
      }
      return null;
    } catch (err) {
      console.warn('getByBookingId error:', err.message);
      return null;
    }
  },

  getByTenantId: async (tenantId) => {
    try {
      const cleanId = String(tenantId || '').trim();
      const rawNumber = Number(cleanId.replace(/\D/g, '')) || 0;
      const [rows] = await db.query(
        `SELECT b.*, 
                COALESCE(p.society_name, p.property_type_name, 'Rental Property') as property_title, 
                p.society_name as society_name, 
                p.unit_type as unit_type, 
                p.monthly_rent as prop_monthly_rent
         FROM tenant_bookings b 
         LEFT JOIN rental_properties p ON b.property_id = p.id
         WHERE b.tenant_id = ? OR b.tenant_id = ?
         ORDER BY b.created_at DESC`,
        [cleanId, rawNumber]
      );
      for (let i = 0; i < rows.length; i++) {
        rows[i] = await enrichBooking(rows[i]);
      }
      return rows;
    } catch (err) {
      console.warn('getByTenantId error:', err.message);
      return [];
    }
  },

  getByOwnerId: async (ownerId) => {
    try {
      const cleanId = String(ownerId || '').trim();
      const rawNumber = Number(cleanId.replace(/\D/g, '')) || 0;
      const [rows] = await db.query(
        `SELECT b.*, 
                COALESCE(p.society_name, p.property_type_name, 'Rental Property') as property_title, 
                p.society_name as society_name, 
                p.unit_type as unit_type, 
                p.monthly_rent as prop_monthly_rent
         FROM tenant_bookings b 
         LEFT JOIN rental_properties p ON b.property_id = p.id
         WHERE b.owner_id = ? OR b.owner_id = ? OR p.owner_id = ? OR p.owner_id = ?
         ORDER BY b.created_at DESC`,
        [cleanId, rawNumber, cleanId, rawNumber]
      );
      for (let i = 0; i < rows.length; i++) {
        rows[i] = await enrichBooking(rows[i]);
      }
      return rows;
    } catch (err) {
      console.warn('getByOwnerId error:', err.message);
      return [];
    }
  },

  verifyKyc: async (bookingId) => {
    try {
      const cleanId = String(bookingId || '').trim();
      const rawNumber = Number(cleanId.replace(/\D/g, '')) || 0;
      const [result] = await db.query(
        "UPDATE tenant_bookings SET booking_status = 'KYC_APPROVED' WHERE booking_id = ? OR id = ?",
        [cleanId, rawNumber]
      );
      const [bookingRows] = await db.query("SELECT tenant_id FROM tenant_bookings WHERE booking_id = ? OR id = ?", [cleanId, rawNumber]);
      if (bookingRows.length > 0 && bookingRows[0].tenant_id) {
        await db.query(
          "UPDATE tenants SET kyc_status = 'KYC_VERIFIED', kyc_verified_at = NOW() WHERE id = ? OR tenant_id = ?",
          [bookingRows[0].tenant_id, bookingRows[0].tenant_id]
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
      const cleanId = String(bookingId || '').trim();
      const rawNumber = Number(cleanId.replace(/\D/g, '')) || 0;
      const [result] = await db.query(
        "UPDATE tenant_bookings SET booking_status = 'KYC_REJECTED' WHERE booking_id = ? OR id = ?",
        [cleanId, rawNumber]
      );
      const [bookingRows] = await db.query("SELECT tenant_id FROM tenant_bookings WHERE booking_id = ? OR id = ?", [cleanId, rawNumber]);
      if (bookingRows.length > 0 && bookingRows[0].tenant_id) {
        await db.query(
          "UPDATE tenants SET kyc_status = 'KYC_REJECTED', kyc_rejection_reason = ? WHERE id = ? OR tenant_id = ?",
          [reason, bookingRows[0].tenant_id, bookingRows[0].tenant_id]
        );
      }
      return result.affectedRows > 0;
    } catch (err) {
      console.warn('rejectKyc error:', err.message);
      return false;
    }
  },

  requestKyc: async (bookingId) => {
    try {
      const cleanId = String(bookingId || '').trim();
      const rawNumber = Number(cleanId.replace(/\D/g, '')) || 0;
      await db.query(
        "UPDATE tenant_bookings SET booking_status = 'KYC_PENDING' WHERE booking_id = ? OR id = ?",
        [cleanId, rawNumber]
      );
      return true;
    } catch (err) {
      console.warn('requestKyc error:', err.message);
      return true;
    }
  },

  uploadAgreement: async (bookingId, agreementDocument) => {
    try {
      const cleanId = String(bookingId || '').trim();
      const rawNumber = Number(cleanId.replace(/\D/g, '')) || 0;
      const sql = `
        UPDATE tenant_bookings 
        SET agreement_document = ?, booking_status = 'AGREEMENT_IN_PROGRESS', agreement_signed_by = NULL, agreement_signed_at = NULL
        WHERE booking_id = ? OR id = ?
      `;
      const [result] = await db.query(sql, [agreementDocument, cleanId, rawNumber]);
      return result.affectedRows > 0;
    } catch (err) {
      console.warn('uploadAgreement error:', err.message);
      return false;
    }
  },

  signAgreement: async (bookingId, signatureName, ip, agreementDocument = null) => {
    try {
      const cleanId = String(bookingId || '').trim();
      const rawNumber = Number(cleanId.replace(/\D/g, '')) || 0;
      let sql, params;
      if (agreementDocument) {
        sql = `
          UPDATE tenant_bookings 
          SET agreement_signed_by = ?, agreement_signed_at = NOW(), agreement_signed_ip = ?, agreement_document = ?, booking_status = 'AGREEMENT_IN_PROGRESS'
          WHERE booking_id = ? OR id = ?
        `;
        params = [signatureName, ip, agreementDocument, cleanId, rawNumber];
      } else {
        sql = `
          UPDATE tenant_bookings 
          SET agreement_signed_by = ?, agreement_signed_at = NOW(), agreement_signed_ip = ?, booking_status = 'AGREEMENT_IN_PROGRESS'
          WHERE booking_id = ? OR id = ?
        `;
        params = [signatureName, ip, cleanId, rawNumber];
      }
      const [result] = await db.query(sql, params);
      return result.affectedRows > 0;
    } catch (err) {
      console.warn('signAgreement error:', err.message);
      return false;
    }
  },

  finalizeAgreement: async (bookingId) => {
    try {
      const cleanId = String(bookingId || '').trim();
      const rawNumber = Number(cleanId.replace(/\D/g, '')) || 0;
      const sql = `
        UPDATE tenant_bookings 
        SET booking_status = 'BOOKED', tenancy_activated_at = NOW()
        WHERE booking_id = ? OR id = ?
      `;
      const [result] = await db.query(sql, [cleanId, rawNumber]);
      return result.affectedRows > 0;
    } catch (err) {
      console.warn('finalizeAgreement error:', err.message);
      return false;
    }
  },

  getByPropertyId: async (propertyId) => {
    try {
      const [rows] = await db.query(
        `SELECT b.*, 
                COALESCE(p.society_name, p.property_type_name, 'Rental Property') as property_title, 
                p.society_name as society_name, 
                p.unit_type as unit_type, 
                p.monthly_rent as prop_monthly_rent
         FROM tenant_bookings b 
         LEFT JOIN rental_properties p ON b.property_id = p.id
         WHERE b.property_id = ?
         ORDER BY b.created_at DESC`,
        [propertyId]
      );
      for (let i = 0; i < rows.length; i++) {
        rows[i] = await enrichBooking(rows[i]);
      }
      return rows;
    } catch (err) {
      console.warn('getByPropertyId error:', err.message);
      return [];
    }
  },

  cancelBooking: async (bookingId, reason = '') => {
    try {
      const cleanId = String(bookingId || '').trim();
      const rawNumber = Number(cleanId.replace(/\D/g, '')) || 0;
      await db.query(
        "UPDATE tenant_bookings SET booking_status = 'CANCELLED' WHERE booking_id = ? OR id = ?",
        [cleanId, rawNumber]
      );
      return true;
    } catch (err) {
      console.warn('cancel error:', err.message);
      return false;
    }
  },
};

module.exports = TenantBooking;