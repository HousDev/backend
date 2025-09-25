const User = require('../models/User');
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
    console.log('Signin request body:', req.body);

    // Validate request
    if (!req.body.username || !req.body.password) {
      console.log('Validation failed: Missing username or password');
      return res.status(400).send({
        success: false,
        message: 'Username and password are required!'
      });
    }

    // Find user by username
    const user = await User.findByUsername(req.body.username);
    console.log('User fetched from DB:', user);

    if (!user) {
      console.log('User not found for username:', req.body.username);
      return res.status(401).send({
        success: false,
        message: 'Invalid username or password!'
      });
    }

    // Check if user is active
    if (!user.is_active) {
      console.log('User inactive:', user.username);
      return res.status(401).send({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.'
      });
    }

    // Verify password
    console.log('Comparing password:', req.body.password, 'with hash:', user.password);
    const passwordIsValid = bcrypt.compareSync(req.body.password, user.password);
    console.log('Password valid?', passwordIsValid);

    if (!passwordIsValid) {
      console.log('Password invalid for user:', user.username);
      return res.status(401).send({
        success: false,
        message: 'Invalid username or password!'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      config.secret,
      { expiresIn: config.jwtExpiration }
    );
    console.log('JWT token generated for user:', user.username);

    // Update last login
    await User.updateLastLogin(user.id);
    console.log('Updated last login for user:', user.username);

    // Remove password from response
    delete user.password;

    res.send({
      success: true,
      message: 'Login successful!',
      data: {
        user: user,
        accessToken: token
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


// User Login (updated to allow buyer_id / seller_id login)
// exports.signin = async (req, res) => {
//   try {
//     console.log('Signin request received');

//     // Validate request
//     const { username, password, buyer_id, seller_id } = req.body;
//     if (!password || (!username && !buyer_id && !seller_id)) {
//       console.log('Validation failed: Missing identifier or password');
//       return res.status(400).send({
//         success: false,
//         message: 'Provide password and one of username / buyer_id / seller_id.'
//       });
//     }

//     // Determine lookup method (priority: buyer_id -> seller_id -> username)
//     let user = null;
//     if (buyer_id) {
//       console.log('Looking up user by buyer_id');
//       user = await User.findByBuyerId(buyer_id); // implement in your model if not present
//       if (!user) {
//         console.log('No user found for buyer_id:', buyer_id);
//         return res.status(401).send({ success: false, message: 'Invalid credentials.' });
//       }
//       if (user.role !== 'buyer') {
//         console.log('Role mismatch for buyer_id. Expected buyer, got:', user.role);
//         return res.status(403).send({ success: false, message: 'Account role mismatch.' });
//       }
//     } else if (seller_id) {
//       console.log('Looking up user by seller_id');
//       user = await User.findBySellerId(seller_id); // implement in your model if not present
//       if (!user) {
//         console.log('No user found for seller_id:', seller_id);
//         return res.status(401).send({ success: false, message: 'Invalid credentials.' });
//       }
//       if (user.role !== 'seller') {
//         console.log('Role mismatch for seller_id. Expected seller, got:', user.role);
//         return res.status(403).send({ success: false, message: 'Account role mismatch.' });
//       }
//     } else {
//       console.log('Looking up user by username:', username);
//       user = await User.findByUsername(username);
//       if (!user) {
//         console.log('User not found for username:', username);
//         return res.status(401).send({
//           success: false,
//           message: 'Invalid username or password!'
//         });
//       }
//     }

//     // Check if user is active
//     if (!user.is_active) {
//       console.log('User inactive:', user.username || user.id);
//       return res.status(401).send({
//         success: false,
//         message: 'Your account has been deactivated. Please contact administrator.'
//       });
//     }

//     // Verify password (DO NOT log raw password)
//     const passwordIsValid = bcrypt.compareSync(password, user.password);
//     console.log('Password validation result for user id:', user.id, '=', passwordIsValid);

//     if (!passwordIsValid) {
//       console.log('Password invalid for user id:', user.id);
//       return res.status(401).send({
//         success: false,
//         message: 'Invalid username or password!'
//       });
//     }

//     // Generate JWT token
//     const token = jwt.sign(
//       {
//         id: user.id,
//         username: user.username,
//         email: user.email,
//         role: user.role
//       },
//       config.secret,
//       { expiresIn: config.jwtExpiration }
//     );
//     console.log('JWT token generated for user id:', user.id);

//     // Update last login
//     await User.updateLastLogin(user.id);
//     console.log('Updated last login for user id:', user.id);

//     // Remove password from response object safely
//     const safeUser = { ...user };
//     if (safeUser.password) delete safeUser.password;

//     res.send({
//       success: true,
//       message: 'Login successful!',
//       data: {
//         user: safeUser,
//         accessToken: token
//       }
//     });
//   } catch (err) {
//     console.error('Signin error:', err);
//     res.status(500).send({
//       success: false,
//       message: err.message || 'Error occurred during login.'
//     });
//   }
// };


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
    // In a stateless JWT setup, logout is typically handled client-side
    // But we can log this action or implement token blacklisting if needed
    
    res.send({
      success: true,
      message: 'Logged out successfully!'
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error occurred during logout.'
    });
  }
};