const rentLeaseModel = require('../models/rentLeaseModel');
const rentPaymentModel = require('../models/rentPaymentModel');

const rentLeaseController = {
  getLease: async (req, res) => {
    try {
      const { booking_id } = req.params;
      await rentLeaseModel.initTables();
      const lease = await rentLeaseModel.getLeaseByBookingId(booking_id);
      if (!lease) {
        return res.status(404).json({ success: false, message: 'Active lease configuration not found.' });
      }

      const rentRecord = await rentPaymentModel.ensureCurrentMonthRecord(lease);
      const ledger = await rentPaymentModel.getLedgerByLeaseId(lease.id);

      return res.status(200).json({
        success: true,
        data: {
          lease,
          current_due: rentRecord,
          ledger,
        },
      });
    } catch (err) {
      console.error('getLease error:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch lease configuration.' });
    }
  },

  getTenantLeaseAndLedger: async (req, res) => {
    try {
      const tenant_id = req.params.tenant_id || req.user?.tenant_id || req.user?.id;
      await rentLeaseModel.initTables();
      const lease = await rentLeaseModel.getLeaseByTenantId(tenant_id);
      let currentDue = null;
      let ledger = [];

      if (lease) {
        currentDue = await rentPaymentModel.ensureCurrentMonthRecord(lease);
        ledger = await rentPaymentModel.getLedgerByLeaseId(lease.id);
      }

      return res.status(200).json({
        success: true,
        data: {
          lease,
          current_due: currentDue,
          ledger,
        },
      });
    } catch (err) {
      console.error('getTenantLeaseAndLedger error:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch tenant lease ledger.' });
    }
  },

  claimRentPayment: async (req, res) => {
    try {
      const { booking_id } = req.params;
      const { utr_number, payment_notes, payment_id } = req.body;

      if (!utr_number || !String(utr_number).trim()) {
        return res.status(400).json({ success: false, message: '12-Digit UPI UTR / Transaction Reference Number is required.' });
      }

      await rentLeaseModel.initTables();
      const lease = await rentLeaseModel.getLeaseByBookingId(booking_id);
      if (!lease) {
        return res.status(404).json({ success: false, message: 'Active lease not found for booking.' });
      }

      const updated = await rentPaymentModel.claimPayment({
        leaseId: lease.id,
        paymentId,
        utrNumber: String(utr_number).trim(),
        paymentNotes,
      });

      const currentDue = await rentPaymentModel.ensureCurrentMonthRecord(lease);
      const ledger = await rentPaymentModel.getLedgerByLeaseId(lease.id);

      try {
        if (global.io && lease.owner_id) {
          global.io.to(`user:${lease.owner_id}`).emit('notification', {
            badge: 'Rent Claimed',
            title: `🔔 Tenant Submitted Rent Payment for Booking ${booking_id}`,
            message: `UTR: ${utr_number}. Please verify credit in bank.`,
            type: 'rent_claimed',
            tab: 'inquiries',
          });
        }
      } catch (sErr) { console.warn('Socket note:', sErr.message); }

      return res.status(200).json({
        success: true,
        message: 'Rent payment claimed successfully! Submitted to Landlord for bank verification.',
        data: { lease, current_due: currentDue, ledger },
      });
    } catch (err) {
      console.error('claimRentPayment error:', err);
      return res.status(500).json({ success: false, message: 'Failed to claim rent payment.' });
    }
  },

  verifyRentPayment: async (req, res) => {
    try {
      const { payment_id } = req.params;
      const owner_id = req.user?.owner_id || req.user?.id || req.body.owner_id;

      await rentLeaseModel.initTables();
      const success = await rentPaymentModel.verifyPayment(payment_id, owner_id);

      try {
        if (global.io) {
          global.io.emit('refresh_tenant_bookings', {});
        }
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: 'Rent payment verified & marked PAID in permanent ledger!',
      });
    } catch (err) {
      console.error('verifyRentPayment error:', err);
      return res.status(500).json({ success: false, message: 'Failed to verify rent payment.' });
    }
  },

  flagRentPaymentIssue: async (req, res) => {
    try {
      const { payment_id } = req.params;
      const { notes } = req.body;
      const owner_id = req.user?.owner_id || req.user?.id || req.body.owner_id;

      await rentLeaseModel.initTables();
      await rentPaymentModel.flagPaymentIssue(payment_id, owner_id, notes);

      return res.status(200).json({
        success: true,
        message: 'Payment flagged as issue. Tenant notified.',
      });
    } catch (err) {
      console.error('flagRentPaymentIssue error:', err);
      return res.status(500).json({ success: false, message: 'Failed to flag payment issue.' });
    }
  },
};

module.exports = rentLeaseController;
