const User = require('../models/User');
const bcrypt = require('bcryptjs');
const db = require('../config/database'); // Assuming you have a db config file
const path = require("path");
const fs = require("fs");
const XLSX = require('xlsx');


// Update user (admin only)
exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.userId;

    // Allowed fields to update
    const allowedFields = [
      'username',
      'salutation',
      'first_name',
      'last_name',
      'email',
      'phone',
      'role',
      'is_active',
      'avatar',
      'designation',
      'department',
      'module_permissions',
      'dob',
      'blood_group',
      'buyer_id',
      'seller_id'
    ];

    const updateData = {};

    // Prepare update data
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        let value = req.body[field];

        // Normalize buyer/seller IDs
        if ((field === 'buyer_id' || field === 'seller_id')) {
          if (value === '' || value === null) {
            updateData[field] = null;
          } else {
            const val = parseInt(value, 10);
            updateData[field] = Number.isNaN(val) ? null : val;
          }
        } else {
          updateData[field] = value;
        }
      }
    });

    // Trim role and ignore empty string
    if (updateData.role) {
      updateData.role = updateData.role.trim();
      if (!updateData.role) delete updateData.role;
    }

    // Hash password if provided
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

    // Call your model's update function
    // Make sure it returns the updated user
    const updatedUser = await User.updateById(userId, updateData);

    if (!updatedUser) {
      return res.status(404).send({
        success: false,
        message: `User not found with id ${userId}.`
      });
    }

    // Remove password from response
    if (updatedUser.password) delete updatedUser.password;

    res.status(200).send({
      success: true,
      message: 'User updated successfully!',
      data: updatedUser
    });

  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).send({
      success: false,
      message: err.message || `Error updating user with id ${req.params.userId}`
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


    const [rows] = await db.query(query, values);


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

exports.getByDeptRole = async (req, res) => {
  try {
    const {
      department,
      role,
      is_active,     // optional: 1/0/true/false
      limit,
      offset,
    } = req.query;

    if (!department || !role) {
      return res.status(400).json({
        ok: false,
        error: "department and role are required query params",
        example: "/api/users/by-dept-role?department=sales&role=executive",
      });
    }

    const rows = await User.getByDepartmentAndRole(department, role, {
      is_active,
      limit: limit ? Number(limit) : 200,
      offset: offset ? Number(offset) : 0,
    });

    res.json({ ok: true, count: rows.length, data: rows });
  } catch (e) {
    console.error("getByDeptRole error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
};

/** GET /api/users/sales-executives?is_active=1&limit=200&offset=0 */
exports.getSalesExecutives = async (req, res) => {
  try {
    const { is_active, limit, offset } = req.query;

    const rows = await User.getSalesExecutives({
      is_active,
      limit: limit ? Number(limit) : 200,
      offset: offset ? Number(offset) : 0,
    });

    res.json({ ok: true, count: rows.length, data: rows });
  } catch (e) {
    console.error("getSalesExecutives error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
};



exports.exportUsers = async (req, res) => {
  try {
    const { format = 'excel' } = req.query;
    const users = await User.getAll();
    
    // Prepare data for export
    const exportData = users.map(user => ({
      'Username': user.username || '',
      'Salutation': user.salutation || '',
      'First Name': user.first_name || '',
      'Last Name': user.last_name || '',
      'Email': user.email || '',
      'Phone': user.phone || '',
      'Role': user.role || '',
      'Department': user.department || '',
      'Designation': user.designation || '',
      'Status': user.is_active ? 'Active' : 'Inactive',
      'Date of Birth': user.dob || '',
      'Blood Group': user.blood_group || '',
      'Created At': user.created_at ? new Date(user.created_at).toLocaleDateString() : '',
      'Last Login': user.last_login ? new Date(user.last_login).toLocaleDateString() : ''
    }));

    if (format === 'csv') {
      // CSV Export
      const headers = Object.keys(exportData[0] || {});
      const csvRows = [
        headers.join(','),
        ...exportData.map(row => headers.map(h => JSON.stringify(row[h] || '')).join(','))
      ];
      const csv = csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=users-${Date.now()}.csv`);
      return res.send(csv);
    } else {
      // Excel Export
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Users');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=users-${Date.now()}.xlsx`);
      return res.send(buffer);
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, message: 'Failed to export users' });
  }
};

// 2. DOWNLOAD IMPORT TEMPLATE
exports.downloadImportTemplate = async (req, res) => {
  try {
    const templateData = [{
      'Username': 'john_doe',
      'Salutation': 'Mr',
      'First Name': 'John',
      'Last Name': 'Doe',
      'Email': 'john@example.com',
      'Phone': '9876543210',
      'Role': 'agent',
      'Department': 'Sales',
      'Designation': 'Sales Executive',
      'Password': 'password123',
      'Date of Birth': '1990-01-15',
      'Blood Group': 'O+',
      'Status': 'active'
    }];

    const ws = XLSX.utils.json_to_sheet(templateData);
    
    // Add instructions sheet
    const instructions = [{
      'Instruction': '1. Do not modify column headers',
      'Note': ''
    }, {
      'Instruction': '2. Email must be unique',
      'Note': ''
    }, {
      'Instruction': '3. Password minimum 6 characters',
      'Note': ''
    }, {
      'Instruction': '4. Valid roles: admin, agent, manager, buyer, seller, executive',
      'Note': ''
    }, {
      'Instruction': '5. Status: active or inactive',
      'Note': ''
    }, {
      'Instruction': '6. Date format: YYYY-MM-DD',
      'Note': ''
    }];
    
    const wsInstructions = XLSX.utils.json_to_sheet(instructions);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'User Template');
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=user-import-template.xlsx');
    return res.send(buffer);
  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({ success: false, message: 'Failed to download template' });
  }
};

// 3. IMPORT USERS
exports.importUsers = async (req, res) => {
  let filePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    
    let usersData = [];
    
    if (fileExt === '.csv') {
      // Parse CSV
      const csv = fs.readFileSync(filePath, 'utf8');
      const lines = csv.split('\n');
      const headers = lines[0].split(',');
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((header, idx) => {
          row[header.trim()] = values[idx]?.trim().replace(/^"|"$/g, '') || '';
        });
        usersData.push(row);
      }
    } else {
      // Parse Excel
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      usersData = XLSX.utils.sheet_to_json(worksheet);
    }

    const errors = [];
    let importedCount = 0;
    const bcrypt = require('bcryptjs');

    for (let i = 0; i < usersData.length; i++) {
      const row = usersData[i];
      try {
        // Validate required fields
        if (!row['Email'] || !row['First Name'] || !row['Last Name']) {
          errors.push(`Row ${i + 2}: Missing required fields (Email, First Name, Last Name)`);
          continue;
        }

        // Check if email exists
        const existingUser = await User.findByEmail(row['Email']);
        if (existingUser) {
          errors.push(`Row ${i + 2}: Email ${row['Email']} already exists`);
          continue;
        }

        // Hash password
        const hashedPassword = bcrypt.hashSync(row['Password'] || 'default123', 8);

        // Create user
        const newUser = {
          username: row['Username'] || row['Email'].split('@')[0],
          salutation: row['Salutation'] || null,
          first_name: row['First Name'],
          last_name: row['Last Name'],
          email: row['Email'],
          password: hashedPassword,
          phone: row['Phone'] || null,
          role: row['Role']?.toLowerCase() || 'agent',
          department: row['Department'] || null,
          designation: row['Designation'] || null,
          is_active: row['Status']?.toLowerCase() === 'active',
          dob: row['Date of Birth'] || null,
          blood_group: row['Blood Group'] || null
        };

        await User.create(newUser);
        importedCount++;
      } catch (err) {
        errors.push(`Row ${i + 2}: ${err.message}`);
      }
    }

    // Clean up temp file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({
      success: true,
      message: `Successfully imported ${importedCount} users`,
      importedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error('Import error:', error);
    res.status(500).json({ success: false, message: 'Failed to import users: ' + error.message });
  }
};

// ==================== NEW FUNCTIONS FOR TAB-WISE EXPORT/IMPORT ====================

// 1. Tab-wise Export
exports.exportUsersByTab = async (req, res) => {
  try {
    const { tabType = 'all', format = 'excel' } = req.query;
    
    let users = [];
    
    // Get data based on tab type
    switch (tabType) {
      case 'buyers':
        // Fetch buyers from buyers table
        const [buyers] = await db.query("SELECT id, salutation, name, email, phone, dob, is_active, created_at FROM buyers");
        users = buyers.map(b => ({
          'ID': b.id,
          'Salutation': b.salutation || '',
          'Name': b.name || '',
          'Email': b.email || '',
          'Phone': b.phone || '',
          'Date of Birth': b.dob || '',
          'Status': b.is_active ? 'Active' : 'Inactive',
          'Created At': b.created_at ? new Date(b.created_at).toLocaleDateString() : ''
        }));
        break;
        
      case 'sellers':
        // Fetch sellers from sellers table
        const [sellers] = await db.query("SELECT id, salutation, name, email, phone, seller_dob as dob, is_active, created_at FROM sellers");
        users = sellers.map(s => ({
          'ID': s.id,
          'Salutation': s.salutation || '',
          'Name': s.name || '',
          'Email': s.email || '',
          'Phone': s.phone || '',
          'Date of Birth': s.dob || '',
          'Status': s.is_active ? 'Active' : 'Inactive',
          'Created At': s.created_at ? new Date(s.created_at).toLocaleDateString() : ''
        }));
        break;
        
      case 'buyer-accounts':
      case 'seller-accounts':
        // Fetch users with role buyer or seller
        const role = tabType === 'buyer-accounts' ? 'buyer' : 'seller';
        const [accountUsers] = await db.query(
          "SELECT id, username, salutation, first_name, last_name, email, phone, role, is_active, dob, created_at, last_login FROM users WHERE role = ?",
          [role]
        );
        users = accountUsers.map(u => ({
          'ID': u.id,
          'Username': u.username || '',
          'Salutation': u.salutation || '',
          'First Name': u.first_name || '',
          'Last Name': u.last_name || '',
          'Email': u.email || '',
          'Phone': u.phone || '',
          'Role': u.role || '',
          'Status': u.is_active ? 'Active' : 'Inactive',
          'Date of Birth': u.dob || '',
          'Created At': u.created_at ? new Date(u.created_at).toLocaleDateString() : '',
          'Last Login': u.last_login ? new Date(u.last_login).toLocaleDateString() : ''
        }));
        break;
        
      default: // 'all' or team members
        // Fetch all users
        const [allUsers] = await db.query(
          "SELECT id, username, salutation, first_name, last_name, email, phone, role, department, designation, is_active, dob, blood_group, created_at, last_login FROM users"
        );
        users = allUsers.map(u => ({
          'ID': u.id,
          'Username': u.username || '',
          'Salutation': u.salutation || '',
          'First Name': u.first_name || '',
          'Last Name': u.last_name || '',
          'Email': u.email || '',
          'Phone': u.phone || '',
          'Role': u.role || '',
          'Department': u.department || '',
          'Designation': u.designation || '',
          'Status': u.is_active ? 'Active' : 'Inactive',
          'Date of Birth': u.dob || '',
          'Blood Group': u.blood_group || '',
          'Created At': u.created_at ? new Date(u.created_at).toLocaleDateString() : '',
          'Last Login': u.last_login ? new Date(u.last_login).toLocaleDateString() : ''
        }));
        break;
    }

    if (format === 'csv') {
      // CSV Export
      const headers = Object.keys(users[0] || {});
      const csvRows = [
        headers.join(','),
        ...users.map(row => headers.map(h => JSON.stringify(row[h] || '')).join(','))
      ];
      const csv = csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${tabType}-${Date.now()}.csv`);
      return res.send(csv);
    } else {
      // Excel Export
      const ws = XLSX.utils.json_to_sheet(users);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tabType);
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${tabType}-${Date.now()}.xlsx`);
      return res.send(buffer);
    }
  } catch (error) {
    console.error('Export by tab error:', error);
    res.status(500).json({ success: false, message: 'Failed to export data' });
  }
};

// 2. Download Import Template (updated to handle type)
exports.downloadImportTemplate = async (req, res) => {
  try {
    const { type = 'users' } = req.query;
    
    let templateData = [];
    let sheetName = '';
    
    if (type === 'buyers') {
      templateData = [{
        'Salutation': 'Mr',
        'Name': 'John Doe',
        'Email': 'john@example.com',
        'Phone': '9876543210',
        'Date of Birth': '1990-01-15',
        'Status': 'active'
      }];
      sheetName = 'Buyers Template';
    } else if (type === 'sellers') {
      templateData = [{
        'Salutation': 'Mrs',
        'Name': 'Jane Smith',
        'Email': 'jane@example.com',
        'Phone': '9876543211',
        'Date of Birth': '1988-05-20',
        'Status': 'active'
      }];
      sheetName = 'Sellers Template';
    } else {
      templateData = [{
        'Username': 'john_doe',
        'Salutation': 'Mr',
        'First Name': 'John',
        'Last Name': 'Doe',
        'Email': 'john@example.com',
        'Phone': '9876543210',
        'Role': 'agent',
        'Department': 'Sales',
        'Designation': 'Sales Executive',
        'Password': 'password123',
        'Date of Birth': '1990-01-15',
        'Blood Group': 'O+',
        'Status': 'active'
      }];
      sheetName = 'Users Template';
    }

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${type}-import-template.xlsx`);
    return res.send(buffer);
  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({ success: false, message: 'Failed to download template' });
  }
};

// 3. Import Users By Type
exports.importUsersByType = async (req, res) => {
  let filePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { type = 'users' } = req.body;
    filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    
    let importData = [];
    
    if (fileExt === '.csv') {
      const csv = fs.readFileSync(filePath, 'utf8');
      const lines = csv.split('\n');
      const headers = lines[0].split(',');
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((header, idx) => {
          row[header.trim()] = values[idx]?.trim().replace(/^"|"$/g, '') || '';
        });
        importData.push(row);
      }
    } else {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      importData = XLSX.utils.sheet_to_json(worksheet);
    }

    const errors = [];
    let importedCount = 0;

    if (type === 'buyers') {
      // Import buyers
      for (let i = 0; i < importData.length; i++) {
        const row = importData[i];
        try {
          if (!row['Email'] || !row['Name']) {
            errors.push(`Row ${i + 2}: Missing required fields (Email, Name)`);
            continue;
          }
          // Check if buyer exists
          const [existing] = await db.query("SELECT id FROM buyers WHERE email = ?", [row['Email']]);
          if (existing.length > 0) {
            errors.push(`Row ${i + 2}: Email ${row['Email']} already exists`);
            continue;
          }
          
          await db.query(
            "INSERT INTO buyers (salutation, name, email, phone, dob, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
            [
              row['Salutation'] || null,
              row['Name'],
              row['Email'],
              row['Phone'] || null,
              row['Date of Birth'] || null,
              row['Status']?.toLowerCase() === 'active' ? 1 : 0
            ]
          );
          importedCount++;
        } catch (err) {
          errors.push(`Row ${i + 2}: ${err.message}`);
        }
      }
    } else if (type === 'sellers') {
      // Import sellers
      for (let i = 0; i < importData.length; i++) {
        const row = importData[i];
        try {
          if (!row['Email'] || !row['Name']) {
            errors.push(`Row ${i + 2}: Missing required fields (Email, Name)`);
            continue;
          }
          const [existing] = await db.query("SELECT id FROM sellers WHERE email = ?", [row['Email']]);
          if (existing.length > 0) {
            errors.push(`Row ${i + 2}: Email ${row['Email']} already exists`);
            continue;
          }
          
          await db.query(
            "INSERT INTO sellers (salutation, name, email, phone, seller_dob, is_active, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
            [
              row['Salutation'] || null,
              row['Name'],
              row['Email'],
              row['Phone'] || null,
              row['Date of Birth'] || null,
              row['Status']?.toLowerCase() === 'active' ? 1 : 0,
              row['Status']?.toLowerCase() === 'active' ? 'active' : 'inactive'
            ]
          );
          importedCount++;
        } catch (err) {
          errors.push(`Row ${i + 2}: ${err.message}`);
        }
      }
    } else {
      // Import users (existing logic)
      for (let i = 0; i < importData.length; i++) {
        const row = importData[i];
        try {
          if (!row['Email'] || !row['First Name'] || !row['Last Name']) {
            errors.push(`Row ${i + 2}: Missing required fields`);
            continue;
          }
          const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [row['Email']]);
          if (existing.length > 0) {
            errors.push(`Row ${i + 2}: Email ${row['Email']} already exists`);
            continue;
          }
          
          const hashedPassword = bcrypt.hashSync(row['Password'] || 'default123', 8);
          
          await db.query(
            `INSERT INTO users (username, salutation, first_name, last_name, email, password, phone, role, department, designation, is_active, dob, blood_group, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              row['Username'] || row['Email'].split('@')[0],
              row['Salutation'] || null,
              row['First Name'],
              row['Last Name'],
              row['Email'],
              hashedPassword,
              row['Phone'] || null,
              row['Role']?.toLowerCase() || 'agent',
              row['Department'] || null,
              row['Designation'] || null,
              row['Status']?.toLowerCase() === 'active' ? 1 : 0,
              row['Date of Birth'] || null,
              row['Blood Group'] || null
            ]
          );
          importedCount++;
        } catch (err) {
          errors.push(`Row ${i + 2}: ${err.message}`);
        }
      }
    }

    // Clean up temp file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({
      success: true,
      message: `Successfully imported ${importedCount} ${type}`,
      importedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error('Import error:', error);
    res.status(500).json({ success: false, message: 'Failed to import: ' + error.message });
  }
};