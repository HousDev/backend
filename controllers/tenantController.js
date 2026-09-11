const Tenant = require("../models/Tenant");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const db = require("../config/database");
const { geocodeAddress } = require("../utils/geocoder");
const { clearUserFromCache } = require("../middleware/authJwt");

async function geocodeTenantLocations(locStr) {
  if (!locStr) return null;
  const locations = String(locStr).split(/[;,]+/).map(s => s.trim()).filter(Boolean);
  if (locations.length === 0) return null;
  const coords = [];
  for (const loc of locations) {
    try {
      const geo = await geocodeAddress(`${loc}, Pune, Maharashtra`);
      if (geo && geo.latitude && geo.longitude) {
        coords.push({ name: loc, lat: geo.latitude, lng: geo.longitude });
      }
    } catch (e) {
      console.error(`Geocoding error for tenant location ${loc}:`, e);
    }
  }
  return coords.length > 0 ? JSON.stringify(coords) : null;
}

const getTenants = async (req, res) => {
  try {
    const tenants = await Tenant.getAll();
    return res.status(200).json({ success: true, data: tenants });
  } catch (err) {
    console.error("Get tenants error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch tenants" });
  }
};

const getTenantById = async (req, res) => {
  try {
    const requestedId = req.params.id;
    let tenant = null;

    try {
      tenant = await Tenant.getById(requestedId);
    } catch (e) {
      console.warn("Tenant.getById error:", e.message);
    }

    if (!tenant) {
      try {
        const [rows] = await db.query(
          `SELECT t.id FROM tenants t
           LEFT JOIN users u ON (LOWER(u.email) = LOWER(t.email) OR u.phone = t.phone)
           WHERE t.id = ? OR u.id = ? OR LOWER(t.email) = LOWER(?) OR t.tenant_id = ? LIMIT 1`,
          [requestedId, requestedId, requestedId, requestedId]
        );
        if (rows && rows.length > 0 && rows[0].id) {
          tenant = await Tenant.getById(rows[0].id);
        }
      } catch (e) {
        console.warn("Fallback query 1 error:", e.message);
      }
    }

    if (!tenant) {
      try {
        const [uRows] = await db.query(
          `SELECT * FROM users WHERE id = ? OR LOWER(email) = LOWER(?) OR phone = ? LIMIT 1`,
          [requestedId, requestedId, requestedId]
        );
        if (uRows && uRows.length > 0) {
          const u = uRows[0];
          // Check if there is already a tenant by user email
          const [tRows] = await db.query(
            `SELECT id FROM tenants WHERE LOWER(email) = LOWER(?) OR phone = ? LIMIT 1`,
            [u.email, u.phone]
          );
          if (tRows && tRows.length > 0) {
            tenant = await Tenant.getById(tRows[0].id);
          } else {
            // Auto-create tenant entry in tenants table so preferences can be stored and persisted
            const created = await Tenant.create({
              name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || 'Tenant',
              email: u.email,
              phone: u.phone,
              whatsapp: u.whatsapp || u.phone,
              status: 'Active Search',
            });
            tenant = created || {
              id: u.id,
              tenant_id: `TEN${String(u.id).padStart(4, '0')}`,
              name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || 'Tenant',
              email: u.email,
              phone: u.phone,
              whatsapp: u.whatsapp || u.phone,
              status: 'Active Search',
              username: u.username
            };
          }
        }
      } catch (e) {
        console.warn("User fallback error:", e.message);
      }
    }

    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }
    return res.status(200).json({ success: true, data: tenant, tenant: tenant });
  } catch (err) {
    console.error("Get tenant by id error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch tenant: " + (err.message || "") });
  }
};

const createTenant = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.phone) {
      return res.status(400).json({ success: false, message: "Name and Phone are required." });
    }

    // Save tenant immediately without waiting for geocoding
    const tenant = await Tenant.create(body);
    if (!tenant) {
      return res.status(500).json({ success: false, message: "Failed to create tenant" });
    }

    // Fire-and-forget geocoding in background after response
    if (body.preferred_location) {
      setImmediate(async () => {
        try {
          const coords = await geocodeTenantLocations(body.preferred_location);
          if (coords) {
            await Tenant.update(tenant.id, { preferred_locations_coords: coords });
          }
        } catch (e) {
          console.error('Background geocoding failed for tenant:', tenant.id, e.message);
        }
      });
    }

    return res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    console.error("Create tenant error:", err);
    return res.status(500).json({ success: false, message: "Failed to create tenant: " + (err.message || '') });
  }
};

const updateTenant = async (req, res) => {
  try {
    const rawId = req.params.id;
    const body = req.body || {};

    let tenantId = Number(rawId);
    let existingTenant = null;

    try {
      if (tenantId) {
        existingTenant = await Tenant.getById(tenantId);
      }
    } catch (e) {}

    if (!existingTenant) {
      try {
        const [rows] = await db.query(
          `SELECT t.id FROM tenants t
           LEFT JOIN users u ON (LOWER(u.email) = LOWER(t.email) OR u.phone = t.phone)
           WHERE t.id = ? OR u.id = ? OR LOWER(t.email) = LOWER(?) OR LOWER(t.phone) = LOWER(?) LIMIT 1`,
          [rawId, rawId, rawId, rawId]
        );
        if (rows && rows.length > 0 && rows[0].id) {
          tenantId = rows[0].id;
          existingTenant = await Tenant.getById(tenantId);
        }
      } catch (e) {}
    }

    // If still no existing tenant in tenants table, check users table and auto-create tenant entry
    if (!existingTenant) {
      try {
        const [uRows] = await db.query(
          `SELECT * FROM users WHERE id = ? OR LOWER(email) = LOWER(?) OR phone = ? LIMIT 1`,
          [rawId, rawId, rawId]
        );
        if (uRows && uRows.length > 0) {
          const u = uRows[0];
          existingTenant = await Tenant.create({
            name: body.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || 'Tenant',
            email: body.email || u.email,
            phone: body.phone || u.phone,
            whatsapp: body.whatsapp || u.whatsapp || u.phone,
            ...body,
          });
          tenantId = existingTenant?.id;
        }
      } catch (createErr) {
        console.warn("Auto tenant creation during update error:", createErr.message);
      }
    }

    if (!existingTenant && !tenantId) {
      // Last resort fallback creation if name & phone are in body
      if (body.name || body.email || body.phone) {
        existingTenant = await Tenant.create(body);
        tenantId = existingTenant?.id;
      } else {
        return res.status(404).json({ success: false, message: "Tenant record not found" });
      }
    }

    const actualId = existingTenant?.id || tenantId;

    // Check if location changed — geocode in background after save
    const locationChanged = !!body.preferred_location && !body.preferred_locations_coords;
    
    // Check if property linking/unlinking is happening
    const isLinking = body.rental_property_id !== undefined;

    await Tenant.update(actualId, body);
    const updated = await Tenant.getById(actualId);

    // If linking changed, log it in tenant activities
    if (isLinking && existingTenant && String(existingTenant.rental_property_id) !== String(updated?.rental_property_id)) {
      try {
        const tenantActivityModel = require("../models/tenantActivityModel");
        if (updated?.rental_property_id) {
          await tenantActivityModel.create({
            tenant_id: actualId,
            activity_type: "Property Linked",
            notes: `Linked rental property RENT-${updated.rental_property_id} (${updated.property_title || ''})`,
          });
        } else {
          await tenantActivityModel.create({
            tenant_id: actualId,
            activity_type: "Property Unlinked",
            notes: `Unlinked rental property RENT-${existingTenant.rental_property_id} (${existingTenant.property_title || ''})`,
          });
        }
      } catch (actErr) {
        console.warn("Tenant activity link note:", actErr.message);
      }
    }

    // Fire-and-forget geocoding in background
    if (locationChanged) {
      setImmediate(async () => {
        try {
          const coords = await geocodeTenantLocations(body.preferred_location);
          if (coords) {
            await Tenant.update(actualId, { preferred_locations_coords: coords });
          }
        } catch (e) {
          console.error('Background geocoding failed for tenant update:', actualId, e.message);
        }
      });
    }

    return res.status(200).json({ success: true, data: updated || existingTenant });
  } catch (err) {
    console.error("Update tenant error:", err);
    return res.status(500).json({ success: false, message: "Failed to update tenant: " + (err.message || '') });
  }
};

const deleteTenant = async (req, res) => {
  try {
    const tenantId = req.params.id;
    let tenant = null;
    try {
      tenant = await Tenant.getById(tenantId);
    } catch (e) {}

    if (!tenant) {
      try {
        const [rows] = await db.query("SELECT * FROM tenants WHERE id = ? LIMIT 1", [tenantId]);
        if (rows && rows.length > 0) tenant = rows[0];
      } catch (e) {}
    }

    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }

    // 1. Clean up related tenant records
    try {
      await db.query("DELETE FROM tenant_activities WHERE tenant_id = ?", [tenantId]);
    } catch (e) {}
    try {
      await db.query("DELETE FROM tenant_visits WHERE tenant_id = ?", [tenantId]);
    } catch (e) {}
    try {
      await db.query("DELETE FROM tenant_followups WHERE tenant_id = ?", [tenantId]);
    } catch (e) {}

    // 2. Delete corresponding user(s) from users table if role is 'tenant'
    if (tenant.email) {
      try {
        const normalizedEmail = tenant.email.trim().toLowerCase();
        const [users] = await db.query(
          "SELECT id FROM users WHERE LOWER(email) = ? AND role = 'tenant'",
          [normalizedEmail]
        );
        for (const u of users) {
          try {
            await User.remove(u.id);
            if (typeof clearUserFromCache === 'function') {
              clearUserFromCache(u.id);
            }
          } catch (delUserErr) {
            console.warn("Error removing tenant user:", delUserErr.message);
          }
        }
      } catch (userQueryErr) {
        console.warn("Error finding tenant user for deletion:", userQueryErr.message);
      }
    }

    if (tenant.phone) {
      try {
        const safePhone = tenant.phone.trim();
        const [users] = await db.query(
          "SELECT id FROM users WHERE phone = ? AND role = 'tenant'",
          [safePhone]
        );
        for (const u of users) {
          try {
            await User.remove(u.id);
            if (typeof clearUserFromCache === 'function') {
              clearUserFromCache(u.id);
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    // 3. Delete tenant from tenants table
    const affected = await Tenant.delete(tenantId);
    if (affected === 0) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }
    return res.status(200).json({ success: true, message: "Tenant and associated user account deleted successfully" });
  } catch (err) {
    console.error("Delete tenant error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete tenant" });
  }
};

const bulkDeleteTenants = async (req, res) => {
  try {
    const ids = req.body.ids || [];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: "No tenant IDs provided" });
    }

    const placeholders = ids.map(() => "?").join(",");
    let tenants = [];
    try {
      const [rows] = await db.query(`SELECT id, email, phone FROM tenants WHERE id IN (${placeholders})`, ids);
      tenants = rows || [];
    } catch (e) {}

    // Clean up related records
    try {
      await db.query(`DELETE FROM tenant_activities WHERE tenant_id IN (${placeholders})`, ids);
    } catch (e) {}
    try {
      await db.query(`DELETE FROM tenant_visits WHERE tenant_id IN (${placeholders})`, ids);
    } catch (e) {}
    try {
      await db.query(`DELETE FROM tenant_followups WHERE tenant_id IN (${placeholders})`, ids);
    } catch (e) {}

    // Delete corresponding users with role='tenant'
    for (const t of tenants) {
      if (t.email) {
        try {
          const normalizedEmail = t.email.trim().toLowerCase();
          const [users] = await db.query(
            "SELECT id FROM users WHERE LOWER(email) = ? AND role = 'tenant'",
            [normalizedEmail]
          );
          for (const u of users) {
            await User.remove(u.id);
            if (typeof clearUserFromCache === 'function') {
              clearUserFromCache(u.id);
            }
          }
        } catch (e) {}
      }
      if (t.phone) {
        try {
          const [users] = await db.query(
            "SELECT id FROM users WHERE phone = ? AND role = 'tenant'",
            [t.phone.trim()]
          );
          for (const u of users) {
            await User.remove(u.id);
            if (typeof clearUserFromCache === 'function') {
              clearUserFromCache(u.id);
            }
          }
        } catch (e) {}
      }
    }

    const affected = await Tenant.bulkDelete(ids);
    return res.status(200).json({ success: true, message: `${affected} tenants and associated user accounts deleted successfully` });
  } catch (err) {
    console.error("Bulk delete tenants error:", err);
    return res.status(500).json({ success: false, message: "Failed to bulk delete tenants" });
  }
};

const bulkImportTenants = async (req, res) => {
  try {
    const { items } = req.body;
    const result = await Tenant.bulkImport(items);
    return res.json(result);
  } catch (err) {
    console.error("Bulk import tenants error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ==========================================================================
   PUBLIC TENANT FLOW: OTP VERIFICATION, AUTO-LOGIN & OWNER DETAILS
   ========================================================================== */

const tenantOtpStore = new Map();

/**
 * Send OTP for Tenant Owner Contact & Visit Scheduling
 * Uses dynamic "OTP Security Verification" email template from templates table
 */
const sendTenantOtp = async (req, res) => {
  try {
    const { email, name, rental_property_id } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ success: false, message: "A valid email address is required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if account already exists with this email
    let existingUser = null;
    try {
      existingUser = await User.findByEmail(normalizedEmail);
    } catch (e) {}

    let existingTenants = [];
    try {
      const [rows] = await db.query(
        "SELECT id, name, email FROM tenants WHERE email = ? LIMIT 1",
        [normalizedEmail]
      );
      existingTenants = rows || [];
    } catch (e) {}

    if (existingUser || (existingTenants && existingTenants.length > 0)) {
      return res.status(200).json({
        success: false,
        exists: true,
        message: "You already have an active account with this email. Please login to continue.",
      });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    tenantOtpStore.set(normalizedEmail, {
      otp: otpCode,
      email: normalizedEmail,
      name: name || "Valued Tenant",
      rental_property_id: rental_property_id || null,
      expiresAt: Date.now() + 15 * 60 * 1000,
      attempts: 0,
      verified: false,
    });

    console.log(`\n========================================`);
    console.log(`🔑 [TENANT OTP GENERATED]`);
    console.log(`   Email: ${normalizedEmail}`);
    console.log(`   OTP Code: ${otpCode}`);
    console.log(`========================================\n`);

    const { getDynamicOtpEmail, sendMail } = require("../utils/mailer");
    const dynamicEmail = await getDynamicOtpEmail({
      name: name || "Tenant",
      otpCode,
      companyName: "Resale Expert",
    });

    await sendMail({
      to: normalizedEmail,
      subject: dynamicEmail.subject || `Your Verification Code: ${otpCode} - Resale Expert`,
      html: dynamicEmail.html,
    });

    return res.status(200).json({
      success: true,
      message: `Verification code sent to ${normalizedEmail} successfully!`,
    });
  } catch (err) {
    console.error("sendTenantOtp error:", err);
    return res.status(500).json({ success: false, message: "Failed to send verification code. Please try again." });
  }
};

/**
 * Pre-Verify OTP in Step 2 before moving to details (ONLY real email OTP accepted)
 */
const verifyTenantOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and 6-digit OTP code are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();
    const otpRecord = tenantOtpStore.get(normalizedEmail);

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "No active verification code found or session expired. Please click 'Resend Code'.",
      });
    }

    if (Date.now() > otpRecord.expiresAt) {
      tenantOtpStore.delete(normalizedEmail);
      return res.status(400).json({
        success: false,
        message: "Verification code has expired. Please click 'Resend Code'.",
      });
    }

    if (otpRecord.attempts >= 5) {
      tenantOtpStore.delete(normalizedEmail);
      return res.status(400).json({
        success: false,
        message: "Too many incorrect attempts. Please click 'Resend Code' to get a new code.",
      });
    }

    if (cleanOtp !== String(otpRecord.otp).trim()) {
      otpRecord.attempts = (otpRecord.attempts || 0) + 1;
      return res.status(400).json({
        success: false,
        message: "Invalid verification code. Please check the 6-digit code received on your email.",
      });
    }

    // Mark as verified
    otpRecord.verified = true;
    tenantOtpStore.set(normalizedEmail, otpRecord);

    return res.status(200).json({
      success: true,
      message: "Email verified successfully! Please complete your tenant details.",
    });
  } catch (err) {
    console.error("verifyTenantOtp error:", err);
    return res.status(500).json({ success: false, message: "Verification failed. Please try again." });
  }
};

/**
 * Verify OTP, create/update tenant in DB, auto-create/login user with JWT,
 * schedule visit if requested, and return unlocked Owner contact details.
 */
const verifyAndRegisterTenant = async (req, res) => {
  try {
    const jwt = require("jsonwebtoken");
    const bcrypt = require("bcryptjs");
    const authConfig = require("../config/auth.config");
    const User = require("../models/User");
    const tenantVisitModel = require("../models/tenantVisitModel");
    const tenantActivityModel = require("../models/tenantActivityModel");

    const {
      email,
      otp,
      name,
      phone,
      whatsapp,
      tenant_type,
      move_in_date,
      preferred_bhk,
      rental_property_id,
      schedule_visit,
      already_verified,
    } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp || '').trim();
    const otpRecord = tenantOtpStore.get(normalizedEmail);

    // Only verify OTP if not marked as already verified / logged-in user
    if (!already_verified && (!req.user || req.user.email !== normalizedEmail)) {
      if (!cleanOtp) {
        return res.status(400).json({ success: false, message: "Verification code is required." });
      }

      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message: "No active verification code found or session expired. Please request a new code.",
        });
      }

      if (!otpRecord.verified) {
        if (Date.now() > otpRecord.expiresAt) {
          tenantOtpStore.delete(normalizedEmail);
          return res.status(400).json({
            success: false,
            message: "Verification code has expired. Please request a new code.",
          });
        }

        if (otpRecord.attempts >= 5) {
          tenantOtpStore.delete(normalizedEmail);
          return res.status(400).json({
            success: false,
            message: "Too many incorrect attempts. Please request a new code.",
          });
        }

        if (cleanOtp !== String(otpRecord.otp).trim()) {
          otpRecord.attempts = (otpRecord.attempts || 0) + 1;
          return res.status(400).json({
            success: false,
            message: "Invalid verification code. Please check the code received on your email.",
          });
        }
      }
    }

    const safeName = (name || (otpRecord ? otpRecord.name : '') || (req.user ? `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() : '') || "Tenant").trim();
    const safePhone = (phone || "").trim();
    const safeWhatsapp = (whatsapp || safePhone || "").trim();
    const safeTenantType = tenant_type || "Family";
    const safeRentalPropId = rental_property_id || (otpRecord ? otpRecord.rental_property_id : null) || null;

    const parseToDateOnly = (v) => {
      if (!v) return null;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return null;
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${mm}-${dd}`;
    };
    const safeMoveInDate = parseToDateOnly(move_in_date);

    // 1. Find or Create Tenant Record in `tenants` table (1 Profile per Email)
    let tenant = null;
    let isNewTenant = false;
    try {
      const [existingTenants] = await db.query(
        "SELECT * FROM tenants WHERE email = ? ORDER BY id ASC LIMIT 1",
        [normalizedEmail]
      );

      if (existingTenants && existingTenants.length > 0) {
        tenant = existingTenants[0];
        // NOTE: Do NOT auto-link rental_property_id - admin/owner does this manually
      } else {
        isNewTenant = true;
        tenant = await Tenant.create({
          name: safeName,
          email: normalizedEmail,
          phone: safePhone || null,
          whatsapp: safeWhatsapp || null,
          tenant_type: safeTenantType,
          move_in_date: safeMoveInDate,
          preferred_bhk: preferred_bhk || null,
          rental_property_id: null, // Do NOT auto-link; admin links manually
          status: 'Active Search',
          notes: `Registered via website${safeRentalPropId ? ' - Interested in RENT-' + safeRentalPropId : ''}`,
        });
      }
    } catch (dbTenantErr) {
      console.error("Tenant save error in verifyAndRegisterTenant:", dbTenantErr);
      tenant = { id: null, name: safeName, email: normalizedEmail, phone: safePhone };
    }

    // 2. Log Activity
    if (tenant && tenant.id && safeRentalPropId) {
      try {
        await tenantActivityModel.create({
          tenant_id: tenant.id,
          activity_type: "Inquiry / Owner Contacted",
          notes: `Contacted owner for rental property RENT-${safeRentalPropId}`,
        });
      } catch (e) {
        console.warn("Tenant activity log note:", e.message);
      }
    }

    // 3. Schedule Visit if visit details provided
    if (schedule_visit && (schedule_visit.visit_date || schedule_visit.visitDate) && tenant && tenant.id) {
      try {
        await tenantVisitModel.create({
          tenant_id: tenant.id,
          rental_property_id: safeRentalPropId,
          property_title: schedule_visit.property_title || `Rental Property RENT-${safeRentalPropId}`,
          visit_date: parseToDateOnly(schedule_visit.visit_date || schedule_visit.visitDate),
          visit_time: schedule_visit.visit_time || schedule_visit.visitTime || "11:00 AM",
          meeting_point: schedule_visit.meeting_point || schedule_visit.meetPoint || "Property Location",
          remarks: schedule_visit.remarks || schedule_visit.notes || "Scheduled via Public Rental Page",
          status: "Pending Owner Approval",
        });
      } catch (visitErr) {
        console.warn("Could not record visit in tenant_visits:", visitErr.message);
      }
    }

    // 4. Find or Create User in `users` table for seamless auto-login
    let user = null;
    try {
      user = await User.findByEmail(normalizedEmail);
      if (!user) {
        const nameParts = safeName.trim().split(/\s+/);
        const firstName = nameParts[0] || "Tenant";
        const lastName = nameParts.slice(1).join("") || "";
        let baseUsername = "";
        if (lastName) {
          baseUsername = `${firstName.charAt(0).toLowerCase()}${lastName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
        } else {
          baseUsername = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");
        }
        if (!baseUsername || baseUsername.length < 2) baseUsername = `tenant_${Math.floor(100 + Math.random() * 900)}`;

        let username = baseUsername;
        try {
          const [existingU] = await db.query("SELECT id FROM users WHERE username = ? LIMIT 1", [username]);
          if (existingU && existingU.length > 0) {
            username = `${baseUsername}${Math.floor(10 + Math.random() * 90)}`;
          }
        } catch (e) {}

        const newUser = new User({
          salutation: 'Mr.',
          username,
          first_name: firstName,
          last_name: nameParts.slice(1).join(" ") || "",
          email: normalizedEmail,
          password: bcrypt.hashSync(Math.random().toString(36).slice(-8), 8),
          phone: safePhone || null,
          role: 'tenant',
          is_active: true,
        });
        user = await User.create(newUser);
      }
      if (user && tenant && tenant.id) {
        try {
          await db.query("UPDATE users SET tenant_id = ? WHERE id = ?", [tenant.id, user.id]);
          user.tenant_id = tenant.id;
        } catch (linkErr) {
          // tenant_id column might not exist or already set
        }
      }
    } catch (uErr) {
      console.warn("User create/link note in tenant registration:", uErr.message);
      user = { id: tenant?.id || 1, username: normalizedEmail.split('@')[0], email: normalizedEmail, role: 'tenant' };
    }

    // 5. Generate JWT Token for Auto-Login
    let token = null;
    try {
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      token = jwt.sign(
        {
          id: user?.id,
          username: user?.username,
          email: user?.email || normalizedEmail,
          role: user?.role || 'tenant',
          tenant_id: tenant?.id,
          session_id: sessionId,
        },
        authConfig.secret,
        { expiresIn: authConfig.jwtExpiration || "24h" }
      );
    } catch (jwtErr) {
      console.warn("JWT generation warning:", jwtErr.message);
    }

    // 6. Fetch Owner Contact Details for this rental property
    let ownerDetails = null;
    if (safeRentalPropId) {
      try {
        const [propRows] = await db.query(
          `SELECT 
            rp.id AS property_id,
            rp.society_name,
            rp.unit_type,
            rp.monthly_rent,
            rp.owner_id,
            o.name AS owner_name,
            o.phone AS owner_phone,
            o.email AS owner_email,
            o.whatsapp AS owner_whatsapp,
            o.address AS owner_address
          FROM rental_properties rp
          LEFT JOIN owners o ON rp.owner_id = o.id
          WHERE rp.id = ?
          LIMIT 1`,
          [safeRentalPropId]
        );

        if (propRows && propRows.length > 0) {
          const row = propRows[0];
          ownerDetails = {
            owner_id: row.owner_id,
            name: row.owner_name || "Property Owner",
            phone: row.owner_phone || null,
            email: row.owner_email || null,
            whatsapp: row.owner_whatsapp || row.owner_phone || null,
            address: row.owner_address || null,
            society_name: row.society_name,
            monthly_rent: row.monthly_rent,
          };
        }
      } catch (ownerErr) {
        console.warn("Could not fetch owner details for property:", safeRentalPropId, ownerErr.message);
      }
    }

    // Everything succeeded - NOW clean up OTP store
    tenantOtpStore.delete(normalizedEmail);

    if (user && user.password) {
      delete user.password;
    }

    return res.status(200).json({
      success: true,
      message: "Verification successful! Owner contact details are now unlocked.",
      token,
      user: {
        id: user?.id,
        username: user?.username,
        email: user?.email || normalizedEmail,
        role: user?.role || 'tenant',
        first_name: user?.first_name || safeName,
        last_name: user?.last_name || '',
        phone: user?.phone || safePhone,
        tenant_id: tenant?.id,
      },
      tenant,
      is_new_tenant: isNewTenant,
      owner: ownerDetails,
    });
  } catch (err) {
    console.error("verifyAndRegisterTenant error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to verify and register tenant: " + (err.message || ""),
    });
  }
};

/**
 * Report Property Discrepancy / Issue
 */
const reportPropertyIssue = async (req, res) => {
  try {
    const { property_id, property_type = 'rent', reason, description, reporter_email, reporter_phone } = req.body;

    if (!property_id || !reason) {
      return res.status(400).json({ success: false, message: "Property ID and Reason are required." });
    }

    try {
      await db.query(
        `INSERT INTO property_reports (property_id, property_type, reason, description, reporter_email, reporter_phone, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
        [property_id, property_type, reason, description || '', reporter_email || null, reporter_phone || null]
      );
    } catch (tableErr) {
      console.warn("[Property Report] Table note (handled gracefully):", tableErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Thank you! Your report has been submitted. Our team will review the listing.",
    });
  } catch (err) {
    console.error("reportPropertyIssue error:", err);
    return res.status(500).json({ success: false, message: "Failed to submit report." });
  }
};

/**
 * Update / Set Tenant Account Password
 */
const updateTenantPassword = async (req, res) => {
  try {
    const { email, tenant_id, new_password } = req.body || {};
    if (!new_password || new_password.trim().length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    let targetEmail = (email || '').trim().toLowerCase();
    let tenantName = "Tenant";

    if (!targetEmail && tenant_id) {
      const tenant = await Tenant.getById(tenant_id);
      if (tenant) {
        targetEmail = (tenant.email || '').trim().toLowerCase();
        tenantName = tenant.name || 'Tenant';
      }
    }

    if (!targetEmail) {
      return res.status(400).json({ success: false, message: "Email is required to set account password." });
    }

    const hashedPassword = bcrypt.hashSync(new_password.trim(), 8);
    let user = await User.findByEmail(targetEmail);

    if (user) {
      await db.query("UPDATE users SET password = ? WHERE email = ?", [hashedPassword, targetEmail]);
    } else {
      const nameParts = tenantName.trim().split(/\s+/);
      const firstName = nameParts[0] || "Tenant";
      const lastName = nameParts.slice(1).join("") || "";
      let baseUsername = "";
      if (lastName) {
        baseUsername = `${firstName.charAt(0).toLowerCase()}${lastName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      } else {
        baseUsername = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");
      }
      if (!baseUsername || baseUsername.length < 2) baseUsername = `tenant_${Math.floor(100 + Math.random() * 900)}`;

      let username = baseUsername;
      try {
        const [existingU] = await db.query("SELECT id FROM users WHERE username = ? LIMIT 1", [username]);
        if (existingU && existingU.length > 0) {
          username = `${baseUsername}${Math.floor(10 + Math.random() * 90)}`;
        }
      } catch (e) {}

      const newUser = new User({
        salutation: 'Mr.',
        username,
        first_name: firstName,
        last_name: nameParts.slice(1).join(" ") || "",
        email: targetEmail,
        password: hashedPassword,
        role: 'tenant',
        is_active: true,
      });
      user = await User.create(newUser);
    }

    return res.status(200).json({
      success: true,
      username: user ? user.username : null,
      message: `Password updated successfully! Your login username is: ${user ? user.username : targetEmail}`,
    });
  } catch (err) {
    console.error("updateTenantPassword error:", err);
    return res.status(500).json({ success: false, message: "Failed to update password: " + (err.message || '') });
  }
};

/**
 * Get Owner Details for Already-Logged-In Tenant (No OTP required)
 * Called when tenant is already authenticated and clicks "Contact Owner"
 */
const getOwnerDetailsForTenant = async (req, res) => {
  try {
    const property_id = req.params.property_id || req.body.property_id;
    const email = (req.body.email || req.query.email || '').trim().toLowerCase();

    if (!property_id) {
      return res.status(400).json({ success: false, message: "Property ID is required." });
    }

    // Fetch owner details for this rental property
    let ownerDetails = null;
    try {
      const [propRows] = await db.query(
        `SELECT 
          rp.id AS property_id,
          rp.society_name,
          rp.unit_type,
          rp.monthly_rent,
          rp.owner_id,
          rp.owner_name AS rp_owner_name,
          o.name AS owner_name,
          o.phone AS owner_phone,
          o.email AS owner_email,
          o.whatsapp AS owner_whatsapp,
          o.address AS owner_address
        FROM rental_properties rp
        LEFT JOIN owners o ON (rp.owner_id = o.id OR (rp.owner_name IS NOT NULL AND LOWER(TRIM(rp.owner_name)) = LOWER(TRIM(o.name))))
        WHERE rp.id = ?
        LIMIT 1`,
        [property_id]
      );

      if (propRows && propRows.length > 0) {
        const row = propRows[0];
        let oName = (row.owner_name && row.owner_name.trim() !== '') ? row.owner_name : row.rp_owner_name;
        let oPhone = row.owner_phone;
        let oWhatsapp = row.owner_whatsapp || row.owner_phone;
        let oEmail = row.owner_email;

        // If phone or name still missing, check owners table by rp_owner_name or owner_id
        if ((!oPhone || !oName) && (row.rp_owner_name || row.owner_id)) {
          try {
            const [extraOwner] = await db.query(
              `SELECT * FROM owners WHERE id = ? OR (name IS NOT NULL AND LOWER(TRIM(name)) = LOWER(TRIM(?))) LIMIT 1`,
              [row.owner_id || 0, row.rp_owner_name || '']
            );
            if (extraOwner && extraOwner.length > 0) {
              oName = extraOwner[0].name || oName;
              oPhone = extraOwner[0].phone || oPhone;
              oWhatsapp = extraOwner[0].whatsapp || extraOwner[0].phone || oWhatsapp;
              oEmail = extraOwner[0].email || oEmail;
            }
          } catch (e) {}
        }

        ownerDetails = {
          owner_id: row.owner_id,
          name: oName || "Property Owner",
          phone: oPhone || null,
          email: oEmail || null,
          whatsapp: oWhatsapp || oPhone || null,
          address: row.owner_address || null,
          society_name: row.society_name,
          monthly_rent: row.monthly_rent,
        };
      }
    } catch (ownerErr) {
      console.warn("Could not fetch owner details:", ownerErr.message);
    }

    // Log activity if tenant email provided
    if (email) {
      try {
        const [tenantRows] = await db.query(
          "SELECT id FROM tenants WHERE email = ? LIMIT 1",
          [email]
        );
        if (tenantRows && tenantRows.length > 0) {
          const tenantId = tenantRows[0].id;
          const tenantActivityModel = require('../models/TenantActivity');
          await tenantActivityModel.create({
            tenant_id: tenantId,
            activity_type: "Inquiry / Owner Contacted",
            notes: `Logged-in tenant viewed owner contact for rental property RENT-${property_id}`,
          });
        }
      } catch (logErr) {
        // Activity logging is non-critical
      }
    }

    return res.status(200).json({
      success: true,
      owner: ownerDetails,
    });
  } catch (err) {
    console.error("getOwnerDetailsForTenant error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch owner details." });
  }
};

// ----------------------------------------------------------------------------
// PROFILE COMPLETENESS & MATCH SCORING
// ----------------------------------------------------------------------------
const getTenantProfileCompleteness = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenant = await Tenant.getById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }
    const completeness = Tenant.calculateProfileCompletion(tenant);
    return res.status(200).json({
      success: true,
      data: {
        tenantId,
        ...completeness,
      },
    });
  } catch (err) {
    console.error("getTenantProfileCompleteness error:", err);
    return res.status(500).json({ success: false, message: "Failed to calculate profile completeness" });
  }
};

const calculateTenantPropertyMatch = async (req, res) => {
  try {
    const { tenantId, propertyId } = req.params;
    const tenant = await Tenant.getById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }

    const [propRows] = await db.query(
      `SELECT * FROM rental_properties WHERE id = ? LIMIT 1`,
      [propertyId]
    );
    if (!propRows || propRows.length === 0) {
      return res.status(404).json({ success: false, message: "Rental property not found" });
    }

    const matchScore = Tenant.calculateMatchScore(tenant, propRows[0]);
    const completeness = Tenant.calculateProfileCompletion(tenant);

    return res.status(200).json({
      success: true,
      data: {
        tenantId,
        propertyId,
        matchScore,
        completeness,
      },
    });
  } catch (err) {
    console.error("calculateTenantPropertyMatch error:", err);
    return res.status(500).json({ success: false, message: "Failed to calculate match score" });
  }
};

// ----------------------------------------------------------------------------
// INTEREST REQUEST MANAGEMENT (TENANT <-> OWNER)
// ----------------------------------------------------------------------------
const sendTenantInterest = async (req, res) => {
  try {
    const { rental_property_id, tenant_id, owner_id, sender_type = 'tenant', message } = req.body;
    if (!rental_property_id || !tenant_id) {
      return res.status(400).json({ success: false, message: "rental_property_id and tenant_id are required" });
    }

    // 1. Fetch Tenant & Property
    const tenant = await Tenant.getById(tenant_id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }

    // Check profile completeness
    const completeness = Tenant.calculateProfileCompletion(tenant);
    if (!completeness.isComplete && sender_type === 'tenant') {
      return res.status(400).json({
        success: false,
        requiresProfileCompletion: true,
        message: "Please complete your tenant profile before expressing interest.",
        completeness,
      });
    }

    const [propRows] = await db.query(
      `SELECT * FROM rental_properties WHERE id = ? LIMIT 1`,
      [rental_property_id]
    );
    if (!propRows || propRows.length === 0) {
      return res.status(404).json({ success: false, message: "Rental property not found" });
    }
    const prop = propRows[0];
    const targetOwnerId = owner_id || prop.owner_id || null;

    // 2. Compute Match Score Snapshot
    const matchScore = Tenant.calculateMatchScore(tenant, prop);

    // 3. Create Interest in DB
    const result = await Tenant.createInterest({
      rental_property_id,
      tenant_id,
      owner_id: targetOwnerId,
      sender_type,
      message,
      match_score: matchScore,
    });

    if (!result.success && result.isExisting) {
      return res.status(200).json({
        success: true,
        isExisting: true,
        message: result.message,
        data: result.data,
      });
    }

    if (global.io) {
      global.io.emit("owner_interest_received", {
        owner_id: prop.seller_id || prop.owner_id,
        tenant_id,
        tenant_name: tenant.name,
        rental_property_id,
        match_score: matchScore,
        property_title: prop.title || prop.property_name,
      });
      global.io.emit("refresh_interests", { owner_id: prop.seller_id || prop.owner_id, tenant_id });
    }

    return res.status(201).json({
      success: true,
      message: "Interest request submitted successfully!",
      data: result.data,
      matchScore,
    });
  } catch (err) {
    console.error("sendTenantInterest error:", err);
    return res.status(500).json({ success: false, message: "Failed to send interest: " + err.message });
  }
};

const getTenantInterests = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const interests = await Tenant.getInterestsForTenant(tenantId);
    return res.status(200).json({ success: true, data: interests });
  } catch (err) {
    console.error("getTenantInterests error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch tenant interests" });
  }
};

const getOwnerInterests = async (req, res) => {
  try {
    const { ownerId } = req.params;
    const interests = await Tenant.getInterestsForOwner(ownerId);
    return res.status(200).json({ success: true, data: interests });
  } catch (err) {
    console.error("getOwnerInterests error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch owner interests" });
  }
};

const ownerConfirmTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const { owner_id } = req.body;
    const result = await Tenant.confirmTenantForProperty(id, owner_id);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    if (global.io) {
      global.io.emit("tenant_interest_confirmed", {
        tenant_id: result.data?.tenant_id,
        rental_property_id: result.data?.rental_property_id,
        interest_id: id,
        message: "Owner accepted your interest request! Please confirm acceptance to finalize lease.",
      });
      global.io.emit("refresh_interests", { tenant_id: result.data?.tenant_id });
    }
    return res.status(200).json({
      success: true,
      message: "Candidate confirmed! Other active requests for this property are now marked PROPERTY_SELECTED.",
      data: result.data,
    });
  } catch (err) {
    console.error("ownerConfirmTenant error:", err);
    return res.status(500).json({ success: false, message: "Failed to confirm candidate" });
  }
};

const ownerRejectTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const result = await Tenant.rejectTenantForProperty(id, notes);
    if (global.io) {
      global.io.emit("refresh_interests", { tenant_id: result.data?.tenant_id });
    }
    return res.status(200).json({
      success: true,
      message: "Candidate request rejected.",
      data: result.data,
    });
  } catch (err) {
    console.error("ownerRejectTenant error:", err);
    return res.status(500).json({ success: false, message: "Failed to reject candidate" });
  }
};

const tenantRespondToConfirmation = async (req, res) => {
  try {
    const { id } = req.params;
    const { tenant_id, action } = req.body; // action: 'accept' | 'decline'
    if (!tenant_id || !action) {
      return res.status(400).json({ success: false, message: "tenant_id and action ('accept' | 'decline') are required" });
    }
    const result = await Tenant.respondToOwnerConfirmation(id, tenant_id, action);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    if (global.io) {
      global.io.emit("owner_tenant_responded", {
        owner_id: result.data?.owner_id,
        tenant_id,
        action,
        rental_property_id: result.data?.rental_property_id,
        message: action === 'accept' ? "Tenant accepted! Property is now moving to Lease agreement." : "Tenant declined request.",
      });
      global.io.emit("refresh_interests", { tenant_id, owner_id: result.data?.owner_id });
    }
    return res.status(200).json({
      success: true,
      message: action === 'accept' ? "You have accepted the owner's selection! Proceeding to booking." : "You have declined. The property is re-opened for other candidates.",
      data: result.data,
    });
  } catch (err) {
    console.error("tenantRespondToConfirmation error:", err);
    return res.status(500).json({ success: false, message: "Failed to respond to owner confirmation" });
  }
};

// ─── Upload Tenant Profile Photo ──────────────────────────────────────────────
const uploadTenantPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const photoUrl = req.file.publicUrl || req.file.path;
    await Tenant.update(id, { profile_photo: photoUrl });
    return res.json({ success: true, message: 'Profile photo updated', url: photoUrl });
  } catch (err) {
    console.error('uploadTenantPhoto error:', err);
    return res.status(500).json({ success: false, message: 'Failed to upload photo' });
  }
};

// ─── Upload Tenant ID Proof Document ─────────────────────────────────────────
const uploadTenantIdProof = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const docUrl = req.file.publicUrl || req.file.path;
    const { id_proof_type, id_proof_number } = req.body;
    await Tenant.update(id, {
      id_proof_document: docUrl,
      ...(id_proof_type ? { id_proof_type } : {}),
      ...(id_proof_number ? { id_proof_number } : {}),
    });
    return res.json({ success: true, message: 'ID proof uploaded', url: docUrl });
  } catch (err) {
    console.error('uploadTenantIdProof error:', err);
    return res.status(500).json({ success: false, message: 'Failed to upload ID proof' });
  }
};

module.exports = {
  getTenants,
  getTenantById,
  createTenant,
  updateTenant,
  deleteTenant,
  bulkDeleteTenants,
  bulkImportTenants,
  sendTenantOtp,
  verifyTenantOtp,
  verifyAndRegisterTenant,
  reportPropertyIssue,
  updateTenantPassword,
  getOwnerDetailsForTenant,
  getTenantProfileCompleteness,
  calculateTenantPropertyMatch,
  sendTenantInterest,
  getTenantInterests,
  getOwnerInterests,
  ownerConfirmTenant,
  ownerRejectTenant,
  tenantRespondToConfirmation,
  uploadTenantPhoto,
  uploadTenantIdProof,
};
