const User = require('../models/User');
const bcrypt = require('bcryptjs');
const db = require('../config/database'); // Assuming you have a db config file
const path = require("path");
const fs = require("fs");

// Update user (for admin)
exports.updateUser = async (req, res) => {
  try {
    const allowedFields = [
      'salutation',       // नया
      'first_name',
      'last_name',
       'username',  
      'email',
      'phone',
      'role',            // dynamic role allowed
      'is_active',
      'avatar',
      'designation',
      'department',
      'module_permissions',
      'dob',             // existing
      'blood_group',     // existing
      'buyer_id',        // नया
      'seller_id'        // नया
    ];
    const updateData = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        // numeric ids: normalize empty string to null, convert to int if present
        if ((field === 'buyer_id' || field === 'seller_id') && req.body[field] !== '') {
          const val = parseInt(req.body[field], 10);
          updateData[field] = Number.isNaN(val) ? null : val;
        } else if ((field === 'buyer_id' || field === 'seller_id') && req.body[field] === '') {
          updateData[field] = null;
        } else {
          updateData[field] = req.body[field];
        }
      }
    });

    // If role is provided, just trim it
    if (updateData.role) {
      updateData.role = updateData.role.trim();
      if (!updateData.role) delete updateData.role; // ignore empty role
    }

    // Hash new password if provided
    if (req.body.password) {
      if (req.body.password.length < 6) {
        return res.status(400).send({
          success: false,
          message: 'Password must be at least 6 characters long!'
        });
      }
      updateData.password = bcrypt.hashSync(req.body.password, 8);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).send({
        success: false,
        message: 'No valid fields to update.'
      });
    }

    const data = await User.updateById(req.params.userId, updateData);

    if (data.kind === 'not_found') {
      return res.status(404).send({
        success: false,
        message: `User not found with id ${req.params.userId}.`
      });
    }

    // don't return password in response
    if (data.password) delete data.password;

    res.send({
      success: true,
      message: 'User updated successfully!',
      data
    });

  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).send({
      success: false,
      message: err.message || 'Error updating user with id ' + req.params.userId
    });
  }
};


// Create new user (admin only)
exports.createUser = async (req, res) => {
  try {
    const {
      username, salutation, first_name, last_name, email, password, phone, role, avatar,
      designation, department, module_permissions,
      dob, blood_group, buyer_id, seller_id
    } = req.body;

    // Required fields validation
    if (!username || !first_name || !last_name || !email || !password) {
      return res.status(400).send({
        success: false,
        message: 'Required fields missing!'
      });
    }

    // Password length check
    if (password.length < 6) {
      return res.status(400).send({
        success: false,
        message: 'Password must be at least 6 characters long!'
      });
    }

    // Use role from frontend directly (dynamic). Default to 'agent' if not provided/empty
    const userRole = role && role.trim() ? role.trim() : 'agent';

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 8);

    const newUser = {
      username: username.trim(),
      salutation: salutation || null,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: email.trim(),
      password: hashedPassword,
      phone: phone || null,
      role: userRole,
      avatar: avatar || null,
      designation: designation || null,
      department: department || null,
      module_permissions: module_permissions || {}, // keep as object
      dob: dob || null,
      blood_group: blood_group || null,
      buyer_id: buyer_id !== undefined && buyer_id !== '' ? (Number.isNaN(parseInt(buyer_id, 10)) ? null : parseInt(buyer_id, 10)) : null,
      seller_id: seller_id !== undefined && seller_id !== '' ? (Number.isNaN(parseInt(seller_id, 10)) ? null : parseInt(seller_id, 10)) : null
    };

    const createdUser = await User.create(newUser);

    if (createdUser.password) delete createdUser.password;

    res.status(201).send({
      success: true,
      message: 'User created successfully!',
      data: createdUser
    });

  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).send({
      success: false,
      message: err.message || 'Error creating user.'
    });
  }
};


// Get all users (for admin)
exports.getAllUsers = async (req, res) => {
  try {
    const data = await User.getAll();
    // Remove passwords before sending
    const sanitized = data.map(u => {
      if (u.password) delete u.password;
      return u;
    });
    res.send({
      success: true,
      data: sanitized
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Some error occurred while retrieving users.'
    });
  }
};


// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const data = await User.findById(req.userId);
    if (data) {
      // Remove password from response
      if (data.password) delete data.password;
      res.send({
        success: true,
        data: data
      });
    } else {
      res.status(404).send({
        success: false,
        message: 'User not found.'
      });
    }
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving user profile.'
    });
  }
};

// Update user profile (self)
exports.updateProfile = async (req, res) => {
  try {
    // Don't allow updating email, username, or role through this endpoint
    const allowedFields = ['salutation', 'first_name', 'last_name', 'phone', 'avatar', 'dob', 'blood_group', 'buyer_id', 'seller_id'];
    const updateData = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if ((field === 'buyer_id' || field === 'seller_id') && req.body[field] !== '') {
          const val = parseInt(req.body[field], 10);
          updateData[field] = Number.isNaN(val) ? null : val;
        } else if ((field === 'buyer_id' || field === 'seller_id') && req.body[field] === '') {
          updateData[field] = null;
        } else {
          updateData[field] = req.body[field];
        }
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).send({
        success: false,
        message: 'No valid fields to update.'
      });
    }

    const data = await User.updateById(req.userId, updateData);

    if (data.kind === 'not_found') {
      res.status(404).send({
        success: false,
        message: 'User not found.'
      });
    } else {
      // Remove password from response
      if (data.password) delete data.password;
      res.send({
        success: true,
        message: 'Profile updated successfully!',
        data: data
      });
    }
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error updating profile.'
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).send({
        success: false,
        message: 'Current password and new password are required!'
      });
    }

    if (new_password.length < 6) {
      return res.status(400).send({
        success: false,
        message: 'New password must be at least 6 characters long!'
      });
    }

    // Get current user data
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).send({
        success: false,
        message: 'User not found.'
      });
    }

    // Verify current password
    const passwordIsValid = bcrypt.compareSync(current_password, user.password);
    if (!passwordIsValid) {
      return res.status(400).send({
        success: false,
        message: 'Current password is incorrect!'
      });
    }

    // Hash new password
    const hashedNewPassword = bcrypt.hashSync(new_password, 8);

    const data = await User.updateById(req.userId, {
      password: hashedNewPassword
    });

    if (data.kind === 'not_found') {
      res.status(404).send({
        success: false,
        message: 'User not found.'
      });
    } else {
      res.send({
        success: true,
        message: 'Password changed successfully!'
      });
    }
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error changing password.'
    });
  }
};

// Get user by ID (for admin)
exports.getUserById = async (req, res) => {
  try {
    const data = await User.findById(req.params.userId);
    if (data) {
      // Remove password from response
      if (data.password) delete data.password;
      res.send({
        success: true,
        data: data
      });
    } else {
      res.status(404).send({
        success: false,
        message: `User not found with id ${req.params.userId}.`
      });
    }
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving user with id ' + req.params.userId
    });
  }
};

// Delete user (for admin)
exports.deleteUser = async (req, res) => {
  try {
    const data = await User.remove(req.params.userId);

    if (data.kind === 'not_found') {
      res.status(404).send({
        success: false,
        message: `User not found with id ${req.params.userId}.`
      });
    } else {
      res.send({
        success: true,
        message: 'User deleted successfully!'
      });
    }
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Could not delete user with id ' + req.params.userId
    });
  }
};

// Get agents (users with role 'agent')
exports.getAgents = async (req, res) => {
  try {
    const data = await User.getByRole('agent');
    // Remove passwords from response
    const agents = data.map(agent => {
      if (agent.password) delete agent.password;
      return agent;
    });

    res.send({
      success: true,
      data: agents
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving agents.'
    });
  }
};

// Get user dashboard stats
exports.getDashboardStats = async (req, res) => {
  try {
    const Lead = require('../models/Lead');
    const Property = require('../models/Property');
    const Activity = require('../models/Activity');

    const [leadsStats, propertiesStats, activitiesStats] = await Promise.all([
      Lead.getLeadsStats(),
      Property.getPropertiesStats(),
      Activity.getActivitiesStats(req.userId)
    ]);

    res.send({
      success: true,
      data: {
        leads: leadsStats,
        properties: propertiesStats,
        activities: activitiesStats
      }
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving dashboard statistics.'
    });
  }
};

exports.filterData = async (req, res) => {
  try {
    const { status, role, search, page = 1, limit = 20 } = req.query;
    let query = "SELECT * FROM users WHERE 1=1";
    const values = [];

    // Filter by active/inactive - Cast to integer for comparison
    if (status) {
      if (status.toLowerCase() === "active") {
        query += " AND CAST(is_active AS UNSIGNED) = 1";
      } else if (status.toLowerCase() === "inactive" || status.toLowerCase() === "deactivate") {
        query += " AND (CAST(is_active AS UNSIGNED) = 0 OR is_active IS NULL)";
      }
    }

    // Filter by role
    if (role) {
      query += " AND role = ?";
      values.push(role);
    }

    // Search by username, email, first_name, last_name
    if (search) {
      query += " AND (username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)";
      const like = `%${search}%`;
      values.push(like, like, like, like);
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    values.push(parseInt(limit), offset);

    console.log("Final query:", query);
    console.log("Query values:", values);

    const [rows] = await db.query(query, values);
    // console.log("Database results:", rows);

    // sanitize passwords
    const sanitized = rows.map(r => {
      if (r.password) delete r.password;
      return r;
    });

    res.send({ success: true, data: sanitized });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).send({ success: false, message: err.message });
  }
};

// Upload avatar (profile picture)
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({
        success: false,
        message: "No file uploaded!",
      });
    }

    // Save avatar path in DB (ensure path starts with '/')
    const avatarPath = `/uploads/avatars/${req.file.filename}`;
    await User.updateById(req.userId, { avatar: avatarPath });

    res.send({
      success: true,
      message: "Profile picture updated successfully!",
      data: { avatar: avatarPath }
    });
  } catch (err) {
    console.error("Error uploading avatar:", err);
    res.status(500).send({
      success: false,
      message: err.message || "Error uploading avatar",
    });
  }
};

// Remove avatar
exports.removeAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.avatar) {
      return res.status(404).send({
        success: false,
        message: "No avatar found",
      });
    }

    // Jo path DB me save hai wo "/uploads/avatars/..." format ka hai
    // use path.resolve to build absolute path relative to project root
    const avatarRel = user.avatar.replace(/^\//, "");
    const filePath = path.resolve(__dirname, "..", avatarRel);

    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath); // delete file
      } catch (unlinkErr) {
        console.warn("Unable to delete avatar file:", unlinkErr);
        // proceed to update DB anyway
      }
    }

    await User.updateById(req.userId, { avatar: null });

    res.send({
      success: true,
      message: "Profile picture removed successfully!",
    });
  } catch (err) {
    console.error("Error removing avatar:", err);
    res.status(500).send({
      success: false,
      message: err.message || "Error removing avatar",
    });
  }
};
