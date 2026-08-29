const User = require('../models/User');
const LoginLog = require('../models/LoginLog');
const { reverseGeocodeNonBlocking } = require('../utils/geocoder');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/auth.config');

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