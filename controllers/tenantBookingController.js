// const TenantBooking = require('../models/tenantBookingModel');
// const db = require('../config/database');

// const tenantBookingController = {
//   // Create a new property booking (stays PENDING — no popup skip)
//   createBooking: async (req, res) => {
//     try {
//       const {
//         property_id,
//         property_title,
//         interest_id = null,
//         token_amount,
//         move_in_date,
//         payment_method = 'UPI',
//         monthly_rent = 0,
//         security_deposit = 0,
//         lock_in_period = '11 Months',
//         owner_id = null,
//         owner_name = null,
//       } = req.body;

//       const tenant_id = req.user?.tenant_id || req.user?.id || req.body.tenant_id;
//       if (!tenant_id) {
//         return res.status(401).json({ success: false, message: 'Tenant authentication required to reserve a property.' });
//       }
//       if (!property_id) {
//         return res.status(400).json({ success: false, message: 'Property ID is required for reservation.' });
//       }
//       if (!move_in_date) {
//         return res.status(400).json({ success: false, message: 'Target move-in date is required.' });
//       }

//       // Resolve missing owner_id, monthly_rent, or title directly from rental_properties
//       let resolvedOwnerId = owner_id;
//       let resolvedMonthlyRent = Number(monthly_rent) || 0;
//       let resolvedPropertyTitle = property_title;
//       let resolvedOwnerName = owner_name;

//       try {
//         const [propRows] = await db.query(
//           'SELECT id, owner_id, owner_name, monthly_rent, expected_rent, title, society_name, unit_type FROM rental_properties WHERE id = ? LIMIT 1',
//           [property_id]
//         );
//         if (propRows && propRows.length > 0) {
//           const p = propRows[0];
//           if (!resolvedOwnerId) resolvedOwnerId = p.owner_id;
//           if (!resolvedOwnerName) resolvedOwnerName = p.owner_name || 'Landlord';
//           if (!resolvedMonthlyRent) resolvedMonthlyRent = Number(p.monthly_rent || p.expected_rent || 0);
//           if (!resolvedPropertyTitle) {
//             resolvedPropertyTitle = p.society_name ? `${p.unit_type || '2 BHK'} at ${p.society_name}` : (p.title || `Rental Property RENT-${property_id}`);
//           }
//         }
//       } catch (pErr) {
//         console.warn('Property lookup note:', pErr.message);
//       }

//       const effectiveToken = Number(token_amount) > 0 ? Number(token_amount) : 5000;

//       // Already has active booking for this property? Return it (and repair token_amount if was 0)
//       const existingTenantBooking = await TenantBooking.checkTenantActiveBooking(tenant_id, property_id);
//       if (existingTenantBooking) {
//         let needsDbFix = false;
//         if (!existingTenantBooking.token_amount || Number(existingTenantBooking.token_amount) <= 0) {
//           existingTenantBooking.token_amount = effectiveToken;
//           needsDbFix = true;
//         }
//         if (!existingTenantBooking.owner_id && resolvedOwnerId) {
//           existingTenantBooking.owner_id = resolvedOwnerId;
//           needsDbFix = true;
//         }
//         if (!existingTenantBooking.monthly_rent && resolvedMonthlyRent) {
//           existingTenantBooking.monthly_rent = resolvedMonthlyRent;
//           needsDbFix = true;
//         }

//         if (needsDbFix) {
//           try {
//             await db.query(
//               'UPDATE tenant_bookings SET token_amount = ?, owner_id = COALESCE(owner_id, ?), monthly_rent = COALESCE(NULLIF(monthly_rent, 0), ?) WHERE id = ?',
//               [existingTenantBooking.token_amount, resolvedOwnerId, resolvedMonthlyRent, existingTenantBooking.id]
//             );
//           } catch (upErr) {
//             console.warn('Existing booking repair note:', upErr.message);
//           }
//         }

//         return res.status(200).json({
//           success: true,
//           message: 'You already have an active reservation for this property.',
//           data: existingTenantBooking,
//           isExisting: true,
//         });
//       }

//       const otherReservation = await TenantBooking.checkActivePropertyReservation(property_id);
//       if (otherReservation && String(otherReservation.tenant_id) !== String(tenant_id)) {
//         return res.status(409).json({ success: false, message: 'This property has already been reserved by another tenant.' });
//       }

//       const year = new Date().getFullYear();
//       const randomSuffix = Math.floor(10000 + Math.random() * 90000);
//       const booking_id = `BKG-${year}-${randomSuffix}`;

//       const reservation_valid_until = new Date(Date.now() + 48 * 60 * 60 * 1000);

//       const bookingData = {
//         booking_id,
//         tenant_id: Number(tenant_id),
//         property_id: Number(property_id),
//         owner_id: resolvedOwnerId ? Number(resolvedOwnerId) : null,
//         interest_id: interest_id ? Number(interest_id) : null,
//         monthly_rent: resolvedMonthlyRent || 0,
//         security_deposit: Number(security_deposit) || (resolvedMonthlyRent ? resolvedMonthlyRent * 2 : 0),
//         token_amount: effectiveToken,
//         move_in_date,
//         lock_in_period,
//         reservation_valid_until,
//         payment_method,
//         payment_status: 'PENDING',
//         booking_status: 'RESERVED',
//       };

//       const createdBooking = await TenantBooking.create(bookingData);

//       // Update tenant profile linkage
//       try {
//         await db.query(
//           'UPDATE tenants SET rental_property_id = ?, property_title = ?, owner_name = ?, status = ? WHERE id = ?',
//           [property_id, resolvedPropertyTitle || `Rental Unit RENT-${property_id}`, resolvedOwnerName || 'Landlord', 'Interested', tenant_id]
//         );
//       } catch (err) {
//         console.warn('Tenant profile update note:', err.message);
//       }

//       try {
//         if (global.io) {
//           if (resolvedOwnerId) {
//             global.io.to(`user:${resolvedOwnerId}`).emit('notification', {
//               badge: 'Property Reserved',
//               title: `New Reservation: Awaiting Payment`,
//               message: `Property ${resolvedPropertyTitle || `RENT-${property_id}`} reserved by tenant. Awaiting token payment. Booking Ref: ${booking_id}`,
//               type: 'booking',
//               tab: 'inquiries',
//             });
//           }
//           global.io.emit('refresh_tenant_bookings', { tenant_id, owner_id: resolvedOwnerId });
//         }
//       } catch (err) {
//         console.warn('Socket notification dispatch note:', err.message);
//       }

//       return res.status(201).json({
//         success: true,
//         message: `Property reserved! Booking ID: ${booking_id}. Please complete payment.`,
//         data: createdBooking,
//       });
//     } catch (err) {
//       console.error('Error creating tenant booking:', err);
//       return res.status(500).json({ success: false, message: 'Server error while reserving property. Please try again.' });
//     }
//   },

//   // Tenant clicks "Yes, I've Paid" in the popup
//   claimPayment: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       const { payment_reference, payment_notes } = req.body;

//       if (!payment_reference) {
//         return res.status(400).json({ success: false, message: 'UPI/Bank reference number is required.' });
//       }

//       await TenantBooking.claimPayment(booking_id, payment_reference, payment_notes);
//       const booking = await TenantBooking.getByBookingId(booking_id);

//       // Also ensure interest record is updated to TENANT_ACCEPTED if linked
//       if (booking?.interest_id) {
//         try {
//           await db.query(
//             "UPDATE tenant_owner_interests SET status = 'TENANT_ACCEPTED', updated_at = NOW() WHERE id = ?",
//             [booking.interest_id]
//           );
//         } catch (iErr) {
//           console.warn('Interest status update on claim note:', iErr.message);
//         }
//       }

//       try {
//         if (global.io) {
//           if (booking?.owner_id) {
//             global.io.to(`user:${booking.owner_id}`).emit('notification', {
//               badge: 'Payment Claimed',
//               title: `Tenant submitted payment for Booking ${booking_id}`,
//               message: `Reference: ${payment_reference}. Please verify in Enquiries tab.`,
//               type: 'payment_claimed',
//               tab: 'inquiries',
//             });
//           }
//           global.io.emit('refresh_tenant_bookings', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
//           global.io.emit('refresh_interests', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
//         }
//       } catch (e) { console.warn('Socket note:', e.message); }

//       return res.status(200).json({
//         success: true,
//         message: 'Payment marked as claimed. Owner will verify shortly.',
//         data: booking || { booking_id, payment_status: 'CLAIMED', payment_reference },
//       });
//     } catch (err) {
//       console.error('Error claiming payment:', err);
//       return res.status(500).json({ success: false, message: 'Failed to submit payment claim.' });
//     }
//   },

//   // Owner clicks "Verify Payment"
//   verifyPayment: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       const verified_by_user_id = req.user?.id || req.body.verified_by_user_id || null;

//       await TenantBooking.verifyPayment(booking_id, verified_by_user_id);
//       const booking = await TenantBooking.getByBookingId(booking_id);

//       try {
//         if (global.io) {
//           if (booking?.tenant_id) {
//             global.io.to(`user:${booking.tenant_id}`).emit('notification', {
//               badge: 'Payment Verified',
//               title: `Your payment for Booking ${booking_id} is verified!`,
//               message: 'Your reservation is confirmed. KYC review starting.',
//               type: 'payment_verified',
//               tab: 'linked',
//             });
//           }
//           global.io.emit('refresh_tenant_bookings', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
//           global.io.emit('refresh_interests', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
//         }
//       } catch (e) { console.warn('Socket note:', e.message); }

//       return res.status(200).json({
//         success: true,
//         message: 'Payment verified successfully.',
//         data: booking || { booking_id, payment_status: 'VERIFIED', booking_status: 'KYC_PENDING' }
//       });
//     } catch (err) {
//       console.error('Error verifying payment:', err);
//       return res.status(500).json({ success: false, message: 'Failed to verify payment.' });
//     }
//   },

//   flagPaymentIssue: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       const { notes } = req.body;
//       await TenantBooking.flagPaymentIssue(booking_id, notes);
//       const booking = await TenantBooking.getByBookingId(booking_id);
//       return res.status(200).json({ success: true, message: 'Payment issue flagged.', data: booking });
//     } catch (err) {
//       console.error('Error flagging payment issue:', err);
//       return res.status(500).json({ success: false, message: 'Failed to flag payment issue.' });
//     }
//   },

//   getTenantBookings: async (req, res) => {
//     try {
//       const tenant_id = req.params.tenant_id || req.user?.tenant_id || req.user?.id;
//       if (!tenant_id) return res.status(400).json({ success: false, message: 'Tenant ID required.' });
//       const bookings = await TenantBooking.getByTenantId(tenant_id);
//       return res.status(200).json({ success: true, data: bookings });
//     } catch (err) {
//       console.error('Error getting tenant bookings:', err);
//       return res.status(500).json({ success: false, message: 'Failed to fetch bookings.' });
//     }
//   },

//   cancelBooking: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       await TenantBooking.cancelBooking(booking_id);
//       const booking = await TenantBooking.getByBookingId(booking_id);
//       return res.status(200).json({
//         success: true,
//         message: 'Reservation cancelled.',
//         data: booking || { booking_id, booking_status: 'CANCELLED' }
//       });
//     } catch (err) {
//       return res.status(500).json({ success: false, message: 'Failed to cancel booking.' });
//     }
//   },

//   verifyKyc: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       await TenantBooking.verifyKyc(booking_id);
//       const booking = await TenantBooking.getByBookingId(booking_id);
//       return res.status(200).json({
//         success: true,
//         message: 'KYC verified and approved for booking.',
//         data: booking || { booking_id, booking_status: 'KYC_APPROVED' }
//       });
//     } catch (err) {
//       console.error('Error verifying KYC:', err);
//       return res.status(500).json({ success: false, message: 'Failed to verify KYC.' });
//     }
//   },

//   rejectKyc: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       const { reason } = req.body;
//       await TenantBooking.rejectKyc(booking_id, reason);
//       const booking = await TenantBooking.getByBookingId(booking_id);
//       return res.status(200).json({
//         success: true,
//         message: 'KYC rejected.',
//         data: booking || { booking_id, booking_status: 'KYC_REJECTED' }
//       });
//     } catch (err) {
//       console.error('Error rejecting KYC:', err);
//       return res.status(500).json({ success: false, message: 'Failed to reject KYC.' });
//     }
//   },

//   getOwnerBookings: async (req, res) => {
//     try {
//       const owner_id = req.params.owner_id || req.user?.owner_id || req.user?.id;
//       if (!owner_id) return res.status(400).json({ success: false, message: 'Owner ID required.' });
//       const bookings = await TenantBooking.getByOwnerId(owner_id);
//       return res.status(200).json({ success: true, data: bookings });
//     } catch (err) {
//       console.error('Error getting owner bookings:', err);
//       return res.status(500).json({ success: false, message: 'Failed to fetch owner bookings.' });
//     }
//   },

//   getPropertyBookings: async (req, res) => {
//     try {
//       const { property_id } = req.params;
//       if (!property_id) return res.status(400).json({ success: false, message: 'Property ID required.' });
//       const bookings = await TenantBooking.getByPropertyId(property_id);
//       return res.status(200).json({ success: true, data: bookings });
//     } catch (err) {
//       console.error('Error getting property bookings:', err);
//       return res.status(500).json({ success: false, message: 'Failed to fetch property bookings.' });
//     }
//   },


//   requestKyc: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       const booking = await TenantBooking.getByBookingId(booking_id);
//       if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

//       try {
//         if (global.io && booking.tenant_id) {
//           global.io.to(`user:${booking.tenant_id}`).emit('notification', {
//             badge: 'KYC Required',
//             title: 'Owner Requested Your KYC Documents',
//             message: `Please upload your ID proof (Aadhar/PAN) in your Profile tab to proceed with Booking ${booking_id}.`,
//             type: 'kyc_requested',
//             tab: 'profile',
//           });
//         }
//       } catch (e) { console.warn('Socket note:', e.message); }

//       return res.status(200).json({ success: true, message: 'KYC request sent to tenant.' });
//     } catch (err) {
//       console.error('Error requesting KYC:', err);
//       return res.status(500).json({ success: false, message: 'Failed to send KYC request.' });
//     }
//   },

//   uploadAgreement: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       const uploadedUrl = req.file?.publicUrl || (req.file?.filename ? `/uploads/tenants/${req.file.filename}` : null);
//       const agreement_document = uploadedUrl || req.body?.agreement_document || '/agreements/sample_rental_agreement.pdf';

//       await TenantBooking.uploadAgreement(booking_id, agreement_document);
//       const booking = await TenantBooking.getByBookingId(booking_id);

//       try {
//         if (global.io && booking?.tenant_id) {
//           global.io.to(`user:${booking.tenant_id}`).emit('notification', {
//             badge: 'Agreement Ready',
//             title: '📄 Landlord Sent Rental Agreement PDF',
//             message: `Please view & e-sign your rental agreement for Booking ${booking_id} in your Linked Lease tab.`,
//             type: 'agreement_sent',
//             tab: 'linked',
//             agreement_document: agreement_document,
//           });
//         }
//       } catch (e) { console.warn('Socket note:', e.message); }

//       return res.status(200).json({
//         success: true,
//         message: 'Rental agreement sent to tenant for e-sign.',
//         data: { ...(booking || {}), agreement_document }
//       });
//     } catch (err) {
//       console.error('Error uploading agreement:', err);
//       return res.status(500).json({ success: false, message: 'Failed to send agreement.' });
//     }
//   },

//   signAgreement: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       const { tenant_signature_name = 'Tenant', signer_name } = req.body;
//       const signatureName = signer_name || tenant_signature_name;
//       const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

//       await TenantBooking.signAgreement(booking_id, signatureName, ip);
//       const booking = await TenantBooking.getByBookingId(booking_id);

//       try {
//         if (global.io && booking?.owner_id) {
//           global.io.to(`user:${booking.owner_id}`).emit('notification', {
//             badge: 'Agreement Signed',
//             title: `✍️ Tenant Signed Agreement for Booking ${booking_id}`,
//             message: `Tenant ${signatureName} has e-signed the agreement. Please click Activate Tenancy to enable rent ledger.`,
//             type: 'agreement_signed',
//             tab: 'inquiries',
//           });
//         }
//       } catch (e) { console.warn('Socket note:', e.message); }

//       return res.status(200).json({ success: true, message: 'Rental agreement e-signed successfully!', data: booking });
//     } catch (err) {
//       console.error('Error signing agreement:', err);
//       return res.status(500).json({ success: false, message: 'Failed to sign agreement.' });
//     }
//   },

//   finalizeAgreement: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       await TenantBooking.finalizeAgreement(booking_id);
//       const booking = await TenantBooking.getByBookingId(booking_id);

//       try {
//         if (global.io && booking?.tenant_id) {
//           global.io.to(`user:${booking.tenant_id}`).emit('notification', {
//             badge: 'Active Tenancy',
//             title: '🎉 Rental Agreement Finalized!',
//             message: `Your tenancy for Booking ${booking_id} is now ACTIVE. Access your Lease Vault & Rent Ledger anytime!`,
//             type: 'tenancy_activated',
//             tab: 'linked',
//           });
//         }
//       } catch (e) { console.warn('Socket note:', e.message); }

//       return res.status(200).json({
//         success: true,
//         message: 'Rental agreement finalized and tenancy activated!',
//         data: booking || { booking_id, booking_status: 'BOOKED' },
//       });
//     } catch (err) {
//       console.error('Error finalizing agreement:', err);
//       return res.status(500).json({ success: false, message: 'Failed to finalize agreement.' });
//     }
//   },

//   requestKyc: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       await TenantBooking.requestKyc(booking_id);
//       const booking = await TenantBooking.getByBookingId(booking_id);

//       try {
//         if (global.io && booking?.tenant_id) {
//           global.io.to(`user:${booking.tenant_id}`).emit('notification', {
//             badge: 'KYC Requested',
//             title: `🆔 Landlord Requested KYC Documents for Booking ${booking_id}`,
//             message: `Please upload your ID proof (Aadhaar/PAN) in your Tenant Profile or Linked Lease tab.`,
//             type: 'kyc_requested',
//             tab: 'profile',
//           });
//           global.io.emit('refresh_tenant_bookings', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
//         }
//       } catch (e) { console.warn('Socket note:', e.message); }

//       return res.status(200).json({ success: true, message: 'KYC request sent to tenant successfully!', data: booking });
//     } catch (err) {
//       console.error('Error requesting KYC:', err);
//       return res.status(500).json({ success: false, message: 'Failed to request KYC.' });
//     }
//   },

//   verifyKyc: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       await TenantBooking.verifyKyc(booking_id);
//       const booking = await TenantBooking.getByBookingId(booking_id);

//       try {
//         if (global.io && booking?.tenant_id) {
//           global.io.to(`user:${booking.tenant_id}`).emit('notification', {
//             badge: 'KYC Verified',
//             title: `✅ KYC Documents Verified by Landlord!`,
//             message: `Your identity verification for Booking ${booking_id} is complete. Landlord will send the draft agreement soon.`,
//             type: 'kyc_verified',
//             tab: 'linked',
//           });
//           global.io.emit('refresh_tenant_bookings', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
//         }
//       } catch (e) { console.warn('Socket note:', e.message); }

//       return res.status(200).json({ success: true, message: 'KYC verified successfully!', data: booking });
//     } catch (err) {
//       console.error('Error verifying KYC:', err);
//       return res.status(500).json({ success: false, message: 'Failed to verify KYC.' });
//     }
//   },

//   rejectKyc: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       const { reason } = req.body || {};
//       await TenantBooking.rejectKyc(booking_id, reason);
//       const booking = await TenantBooking.getByBookingId(booking_id);

//       try {
//         if (global.io && booking?.tenant_id) {
//           global.io.to(`user:${booking.tenant_id}`).emit('notification', {
//             badge: 'KYC Rejected',
//             title: `⚠️ KYC Document Verification Issue`,
//             message: reason ? `Reason: ${reason}. Please re-upload valid ID proof.` : `Please re-upload valid ID proof in your profile.`,
//             type: 'kyc_rejected',
//             tab: 'profile',
//           });
//           global.io.emit('refresh_tenant_bookings', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
//         }
//       } catch (e) { console.warn('Socket note:', e.message); }

//       return res.status(200).json({ success: true, message: 'KYC rejected and tenant notified.', data: booking });
//     } catch (err) {
//       console.error('Error rejecting KYC:', err);
//       return res.status(500).json({ success: false, message: 'Failed to reject KYC.' });
//     }
//   },

//   cancelBooking: async (req, res) => {
//     try {
//       const { booking_id } = req.params;
//       await TenantBooking.cancelBooking(booking_id);
//       return res.status(200).json({ success: true, message: 'Booking cancelled.' });
//     } catch (err) {
//       console.error('Error cancelling booking:', err);
//       return res.status(500).json({ success: false, message: 'Failed to cancel booking.' });
//     }
//   },
// };

// module.exports = tenantBookingController;


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

      // Resolve missing owner_id, monthly_rent, or title directly from rental_properties
      let resolvedOwnerId = owner_id;
      let resolvedMonthlyRent = Number(monthly_rent) || 0;
      let resolvedPropertyTitle = property_title;
      let resolvedOwnerName = owner_name;

      try {
        const [propRows] = await db.query(
          'SELECT id, owner_id, owner_name, monthly_rent, expected_rent, title, society_name, unit_type FROM rental_properties WHERE id = ? LIMIT 1',
          [property_id]
        );
        if (propRows && propRows.length > 0) {
          const p = propRows[0];
          if (!resolvedOwnerId) resolvedOwnerId = p.owner_id;
          if (!resolvedOwnerName) resolvedOwnerName = p.owner_name || 'Landlord';
          if (!resolvedMonthlyRent) resolvedMonthlyRent = Number(p.monthly_rent || p.expected_rent || 0);
          if (!resolvedPropertyTitle) {
            resolvedPropertyTitle = p.society_name ? `${p.unit_type || '2 BHK'} at ${p.society_name}` : (p.title || `Rental Property RENT-${property_id}`);
          }
        }
      } catch (pErr) {
        console.warn('Property lookup note:', pErr.message);
      }

      const effectiveToken = Number(token_amount) > 0 ? Number(token_amount) : 5000;

      // Already has active booking for this property? Return it (and repair token_amount if was 0)
      const existingTenantBooking = await TenantBooking.checkTenantActiveBooking(tenant_id, property_id);
      if (existingTenantBooking) {
        let needsDbFix = false;
        if (!existingTenantBooking.token_amount || Number(existingTenantBooking.token_amount) <= 0) {
          existingTenantBooking.token_amount = effectiveToken;
          needsDbFix = true;
        }
        if (!existingTenantBooking.owner_id && resolvedOwnerId) {
          existingTenantBooking.owner_id = resolvedOwnerId;
          needsDbFix = true;
        }
        if (!existingTenantBooking.monthly_rent && resolvedMonthlyRent) {
          existingTenantBooking.monthly_rent = resolvedMonthlyRent;
          needsDbFix = true;
        }

        if (needsDbFix) {
          try {
            await db.query(
              'UPDATE tenant_bookings SET token_amount = ?, owner_id = COALESCE(owner_id, ?), monthly_rent = COALESCE(NULLIF(monthly_rent, 0), ?) WHERE id = ?',
              [existingTenantBooking.token_amount, resolvedOwnerId, resolvedMonthlyRent, existingTenantBooking.id]
            );
          } catch (upErr) {
            console.warn('Existing booking repair note:', upErr.message);
          }
        }

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
        owner_id: resolvedOwnerId ? Number(resolvedOwnerId) : null,
        interest_id: interest_id ? Number(interest_id) : null,
        monthly_rent: resolvedMonthlyRent || 0,
        security_deposit: Number(security_deposit) || (resolvedMonthlyRent ? resolvedMonthlyRent * 2 : 0),
        token_amount: effectiveToken,
        move_in_date,
        lock_in_period,
        reservation_valid_until,
        payment_method,
        payment_status: 'PENDING',
        booking_status: 'RESERVED',
      };

      const createdBooking = await TenantBooking.create(bookingData);

      // Update tenant profile linkage
      try {
        await db.query(
          'UPDATE tenants SET rental_property_id = ?, property_title = ?, owner_name = ?, status = ? WHERE id = ?',
          [property_id, resolvedPropertyTitle || `Rental Unit RENT-${property_id}`, resolvedOwnerName || 'Landlord', 'Interested', tenant_id]
        );
      } catch (err) {
        console.warn('Tenant profile update note:', err.message);
      }

      try {
        if (global.io) {
          if (resolvedOwnerId) {
            global.io.to(`user:${resolvedOwnerId}`).emit('notification', {
              badge: 'Property Reserved',
              title: `New Reservation: Awaiting Payment`,
              message: `Property ${resolvedPropertyTitle || `RENT-${property_id}`} reserved by tenant. Awaiting token payment. Booking Ref: ${booking_id}`,
              type: 'booking',
              tab: 'inquiries',
            });
          }
          global.io.emit('refresh_tenant_bookings', { tenant_id, owner_id: resolvedOwnerId });
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

      await TenantBooking.claimPayment(booking_id, payment_reference, payment_notes);
      const booking = await TenantBooking.getByBookingId(booking_id);

      // Also ensure interest record is updated to TENANT_ACCEPTED if linked
      if (booking?.interest_id) {
        try {
          await db.query(
            "UPDATE tenant_owner_interests SET status = 'TENANT_ACCEPTED', updated_at = NOW() WHERE id = ?",
            [booking.interest_id]
          );
        } catch (iErr) {
          console.warn('Interest status update on claim note:', iErr.message);
        }
      }

      try {
        if (global.io) {
          if (booking?.owner_id) {
            global.io.to(`user:${booking.owner_id}`).emit('notification', {
              badge: 'Payment Claimed',
              title: `Tenant submitted payment for Booking ${booking_id}`,
              message: `Reference: ${payment_reference}. Please verify in Enquiries tab.`,
              type: 'payment_claimed',
              tab: 'inquiries',
            });
          }
          global.io.emit('refresh_tenant_bookings', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
          global.io.emit('refresh_interests', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
        }
      } catch (e) { console.warn('Socket note:', e.message); }

      return res.status(200).json({
        success: true,
        message: 'Payment marked as claimed. Owner will verify shortly.',
        data: booking || { booking_id, payment_status: 'CLAIMED', payment_reference },
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

      await TenantBooking.verifyPayment(booking_id, verified_by_user_id);
      const booking = await TenantBooking.getByBookingId(booking_id);

      try {
        if (global.io) {
          if (booking?.tenant_id) {
            global.io.to(`user:${booking.tenant_id}`).emit('notification', {
              badge: 'Payment Verified',
              title: `Your payment for Booking ${booking_id} is verified!`,
              message: 'Your reservation is confirmed. KYC review starting.',
              type: 'payment_verified',
              tab: 'linked',
            });
          }
          global.io.emit('refresh_tenant_bookings', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
          global.io.emit('refresh_interests', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
        }
      } catch (e) { console.warn('Socket note:', e.message); }

      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully.',
        data: booking || { booking_id, payment_status: 'VERIFIED', booking_status: 'KYC_PENDING' }
      });
    } catch (err) {
      console.error('Error verifying payment:', err);
      return res.status(500).json({ success: false, message: 'Failed to verify payment.' });
    }
  },

  flagPaymentIssue: async (req, res) => {
    try {
      const { booking_id } = req.params;
      const { notes } = req.body;
      await TenantBooking.flagPaymentIssue(booking_id, notes);
      const booking = await TenantBooking.getByBookingId(booking_id);
      return res.status(200).json({ success: true, message: 'Payment issue flagged.', data: booking });
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

  cancelBooking: async (req, res) => {
    try {
      const { booking_id } = req.params;
      await TenantBooking.cancelBooking(booking_id);
      const booking = await TenantBooking.getByBookingId(booking_id);
      return res.status(200).json({
        success: true,
        message: 'Reservation cancelled.',
        data: booking || { booking_id, booking_status: 'CANCELLED' }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to cancel booking.' });
    }
  },

  verifyKyc: async (req, res) => {
    try {
      const { booking_id } = req.params;
      await TenantBooking.verifyKyc(booking_id);
      const booking = await TenantBooking.getByBookingId(booking_id);

      try {
        if (global.io && booking?.tenant_id) {
          global.io.to(`user:${booking.tenant_id}`).emit('notification', {
            badge: 'KYC Verified',
            title: `✅ KYC Documents Verified by Landlord!`,
            message: `Your identity verification for Booking ${booking_id} is complete. Landlord will send the draft agreement soon.`,
            type: 'kyc_verified',
            tab: 'linked',
          });
          global.io.emit('refresh_tenant_bookings', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
        }
      } catch (e) { console.warn('Socket note:', e.message); }

      return res.status(200).json({ success: true, message: 'KYC verified successfully!', data: booking });
    } catch (err) {
      console.error('Error verifying KYC:', err);
      return res.status(500).json({ success: false, message: 'Failed to verify KYC.' });
    }
  },

  rejectKyc: async (req, res) => {
    try {
      const { booking_id } = req.params;
      const { reason } = req.body || {};
      await TenantBooking.rejectKyc(booking_id, reason);
      const booking = await TenantBooking.getByBookingId(booking_id);

      try {
        if (global.io && booking?.tenant_id) {
          global.io.to(`user:${booking.tenant_id}`).emit('notification', {
            badge: 'KYC Rejected',
            title: `⚠️ KYC Document Verification Issue`,
            message: reason ? `Reason: ${reason}. Please re-upload valid ID proof.` : `Please re-upload valid ID proof in your profile.`,
            type: 'kyc_rejected',
            tab: 'profile',
          });
          global.io.emit('refresh_tenant_bookings', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
        }
      } catch (e) { console.warn('Socket note:', e.message); }

      return res.status(200).json({ success: true, message: 'KYC rejected and tenant notified.', data: booking });
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

  requestKyc: async (req, res) => {
    try {
      const { booking_id } = req.params;
      await TenantBooking.requestKyc(booking_id);                 // ← added (was missing)
      const booking = await TenantBooking.getByBookingId(booking_id);
      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

      try {
        if (global.io && booking.tenant_id) {
          global.io.to(`user:${booking.tenant_id}`).emit('notification', {
            badge: 'KYC Required',
            title: 'Owner Requested Your KYC Documents',
            message: `Please upload your ID proof (Aadhar/PAN) in your Profile tab to proceed with Booking ${booking_id}.`,
            type: 'kyc_requested',
            tab: 'profile',
          });
          global.io.emit('refresh_tenant_bookings', { tenant_id: booking?.tenant_id, owner_id: booking?.owner_id });
        }
      } catch (e) { console.warn('Socket note:', e.message); }

      return res.status(200).json({ success: true, message: 'KYC request sent to tenant.', data: booking });
    } catch (err) {
      console.error('Error requesting KYC:', err);
      return res.status(500).json({ success: false, message: 'Failed to send KYC request.' });
    }
  },

  uploadAgreement: async (req, res) => {
    try {
      const { booking_id } = req.params;
      const uploadedUrl = req.file?.publicUrl || (req.file?.filename ? `/uploads/tenants/${req.file.filename}` : null);
      const agreement_document = uploadedUrl || req.body?.agreement_document || '/agreements/sample_rental_agreement.pdf';

      await TenantBooking.uploadAgreement(booking_id, agreement_document);
      const booking = await TenantBooking.getByBookingId(booking_id);

      try {
        if (global.io && booking?.tenant_id) {
          global.io.to(`user:${booking.tenant_id}`).emit('notification', {
            badge: 'Agreement Ready',
            title: '📄 Landlord Sent Rental Agreement PDF',
            message: `Please view & e-sign your rental agreement for Booking ${booking_id} in your Linked Lease tab.`,
            type: 'agreement_sent',
            tab: 'linked',
            agreement_document: agreement_document,
          });
        }
      } catch (e) { console.warn('Socket note:', e.message); }

      return res.status(200).json({
        success: true,
        message: 'Rental agreement sent to tenant for e-sign.',
        data: { ...(booking || {}), agreement_document }
      });
    } catch (err) {
      console.error('Error uploading agreement:', err);
      return res.status(500).json({ success: false, message: 'Failed to send agreement.' });
    }
  },

  signAgreement: async (req, res) => {
    try {
      const { booking_id } = req.params;
      const { tenant_signature_name = 'Tenant', signer_name, signature_image } = req.body;
      const signatureName = signer_name || tenant_signature_name;
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

      if (signature_image && signature_image.startsWith('data:image')) {
        try {
          const fs = require('fs');
          const path = require('path');
          const uploadsDir = path.join(__dirname, '../uploads/signatures');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          const base64Data = signature_image.replace(/^data:image\/\w+;base64,/, '');
          const filePath = path.join(uploadsDir, `sig_${booking_id}.png`);
          fs.writeFileSync(filePath, base64Data, 'base64');
        } catch (fErr) {
          console.warn('Error saving signature image:', fErr.message);
        }
      }

      // Fetch current booking info to get agreement PDF document
      const currentBooking = await TenantBooking.getByBookingId(booking_id);
      let stampedPdfUrl = null;

      // Stamp signature PNG onto PDF document using pdf-lib
      try {
        const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
        const fs = require('fs');
        const path = require('path');

        let pdfBytes;
        let sourcePdfPath = currentBooking?.agreement_document;
        if (sourcePdfPath && sourcePdfPath.startsWith('/')) {
          sourcePdfPath = sourcePdfPath.substring(1);
        }
        const fullSourcePath = sourcePdfPath ? path.join(__dirname, '..', sourcePdfPath) : null;

        if (fullSourcePath && fs.existsSync(fullSourcePath) && fullSourcePath.toLowerCase().endsWith('.pdf')) {
          pdfBytes = fs.readFileSync(fullSourcePath);
        } else {
          // Create a clean base PDF agreement document if template not present
          const basePdf = await PDFDocument.create();
          const page = basePdf.addPage([595.28, 841.89]);
          const fontBold = await basePdf.embedFont(StandardFonts.HelveticaBold);
          const fontRegular = await basePdf.embedFont(StandardFonts.Helvetica);

          page.drawText('RESIDENTIAL TENANCY LEASE AGREEMENT', { x: 50, y: 790, size: 16, font: fontBold, color: rgb(0.04, 0.22, 0.34) });
          page.drawText(`Booking Reference: ${booking_id}`, { x: 50, y: 770, size: 10, font: fontBold, color: rgb(0.85, 0.45, 0.1) });
          page.drawText('This Rental Lease Agreement is made between Landlord and Tenant.', { x: 50, y: 745, size: 10, font: fontRegular });
          page.drawText('Terms & Conditions:', { x: 50, y: 720, size: 11, font: fontBold });
          page.drawText('1. The tenant agrees to pay monthly rent promptly on or before the due date.', { x: 50, y: 700, size: 10, font: fontRegular });
          page.drawText('2. The security deposit is refundable upon peaceful handover of premises.', { x: 50, y: 680, size: 10, font: fontRegular });
          page.drawText('3. Premises shall be used exclusively for peaceful residential tenancy.', { x: 50, y: 660, size: 10, font: fontRegular });

          pdfBytes = await basePdf.save();
        }

        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        const { width } = lastPage.getSize();

        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const boxX = width - 240;
        const boxY = 45;
        const boxW = 200;
        const boxH = 95;

        lastPage.drawRectangle({
          x: boxX,
          y: boxY,
          width: boxW,
          height: boxH,
          borderColor: rgb(0.04, 0.22, 0.34),
          borderWidth: 1.5,
          color: rgb(0.97, 0.98, 1.0),
        });

        lastPage.drawText('TENANT E-SIGNATURE STAMP', {
          x: boxX + 10,
          y: boxY + boxH - 15,
          size: 8,
          font: fontBold,
          color: rgb(0.04, 0.22, 0.34),
        });

        if (signature_image && signature_image.startsWith('data:image')) {
          try {
            const base64Data = signature_image.replace(/^data:image\/\w+;base64,/, '');
            const rawBytes = Buffer.from(base64Data, 'base64');
            let pngBuffer = rawBytes;
            try {
              const sharp = require('sharp');
              pngBuffer = await sharp(rawBytes).png().toBuffer();
            } catch (sErr) {
              console.warn('Sharp conversion note:', sErr.message);
            }
            const sigImage = await pdfDoc.embedPng(pngBuffer);
            lastPage.drawImage(sigImage, {
              x: boxX + 15,
              y: boxY + 24,
              width: 170,
              height: 48,
            });
          } catch (iErr) {
            console.warn('Image embed in PDF note:', iErr.message);
            lastPage.drawText(`[ Signed: ${signatureName} ]`, { x: boxX + 15, y: boxY + 40, size: 11, font: fontBold, color: rgb(0.04, 0.22, 0.34) });
          }
        } else {
          lastPage.drawText(`[ Signed: ${signatureName} ]`, { x: boxX + 15, y: boxY + 40, size: 11, font: fontBold, color: rgb(0.04, 0.22, 0.34) });
        }

        lastPage.drawText(`Name: ${signatureName}`, { x: boxX + 10, y: boxY + 12, size: 7.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
        lastPage.drawText(`Signed: ${new Date().toLocaleString('en-IN')}`, { x: boxX + 10, y: boxY + 3, size: 6.5, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

        const stampedBytes = await pdfDoc.save();
        const signedDir = path.join(__dirname, '../uploads/agreements');
        if (!fs.existsSync(signedDir)) {
          fs.mkdirSync(signedDir, { recursive: true });
        }
        const outFileName = `signed_agreement_${booking_id}.pdf`;
        fs.writeFileSync(path.join(signedDir, outFileName), stampedBytes);
        stampedPdfUrl = `/uploads/agreements/${outFileName}`;
      } catch (pdfErr) {
        console.warn('PDF signature stamping note:', pdfErr.message);
      }

      await TenantBooking.signAgreement(booking_id, signatureName, ip, stampedPdfUrl);
      const booking = await TenantBooking.getByBookingId(booking_id);

      try {
        if (global.io && booking?.owner_id) {
          global.io.to(`user:${booking.owner_id}`).emit('notification', {
            badge: 'Agreement Signed',
            title: `✍️ Tenant Signed Agreement for Booking ${booking_id}`,
            message: `Tenant ${signatureName} has e-signed the agreement. Please click Activate Tenancy to enable rent ledger.`,
            type: 'agreement_signed',
            tab: 'inquiries',
          });
        }
      } catch (e) { console.warn('Socket note:', e.message); }

      return res.status(200).json({ success: true, message: 'Rental agreement e-signed and PDF stamped successfully!', data: booking });
    } catch (err) {
      console.error('Error signing agreement:', err);
      return res.status(500).json({ success: false, message: 'Failed to sign agreement.' });
    }
  },

  finalizeAgreement: async (req, res) => {
    try {
      const { booking_id } = req.params;
      const { rent_due_day = 5, owner_upi_id = null, owner_qr_code_url = null } = req.body || {};

      await TenantBooking.finalizeAgreement(booking_id);
      const booking = await TenantBooking.getByBookingId(booking_id);

      // Initialize tenant_leases & rent_payments if booking exists
      let lease = null;
      let rentRecord = null;
      if (booking) {
        try {
          const rentLeaseModel = require('../models/rentLeaseModel');
          const rentPaymentModel = require('../models/rentPaymentModel');
          await rentLeaseModel.initTables();

          lease = await rentLeaseModel.createOrUpdateLease({
            booking_id: booking.booking_id || booking_id,
            tenant_id: booking.tenant_id,
            owner_id: booking.owner_id,
            property_id: booking.property_id,
            monthly_rent: booking.monthly_rent || booking.prop_monthly_rent || 25000,
            rent_due_day: Number(rent_due_day) || 5,
            owner_upi_id: owner_upi_id || null,
            owner_qr_code_url: owner_qr_code_url || null,
          });

          if (lease) {
            rentRecord = await rentPaymentModel.ensureCurrentMonthRecord(lease);
          }
        } catch (lErr) {
          console.warn('Lease init note:', lErr.message);
        }
      }

      try {
        if (global.io && booking?.tenant_id) {
          global.io.to(`user:${booking.tenant_id}`).emit('notification', {
            badge: 'Active Tenancy',
            title: '🎉 Rental Agreement Finalized!',
            message: `Your tenancy for Booking ${booking_id} is now ACTIVE. Access your Rent Pay & Ledger anytime!`,
            type: 'tenancy_activated',
            tab: 'linked',
          });
        }
      } catch (e) { console.warn('Socket note:', e.message); }

      return res.status(200).json({
        success: true,
        message: 'Rental agreement finalized and tenancy activated!',
        data: { ...(booking || { booking_id, booking_status: 'BOOKED' }), lease, rent_record: rentRecord },
      });
    } catch (err) {
      console.error('Error finalizing agreement:', err);
      return res.status(500).json({ success: false, message: 'Failed to finalize agreement.' });
    }
  },
};

module.exports = tenantBookingController;