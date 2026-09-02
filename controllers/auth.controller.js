const User = require('../models/User');
const LoginLog = require('../models/LoginLog');
const UserActivityEvent = require('../models/userActivityEvent.model');
const { reverseGeocodeNonBlocking } = require('../utils/geocoder');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/auth.config');
const { sendMail, renderOtpEmail } = require('../utils/mailer');
const Lead = require('../models/Lead');
const Integration = require('../models/integration.model');
const axios = require('axios');

// In-Memory OTP Store: email -> { otp, expiresAt, attempts, userData }
const otpStore = new Map();

// Helper to sanitize & generate a clean username
const generateUsername = (nameOrEmail) => {
  const clean = (nameOrEmail || 'user').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const rand = Math.floor(100 + Math.random() * 900);
  return `${clean.slice(0, 15)}${rand}`;
};

// Auto-provision or link buyer/seller entity record for buyer/seller/owner users
const ensureBuyerOrSellerProfile = async (user) => {
  if (!user || !user.role) return user;
  const role = user.role.toLowerCase().trim();

  if (role === 'buyer' && !user.buyer_id) {
    try {
      const [existing] = await db.query("SELECT id FROM buyers WHERE email = ? LIMIT 1", [user.email]);
      if (existing && existing.length > 0) {
        user.buyer_id = existing[0].id;
      } else {
        const [bRes] = await db.query(
          "INSERT INTO buyers (salutation, name, phone, email, buyer_lead_source, buyer_lead_status, created_at, updated_at) VALUES (?, ?, ?, ?, 'Website User', 'new', NOW(), NOW())",
          [user.salutation || 'Mr.', `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'Buyer', user.phone || null, user.email]
        );
        user.buyer_id = bRes.insertId;
      }
      await db.query("UPDATE users SET buyer_id = ? WHERE id = ?", [user.buyer_id, user.id]);
    } catch (e) {
      console.warn("Auto-link buyer profile note:", e.message);
    }
  } else if ((role === 'seller' || role === 'owner') && !user.seller_id) {
    try {
      const [existing] = await db.query("SELECT id FROM sellers WHERE email = ? LIMIT 1", [user.email]);
      if (existing && existing.length > 0) {
        user.seller_id = existing[0].id;
      } else {
        const [sRes] = await db.query(
          "INSERT INTO sellers (salutation, name, phone, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', NOW(), NOW())",
          [user.salutation || 'Mr.', `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'Seller', user.phone || null, user.email]
        );
        user.seller_id = sRes.insertId;
      }
      await db.query("UPDATE users SET seller_id = ? WHERE id = ?", [user.seller_id, user.id]);
    } catch (e) {
      console.warn("Auto-link seller profile note:", e.message);
    }
  }
  return user;
};

// User Registration
exports.signup = async (req, res) => {
  try {
    // Validate request
    if (!req.body.username || !req.body.email || !req.body.password) {
      return res.status(400).send({
        success: false,
        message: 'Username, email, and password are required!'
      });
    }

    if (req.body.password.length < 6) {
      return res.status(400).send({
        success: false,
        message: 'Password must be at least 6 characters long!'
      });
    }

    // Check if user already exists
    const existingUserByEmail = await User.findByEmail(req.body.email);
    if (existingUserByEmail) {
      return res.status(400).send({
        success: false,
        message: 'Email is already in use!'
      });
    }

    const existingUserByUsername = await User.findByUsername(req.body.username);
    if (existingUserByUsername) {
      return res.status(400).send({
        success: false,
        message: 'Username is already taken!'
      });
    }

    // Create new user
    const user = new User({
      username: req.body.username,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      email: req.body.email,
      password: bcrypt.hashSync(req.body.password, 8),
      phone: req.body.phone,
      role: req.body.role || 'agent', // Default role is agent
      is_active: true
    });

    // Save user in database
    const data = await User.create(user);
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: data.id,
        username: data.username,
        email: data.email,
        role: data.role
      },
      config.secret,
      { expiresIn: config.jwtExpiration }
    );

    // Stitch guest activity if guest_id was provided
    if (req.body.guest_id) {
      try {
        await UserActivityEvent.stitchGuestToUser(req.body.guest_id, data.id);
      } catch (stitchErr) {
        console.error('Error stitching guest in signup:', stitchErr);
      }
    }

    // Remove password from response
    delete data.password;

    res.status(201).send({
      success: true,
      message: 'User registered successfully!',
      data: {
        user: data,
        accessToken: token
      }
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Some error occurred while creating the user.'
    });
  }
};

// User Login
exports.signin = async (req, res) => {
  try {
    if (!req.body.username || !req.body.password) {
      return res.status(400).send({
        success: false,
        message: 'Username and password are required!'
      });
    }

    // Mandatory Location Access Check
    if (req.body.latitude === undefined || req.body.longitude === undefined || req.body.latitude === null || req.body.longitude === null) {
      return res.status(400).send({
        success: false,
        message: 'Location access is required to log in. Please enable location permissions in your browser and try again.'
      });
    }

    // Find user by username
    const user = await User.findByUsername(req.body.username);

    if (!user) {
      return res.status(401).send({
        success: false,
        message: 'User not found!'
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).send({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.'
      });
    }

    const passwordIsValid = bcrypt.compareSync(req.body.password, user.password);
    if (!passwordIsValid) {
      return res.status(401).send({
        success: false,
        message: 'Incorrect password!'
      });
    }

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        session_id: sessionId
      },
      config.secret,
      { expiresIn: config.jwtExpiration }
    );

    // Update last login
    await User.updateLastLogin(user.id);

    // Log login session details into login_logs
    try {
      // Close any previously unclosed sessions for this user/email
      await LoginLog.closePreviousSessions(user.id, user.email);

      const rawIp = req.headers['cf-connecting-ip'] || 
                    req.headers['x-real-ip'] || 
                    req.headers['x-forwarded-for'] || 
                    req.socket?.remoteAddress || 
                    req.ip || 
                    '127.0.0.1';
      let ip = String(rawIp).split(',')[0].trim();
      if (ip === '::1') {
        ip = '127.0.0.1 (IPv6 ::1)';
      } else if (ip.startsWith('::ffff:')) {
        ip = ip.replace('::ffff:', '');
      }

      const logId = await LoginLog.createLog({
        user_id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'agent',
        session_id: sessionId,
        ip_address: ip,
        device_id: req.body.device_id || 'dev_browser',
        source: req.body.source || 'Web Browser',
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        address: req.body.address || null,
      });

      // Trigger non-blocking reverse geocoding if address wasn't passed from client
      if (!req.body.address) {
        reverseGeocodeNonBlocking({
          logId,
          latitude: req.body.latitude,
          longitude: req.body.longitude,
        });
      }
    } catch (logErr) {
      console.error('Error logging user signin session:', logErr);
    }

    // Auto ensure buyer or seller profile is linked
    await ensureBuyerOrSellerProfile(user);

    // Remove password from response
    delete user.password;

    res.send({
      success: true,
      message: 'Login successful!',
      data: {
        user: user,
        accessToken: token,
        session_id: sessionId
      }
    });
  } catch (err) {
    console.error('Signin error:', err);
    res.status(500).send({
      success: false,
      message: err.message || 'Error occurred during login.'
    });
  }
};


// Refresh Token
exports.refreshToken = async (req, res) => {
  try {
    const token = req.headers['x-access-token'] || req.headers['authorization'];
    
    if (!token) {
      return res.status(403).send({
        success: false,
        message: 'No token provided!'
      });
    }

    // Remove 'Bearer ' if present
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

    jwt.verify(cleanToken, config.secret, async (err, decoded) => {
      if (err) {
        return res.status(401).send({
          success: false,
          message: 'Unauthorized! Invalid token.'
        });
      }

      // Get updated user data
      const user = await User.findById(decoded.id);
      if (!user || !user.is_active) {
        return res.status(401).send({
          success: false,
          message: 'User not found or inactive!'
        });
      }

      // Generate new token
      const newToken = jwt.sign(
        { 
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        config.secret,
        { expiresIn: config.jwtExpiration }
      );

      // Stitch pre-login guest activity if guest_id was provided
      if (req.body.guest_id) {
        try {
          await UserActivityEvent.stitchGuestToUser(req.body.guest_id, user.id);
        } catch (stitchErr) {
          console.error('Error stitching guest in signin:', stitchErr);
        }
      }

      // Remove password from response
      delete user.password;

      res.send({
        success: true,
        message: 'Token refreshed successfully!',
        data: {
          user: user,
          accessToken: newToken
        }
      });
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error occurred during token refresh.'
    });
  }
};

// Forgot Password (placeholder - would typically send email)
exports.forgotPassword = async (req, res) => {
  try {
    if (!req.body.email) {
      return res.status(400).send({
        success: false,
        message: 'Email is required!'
      });
    }

    const user = await User.findByEmail(req.body.email);
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.send({
        success: true,
        message: 'If the email exists in our system, you will receive password reset instructions.'
      });
    }

    // In a real application, you would:
    // 1. Generate a secure reset token
    // 2. Store it in the database with expiration
    // 3. Send email with reset link
    // For this demo, we'll just return success
    
    res.send({
      success: true,
      message: 'If the email exists in our system, you will receive password reset instructions.'
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error occurred during password reset request.'
    });
  }
};

// Reset Password (placeholder)
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).send({
        success: false,
        message: 'Token and new password are required!'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).send({
        success: false,
        message: 'Password must be at least 6 characters long!'
      });
    }

    // In a real application, you would:
    // 1. Verify the reset token
    // 2. Check if it's not expired
    // 3. Update the user's password
    // 4. Invalidate the reset token
    
    res.send({
      success: true,
      message: 'Password reset functionality would be implemented here.'
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error occurred during password reset.'
    });
  }
};

// Logout (client-side token removal, but we can log the action)
exports.logout = async (req, res) => {
  try {
    const sessionId = req.sessionId || req.body?.session_id || req.query?.session_id;
    const userId = req.userId;

    if (sessionId) {
      await LoginLog.updateLogout(sessionId);
    }
    if (userId) {
      await LoginLog.updateLogoutByUser(userId);
    }

    res.send({
      success: true,
      message: "Logged out successfully!",
    });
  } catch (err) {
    console.error("Error during logout:", err);
    res.status(500).send({
      success: false,
      message: err.message || "Error occurred during logout.",
    });
  }
};

// Get current logged-in user details
exports.me = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).send({ success: false, message: 'Unauthorized' });
    }
    const user = req.user ? { ...req.user } : await User.findById(userId);
    if (!user) {
      return res.status(404).send({ success: false, message: 'User not found' });
    }
    delete user.password;
    res.send({
      success: true,
      data: user,
      user: user,
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error fetching user profile.',
    });
  }
};

/* =========================================================================
   1. SEND LOGIN OTP (Finds user by email or username & sends 6-digit email OTP)
========================================================================= */
exports.sendLoginOTP = async (req, res) => {
  try {
    const identifier = (req.body.email || req.body.emailOrUsername || req.body.username || '').toLowerCase().trim();

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Email or username is required.',
      });
    }

    // Lookup user by email or username
    let user = await User.findByEmail(identifier);
    if (!user) {
      user = await User.findByUsername(identifier);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email or username. Please check or register.',
      });
    }

    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: 'This account does not have a registered email address to receive OTP.',
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.',
      });
    }

    const normalizedEmail = user.email.toLowerCase().trim();

    // Generate 6-Digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store in-memory with key `login_${email}`
    otpStore.set(`login_${normalizedEmail}`, {
      otp,
      expiresAt,
      attempts: 0,
      userId: user.id,
      email: normalizedEmail,
    });

    // Send email via dynamic mailer
    try {
      await sendMail({
        to: normalizedEmail,
        subject: `Your Login Code: ${otp} - Resale Expert`,
        html: renderOtpEmail({
          name: `${user.first_name || user.username || 'User'}`,
          otpCode: otp,
          companyName: 'Resale Expert',
        }),
      });
    } catch (mailErr) {
      console.error('Error sending login OTP email:', mailErr);
      return res.status(500).json({
        success: false,
        message: `Failed to send login code. Please ensure SMTP is configured. Error: ${mailErr.message}`,
      });
    }

    res.json({
      success: true,
      message: `A 6-digit login code has been sent to ${normalizedEmail}.`,
      email: normalizedEmail,
    });
  } catch (error) {
    console.error('sendLoginOTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error sending login code.',
    });
  }
};

/* =========================================================================
   2. VERIFY LOGIN OTP & SIGN IN
========================================================================= */
exports.verifyOTPAndLogin = async (req, res) => {
  try {
    const { email, otp, guest_id } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and 6-digit OTP code are required.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const otpKey = `login_${normalizedEmail}`;
    const otpRecord = otpStore.get(otpKey);

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'No active login code found. Please request a new code.',
      });
    }

    if (Date.now() > otpRecord.expiresAt) {
      otpStore.delete(otpKey);
      return res.status(400).json({
        success: false,
        message: 'Login code has expired. Please request a new code.',
      });
    }

    if (otpRecord.attempts >= 5) {
      otpStore.delete(otpKey);
      return res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new login code.',
      });
    }

    if (String(otpRecord.otp).trim() !== String(otp).trim()) {
      otpRecord.attempts += 1;
      return res.status(400).json({
        success: false,
        message: 'Invalid login code. Please check your email and try again.',
      });
    }

    // OTP Verified successfully! Clean up record
    otpStore.delete(otpKey);

    const user = await User.findByEmail(normalizedEmail);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.',
      });
    }

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        session_id: sessionId,
      },
      config.secret,
      { expiresIn: config.jwtExpiration }
    );

    // Update last login
    await User.updateLastLogin(user.id);

    // Auto ensure buyer or seller profile is linked
    await ensureBuyerOrSellerProfile(user);

    // Stitch guest activity if present
    if (guest_id) {
      try {
        await UserActivityEvent.stitchGuestToUser(guest_id, user.id);
      } catch (stitchErr) {
        console.error('Error stitching guest in otp login:', stitchErr);
      }
    }

    // Remove password from response
    delete user.password;

    res.json({
      success: true,
      message: 'Logged in successfully with OTP!',
      data: {
        user,
        accessToken: token,
        session_id: sessionId,
      },
    });
  } catch (error) {
    console.error('verifyOTPAndLogin error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error logging in with OTP.',
    });
  }
};

/* =========================================================================
   3. SEND REGISTRATION OTP (Validates uniqueness & sends 6-digit email OTP)
========================================================================= */
exports.sendRegistrationOTP = async (req, res) => {
  try {
    const { email, first_name, last_name, phone, salutation } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if account with email already exists
    const existingUser = await User.findByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists. Please log in.',
      });
    }

    // Generate 6-Digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store in-memory
    otpStore.set(normalizedEmail, {
      otp,
      expiresAt,
      attempts: 0,
      formData: {
        salutation: salutation || 'Mr.',
        first_name: first_name || '',
        last_name: last_name || '',
        phone: phone || '',
        email: normalizedEmail,
      },
    });

    // Send email via dynamic mailer
    try {
      await sendMail({
        to: normalizedEmail,
        subject: `Your Verification Code: ${otp} - Resale Expert`,
        html: renderOtpEmail({
          name: first_name || 'Valued User',
          otpCode: otp,
          companyName: 'Resale Expert',
        }),
      });
    } catch (mailErr) {
      console.error('Error sending registration OTP email:', mailErr);
      return res.status(500).json({
        success: false,
        message: `Failed to send verification email. Please ensure SMTP is configured correctly in Integrations. Error: ${mailErr.message}`,
      });
    }

    res.json({
      success: true,
      message: `A 6-digit verification code has been sent to ${normalizedEmail}.`,
    });
  } catch (error) {
    console.error('sendRegistrationOTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error sending verification code.',
    });
  }
};

/* =========================================================================
   2. VERIFY OTP, CREATE USER & CAPTURE CRM LEAD
========================================================================= */
exports.verifyOTPAndRegister = async (req, res) => {
  try {
    const {
      email,
      otp,
      password,
      salutation,
      first_name,
      last_name,
      phone,
      role = 'buyer',
      username,
      guest_id,
    } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification OTP are required.',
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const otpRecord = otpStore.get(normalizedEmail);

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'No active verification code found. Please request a new code.',
      });
    }

    if (Date.now() > otpRecord.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new code.',
      });
    }

    if (otpRecord.attempts >= 5) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new verification code.',
      });
    }

    if (String(otpRecord.otp).trim() !== String(otp).trim()) {
      otpRecord.attempts += 1;
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code. Please check your email and try again.',
      });
    }

    // Double check if user exists
    const existing = await User.findByEmail(normalizedEmail);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Account with this email already exists. Please log in.',
      });
    }

    // OTP Verified successfully! Clean up record
    otpStore.delete(normalizedEmail);

    const safeSalutation = salutation || otpRecord.formData?.salutation || 'Mr.';
    const safeFirstName = first_name || otpRecord.formData?.first_name || 'User';
    const safeLastName = last_name || otpRecord.formData?.last_name || '';
    const safePhone = phone || otpRecord.formData?.phone || '';
    const safeRole = (role || 'buyer').toLowerCase().trim();
    const finalUsername = username?.trim() || generateUsername(safeFirstName || normalizedEmail);

    // 1. Create User
    const newUser = new User({
      salutation: safeSalutation,
      username: finalUsername,
      first_name: safeFirstName,
      last_name: safeLastName,
      email: normalizedEmail,
      password: bcrypt.hashSync(password, 8),
      phone: safePhone,
      role: safeRole,
      is_active: true,
      is_email_verified: true,
    });

    const createdUser = await User.create(newUser);

    // 2. Automatically Create Lead in CRM `client_leads` table
    try {
      const fullName = `${safeFirstName} ${safeLastName}`.trim() || 'New Registered User';
      await Lead.create({
        salutation: safeSalutation,
        name: fullName,
        phone: safePhone || null,
        email: normalizedEmail,
        lead_type: safeRole, // buyer, seller, owner, tenant, broker
        lead_source: 'Website Registration',
        status: 'new',
        priority: 'hot',
      });
      console.log(`✅ [CRM Lead Auto-Captured] Lead created for registered user ${normalizedEmail} (Role: ${safeRole})`);
    } catch (leadErr) {
      console.warn('⚠️ [CRM Lead Note] Lead entry skipped or duplicate:', leadErr.message);
    }

    // 3. Generate JWT Token for Immediate Login
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const token = jwt.sign(
      {
        id: createdUser.id,
        username: createdUser.username,
        email: createdUser.email,
        role: createdUser.role,
        session_id: sessionId,
      },
      config.secret,
      { expiresIn: config.jwtExpiration }
    );

    // 4. Stitch Guest Activity if guest_id was provided
    if (guest_id) {
      try {
        await UserActivityEvent.stitchGuestToUser(guest_id, createdUser.id);
      } catch (stitchErr) {
        console.error('Error stitching guest in register:', stitchErr);
      }
    }

    // Auto ensure buyer or seller profile is linked
    await ensureBuyerOrSellerProfile(createdUser);

    delete createdUser.password;

    res.status(201).json({
      success: true,
      message: 'Account created and verified successfully!',
      data: {
        user: createdUser,
        accessToken: token,
        session_id: sessionId,
      },
    });
  } catch (error) {
    console.error('verifyOTPAndRegister error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error completing registration.',
    });
  }
};

/* =========================================================================
   3. GOOGLE OAUTH SIGN-IN / SIGN-UP
========================================================================= */
exports.googleAuth = async (req, res) => {
  try {
    const { credential, guest_id, role = 'buyer', phone, salutation } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Google credential token is required.',
      });
    }

    // Verify token with Google
    let googleUser;
    try {
      const response = await axios.get(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
      );
      googleUser = response.data;
    } catch (gErr) {
      console.error('Google token verification failed:', gErr?.response?.data || gErr.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired Google authentication token.',
      });
    }

    if (!googleUser || !googleUser.email) {
      return res.status(400).json({
        success: false,
        message: 'Could not extract valid email from Google profile.',
      });
    }

    const email = googleUser.email.toLowerCase().trim();
    const googleId = googleUser.sub;
    const firstName = googleUser.given_name || googleUser.name?.split(' ')[0] || 'User';
    const lastName = googleUser.family_name || googleUser.name?.split(' ').slice(1).join(' ') || '';
    const avatar = googleUser.picture || null;

    let user = await User.findByEmail(email);

    if (!user) {
      // If new user and phone is not provided, prompt for phone & role
      if (!phone || phone.trim().length < 6) {
        return res.json({
          success: true,
          requires_profile_completion: true,
          data: {
            email,
            first_name: firstName,
            last_name: lastName,
            avatar,
          },
          message: 'Please provide your phone number and persona to complete registration.',
        });
      }

      // First time Google Sign In with Phone -> Auto-create user + CRM Lead
      const generatedUsername = generateUsername(firstName || email);
      const safeRole = (role || 'buyer').toLowerCase().trim();
      const safeSalutation = salutation || 'Mr.';

      const newUser = new User({
        salutation: safeSalutation,
        username: generatedUsername,
        first_name: firstName,
        last_name: lastName,
        email: email,
        password: bcrypt.hashSync(Math.random().toString(36) + Date.now(), 8),
        phone: phone.trim(),
        role: safeRole,
        avatar: avatar,
        google_id: googleId || null,
        is_active: true,
        is_email_verified: true,
      });

      user = await User.create(newUser);

      // Auto capture lead in CRM with complete phone number and role
      try {
        await Lead.create({
          salutation: safeSalutation,
          name: `${firstName} ${lastName}`.trim() || 'Google User',
          phone: phone.trim(),
          email: email,
          lead_type: safeRole, // seller, owner, buyer, tenant, broker
          lead_source: 'Google Sign-In',
          status: 'new',
          priority: 'hot',
        });
        console.log(`✅ [CRM Lead Auto-Captured] Lead created (${safeRole}) with phone for Google user ${email}`);
      } catch (lErr) {
        console.warn('⚠️ [CRM Lead Note] Google lead creation note:', lErr.message);
      }

      user.is_new_user = true;
    } else {
      // User exists, update last login and store google_id/avatar if not present
      await User.updateLastLogin(user.id);
      if (avatar || googleId) {
        try {
          await db.query(
            "UPDATE users SET google_id = COALESCE(google_id, ?), avatar = COALESCE(avatar, ?) WHERE id = ?",
            [googleId || null, avatar || null, user.id]
          );
          if (!user.avatar && avatar) user.avatar = avatar;
          if (!user.google_id && googleId) user.google_id = googleId;
        } catch (uErr) {
          console.warn("Update user google info note:", uErr.message);
        }
      }
      user.is_new_user = false;
    }

    // Generate JWT
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        session_id: sessionId,
      },
      config.secret,
      { expiresIn: config.jwtExpiration }
    );

    // Stitch guest
    if (guest_id) {
      try {
        await UserActivityEvent.stitchGuestToUser(guest_id, user.id);
      } catch (stitchErr) {
        console.error('Error stitching guest in google auth:', stitchErr);
      }
    }

    // Auto ensure buyer or seller profile is linked
    await ensureBuyerOrSellerProfile(user);

    delete user.password;

    res.json({
      success: true,
      message: 'Logged in with Google successfully!',
      is_new_user: Boolean(user.is_new_user),
      data: {
        user,
        accessToken: token,
        session_id: sessionId,
        is_new_user: Boolean(user.is_new_user),
      },
    });
  } catch (error) {
    console.error('googleAuth error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error authenticating with Google.',
    });
  }
};