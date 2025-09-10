require('dotenv').config();

module.exports = {
  secret: process.env.JWT_SECRET || 'defausdadslt-secret-key',
  jwtExpiration: process.env.JWT_EXPIRATION || 86400
};
