const jwt = require('jsonwebtoken');
const config = require('../config/auth.config');
const User = require('../models/User');

// Verify JWT Token
const verifyToken = (req, res, next) => {
  let token = req.headers['x-access-token'] || req.headers['authorization'];

  if (!token) {
    return res.status(403).send({
      success: false,
      message: 'No token provided!'
    });
  }

  // Remove 'Bearer ' if present
  if (token.startsWith('Bearer ')) {
    token = token.slice(7, token.length);
  }

  jwt.verify(token, config.secret, async (err, decoded) => {
    if (err) {
      return res.status(401).send({
        success: false,
        message: 'Unauthorized! Invalid token.'
      });
    }

    try {
      // Check if user still exists and is active
      const user = await User.findById(decoded.id);
      if (!user || !user.is_active) {
        return res.status(401).send({
          success: false,
          message: 'User not found or inactive!'
        });
      }

      req.userId = decoded.id;
      req.userRole = decoded.role;
      req.userEmail = decoded.email;
      req.username = decoded.username;
      next();
    } catch (error) {
      return res.status(500).send({
        success: false,
        message: 'Error verifying user!'
      });
    }
  });
};

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).send({
      success: false,
      message: 'Require Admin Role!'
    });
  }
  next();
};

// Check if user is manager
const isManager = (req, res, next) => {
  if (req.userRole !== 'manager' && req.userRole !== 'admin') {
    return res.status(403).send({
      success: false,
      message: 'Require Manager Role!'
    });
  }
  next();
};

// Check if user is agent
const isAgent = (req, res, next) => {
  if (req.userRole !== 'agent' && req.userRole !== 'manager' && req.userRole !== 'admin') {
    return res.status(403).send({
      success: false,
      message: 'Require Agent Role!'
    });
  }
  next();
};

// Check if user is agent or admin
const isAgentOrAdmin = (req, res, next) => {
  if (req.userRole !== 'agent' && req.userRole !== 'admin') {
    return res.status(403).send({
      success: false,
      message: 'Require Agent or Admin Role!'
    });
  }
  next();
};

// Check if user is manager or admin
const isManagerOrAdmin = (req, res, next) => {
  if (req.userRole !== 'manager' && req.userRole !== 'admin') {
    return res.status(403).send({
      success: false,
      message: 'Require Manager or Admin Role!'
    });
  }
  next();
};

module.exports = {
  verifyToken,
  isAdmin,
  isManager,
  isAgent,
  isAgentOrAdmin,
  isManagerOrAdmin
};