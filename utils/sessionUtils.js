// utils/sessionUtils.js - NEW FILE
const crypto = require('crypto');

/**
 * Generate unique session ID
 */
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Get or create session ID from request
 */
function getOrCreateSessionId(req, res) {
  let sessionId = req.cookies?.session_id;
  
  if (!sessionId) {
    sessionId = generateSessionId();
    // Set cookie for 24 hours
    res.cookie('session_id', sessionId, {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
  }
  
  return sessionId;
}

module.exports = {
  generateSessionId,
  getOrCreateSessionId
};