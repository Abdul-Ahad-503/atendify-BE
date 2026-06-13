const jwt = require('jsonwebtoken');

/**
 * Generate JWT token for user
 * 
 * @param {String} userId - User's MongoDB ObjectId
 * @param {String} role - User's role (student/teacher/admin)
 * @returns {String} JWT token
 */
const generateToken = (userId, role) => {
  return jwt.sign(
    { 
      id: userId,
      role: role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '7d'
    }
  );
};

/**
 * Verify JWT token
 * 
 * @param {String} token - JWT token
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Extract token from request header
 * 
 * @param {Object} req - Express request object
 * @returns {String|null} Token or null
 */
const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

module.exports = {
  generateToken,
  verifyToken,
  extractToken
};
