// const jwt = require('jsonwebtoken');
// const config = require('../config/auth.config');
// const User = require('../models/User');

// // Verify JWT Token
// const verifyToken = (req, res, next) => {
//   let token = req.headers['x-access-token'] || req.headers['authorization'];

//   if (!token) {
//     return res.status(403).send({
//       success: false,
//       message: 'No token provided!'
//     });
//   }

//   // Remove 'Bearer ' if present
//   if (token.startsWith('Bearer ')) {
//     token = token.slice(7, token.length);
//   }

//   jwt.verify(token, config.secret, async (err, decoded) => {
//     if (err) {
//       return res.status(401).send({
//         success: false,
//         message: 'Unauthorized! Invalid token.'
//       });
//     }

//     try {
//       // Check if user still exists and is active
//       const user = await User.findById(decoded.id);
//       if (!user || !user.is_active) {
//         return res.status(401).send({
//           success: false,
//           message: 'User not found or inactive!'
//         });
//       }

//       req.userId = decoded.id;
//       req.userRole = decoded.role;
//       req.userEmail = decoded.email;
//       req.username = decoded.username;
//       next();
//     } catch (error) {
//       return res.status(500).send({
//         success: false,
//         message: 'Error verifying user!'
//       });
//     }
//   });
// };

// // Check if user is admin
// const isAdmin = (req, res, next) => {
//   if (req.userRole !== 'admin') {
//     return res.status(403).send({
//       success: false,
//       message: 'Require Admin Role!'
//     });
//   }
//   next();
// };

// // Check if user is manager
// const isManager = (req, res, next) => {
//   if (req.userRole !== 'manager' && req.userRole !== 'admin') {
//     return res.status(403).send({
//       success: false,
//       message: 'Require Manager Role!'
//     });
//   }
//   next();
// };

// // Check if user is agent
// const isAgent = (req, res, next) => {
//   if (req.userRole !== 'agent' && req.userRole !== 'manager' && req.userRole !== 'admin') {
//     return res.status(403).send({
//       success: false,
//       message: 'Require Agent Role!'
//     });
//   }
//   next();
// };

// // Check if user is agent or admin
// const isAgentOrAdmin = (req, res, next) => {
//   if (req.userRole !== 'agent' && req.userRole !== 'admin') {
//     return res.status(403).send({
//       success: false,
//       message: 'Require Agent or Admin Role!'
//     });
//   }
//   next();
// };

// // Check if user is manager or admin
// const isManagerOrAdmin = (req, res, next) => {
//   if (req.userRole !== 'manager' && req.userRole !== 'admin') {
//     return res.status(403).send({
//       success: false,
//       message: 'Require Manager or Admin Role!'
//     });
//   }
//   next();
// };

// module.exports = {
//   verifyToken,
//   isAdmin,
//   isManager,
//   isAgent,
//   isAgentOrAdmin,
//   isManagerOrAdmin
// };


const jwt = require('jsonwebtoken');
const config = require('../config/auth.config');
const User = require('../models/User');

// ---------- helpers ----------
const roleIn = (role, list = []) => list.includes(String(role || '').toLowerCase());
const hasId = (v) => v !== null && v !== undefined && String(v).trim() !== '' && v !== 0;

// Simple in-memory cache to reduce database hits
const userCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const getUserFromCache = (userId) => {
  const cached = userCache.get(userId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.user;
  }
  return null;
};

const setUserInCache = (userId, user) => {
  userCache.set(userId, {
    user,
    timestamp: Date.now()
  });
};

// Verify JWT Token
const verifyToken = (req, res, next) => {
  let token = req.headers['x-access-token'] || req.headers['authorization'];

  if (!token) {
    return res.status(403).send({
      success: false,
      message: 'No token provided!',
      code: 'NO_TOKEN'
    });
  }

  // Remove 'Bearer ' if present
  if (typeof token === 'string' && token.startsWith('Bearer ')) {
    token = token.slice(7);
  }

  jwt.verify(token, config.secret, async (err, decoded) => {
    if (err) {
      console.error('JWT verification failed:', err.message);
      return res.status(401).send({
        success: false,
        message: 'Unauthorized! Invalid token.',
        code: 'INVALID_TOKEN'
      });
    }

    try {
      // Check cache first
      let user = getUserFromCache(decoded.id);
      
      if (!user) {
        // Fetch user from database (without Mongoose-specific select method)
        user = await User.findById(decoded.id);
        
        if (user) {
          setUserInCache(decoded.id, user);
        }
      }

      if (!user) {
        console.error('User not found in database:', decoded.id);
        return res.status(401).send({
          success: false,
          message: 'User not found!',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!user.is_active) {
        console.error('User is inactive:', decoded.id);
        return res.status(401).send({
          success: false,
          message: 'User account is inactive!',
          code: 'USER_INACTIVE'
        });
      }

      // Attach comprehensive user info to request
      req.user = user;
      req.userId = user.id;
      req.userRole = String(user.role || '').toLowerCase().trim();
      req.userEmail = user.email;
      req.username = user.username;
      req.buyerId = user.buyer_id; // Critical for frontend navigation
      req.sellerId = user.seller_id; // Critical for frontend navigation
      req.firstName = user.first_name;
      req.lastName = user.last_name;
      req.salutation = user.salutation;

      console.log('User authenticated successfully:', {
        id: user.id,
        role: req.userRole,
        buyer_id: user.buyer_id,
        seller_id: user.seller_id,
        email: user.email
      });

      next();
    } catch (error) {
      console.error('Database error in verifyToken:', error);
      return res.status(500).send({
        success: false,
        message: 'Database error during authentication!',
        code: 'DATABASE_ERROR'
      });
    }
  });
};

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (!roleIn(req.userRole, ['admin'])) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Admin Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is manager (includes executive + admin as higher/equivalent)
const isManager = (req, res, next) => {
  if (!roleIn(req.userRole, ['manager', 'executive', 'admin'])) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Manager Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is agent (agent OR executive OR manager OR admin)
const isAgent = (req, res, next) => {
  if (!roleIn(req.userRole, ['agent', 'executive', 'manager', 'admin'])) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Agent Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is executive
const isExecutive = (req, res, next) => {
  if (!roleIn(req.userRole, ['executive', 'admin'])) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Executive Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is team leader
const isTeamLeader = (req, res, next) => {
  if (!roleIn(req.userRole, ['team leader', 'manager', 'executive', 'admin'])) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Team Leader Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is agent or admin
const isAgentOrAdmin = (req, res, next) => {
  if (!roleIn(req.userRole, ['agent', 'admin'])) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Agent or Admin Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is manager or admin (includes executive)
const isManagerOrAdmin = (req, res, next) => {
  if (!roleIn(req.userRole, ['manager', 'executive', 'admin'])) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Manager or Admin Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is executive or admin
const isExecutiveOrAdmin = (req, res, next) => {
  if (!roleIn(req.userRole, ['executive', 'admin'])) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Executive or Admin Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is staff member (any internal role)
const isStaff = (req, res, next) => {
  if (!roleIn(req.userRole, ['agent', 'team leader', 'executive', 'manager', 'admin'])) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Staff Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is buyer
const isBuyer = (req, res, next) => {
  const isBuyerRole = roleIn(req.userRole, ['buyer']);
  const hasBuyerAccount = req.user && hasId(req.user.buyer_id);
  
  if (!isBuyerRole && !hasBuyerAccount) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Buyer Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is seller
const isSeller = (req, res, next) => {
  const isSellerRole = roleIn(req.userRole, ['seller']);
  const hasSellerAccount = req.user && hasId(req.user.seller_id);
  
  if (!isSellerRole && !hasSellerAccount) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Seller Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is buyer or admin
const isBuyerOrAdmin = (req, res, next) => {
  const isBuyerRole = roleIn(req.userRole, ['buyer']);
  const isAdminRole = roleIn(req.userRole, ['admin']);
  const hasBuyerAccount = req.user && hasId(req.user.buyer_id);
  
  if (!isAdminRole && !isBuyerRole && !hasBuyerAccount) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Buyer or Admin Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Check if user is seller or admin
const isSellerOrAdmin = (req, res, next) => {
  const isSellerRole = roleIn(req.userRole, ['seller']);
  const isAdminRole = roleIn(req.userRole, ['admin']);
  const hasSellerAccount = req.user && hasId(req.user.seller_id);
  
  if (!isAdminRole && !isSellerRole && !hasSellerAccount) {
    return res.status(403).send({ 
      success: false, 
      message: 'Require Seller or Admin Role!',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Utility function to clear cache when user data changes
const clearUserFromCache = (userId) => {
  userCache.delete(userId);
};

// Utility function to clear entire cache (useful for maintenance)
const clearAllCache = () => {
  userCache.clear();
};

module.exports = {
  verifyToken,
  isAdmin,
  isManager,
  isAgent,
  isExecutive,
  isTeamLeader,
  isAgentOrAdmin,
  isManagerOrAdmin,
  isExecutiveOrAdmin,
  isStaff,
  isBuyer,
  isSeller,
  isBuyerOrAdmin,
  isSellerOrAdmin,
  clearUserFromCache,
  clearAllCache,
};