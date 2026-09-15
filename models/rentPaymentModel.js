const db = require('../config/database');

const rentPaymentModel = {
  // Generate current month due record if not already present
  ensureCurrentMonthRecord: async (lease) => {
    if (!lease || !lease.id) return null;
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const billingMonthDate = `${year}-${month}-01`;

      const dueDay = Math.min(Math.max(Number(lease.rent_due_day) || 5, 1), 28);
      const dueDateStr = `${year}-${month}-${String(dueDay).padStart(2, '0')}`;

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthYearStr = `${monthNames[now.getMonth()]} ${year}`;
      const invoiceNo = `INV-${year}-${month}-${lease.id}`;

      const sql = `
        INSERT IGNORE INTO rent_payments 
        (lease_id, tenant_id, owner_id, invoice_no, billing_month, due_date, amount, payment_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'DUE')
      `;

      await db.query(sql, [
        lease.id,
        lease.tenant_id,
        lease.owner_id,
        invoiceNo,
        billingMonthDate,
        dueDateStr,
        lease.monthly_rent,
      ]);

      const [rows] = await db.query(
        'SELECT * FROM rent_payments WHERE lease_id = ? AND billing_month = ? LIMIT 1',
        [lease.id, billingMonthDate]
      );

      return rows[0] || null;
    } catch (err) {
      console.warn('ensureCurrentMonthRecord error:', err.message);
      return null;
    }
  },

  claimPayment: async ({ leaseId, paymentId, utrNumber, paymentNotes }) => {
    try {
      const sql = `
        UPDATE rent_payments 
        SET payment_status = 'CLAIMED', utr_number = ?, payment_notes = ?, paid_at = NOW()
        WHERE (id = ? OR lease_id = ?) AND payment_status IN ('DUE', 'ISSUE')
      `;
      const [res] = await db.query(sql, [utrNumber, paymentNotes || 'Paid via UPI', paymentId || 0, leaseId || 0]);
      return res.affectedRows > 0;
    } catch (err) {
      console.error('claimPayment error:', err.message);
      return false;
    }
  },

  verifyPayment: async (paymentId, ownerId) => {
    try {
      const sql = `
        UPDATE rent_payments 
        SET payment_status = 'VERIFIED', verified_at = NOW()
        WHERE id = ? AND (owner_id = ? OR ? IS NULL)
      `;
      const [res] = await db.query(sql, [paymentId, ownerId || null, ownerId || null]);
      return res.affectedRows > 0;
    } catch (err) {
      console.error('verifyPayment error:', err.message);
      return false;
    }
  },

  flagPaymentIssue: async (paymentId, ownerId, notes) => {
    try {
      const sql = `
        UPDATE rent_payments 
        SET payment_status = 'ISSUE', payment_notes = ?
        WHERE id = ? AND (owner_id = ? OR ? IS NULL)
      `;
      const [res] = await db.query(sql, [notes || 'Payment not received in bank', paymentId, ownerId || null, ownerId || null]);
      return res.affectedRows > 0;
    } catch (err) {
      console.error('flagPaymentIssue error:', err.message);
      return false;
    }
  },

  getLedgerByLeaseId: async (leaseId) => {
    try {
      const [rows] = await db.query('SELECT * FROM rent_payments WHERE lease_id = ? ORDER BY billing_month DESC', [leaseId]);
      return rows;
    } catch (err) {
      console.warn('getLedgerByLeaseId error:', err.message);
      return [];
    }
  },

  getLedgerByTenantId: async (tenantId) => {
    try {
      const [rows] = await db.query('SELECT * FROM rent_payments WHERE tenant_id = ? ORDER BY billing_month DESC', [tenantId]);
      return rows;
    } catch (err) {
      console.warn('getLedgerByTenantId error:', err.message);
      return [];
    }
  },

  getLedgerByOwnerId: async (ownerId) => {
    try {
      const [rows] = await db.query('SELECT * FROM rent_payments WHERE owner_id = ? ORDER BY billing_month DESC', [ownerId]);
      return rows;
    } catch (err) {
      console.warn('getLedgerByOwnerId error:', err.message);
      return [];
    }
  },
};

module.exports = rentPaymentModel;
