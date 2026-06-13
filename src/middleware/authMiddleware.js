const User = require('../models/User');
const { verifyToken, extractToken } = require('../utils/jwtUtils');
const { sendError } = require('../utils/responseUtils');

/**
 * Protect routes - Verify JWT token
 */
const protect = async (req, res, next) => {
  try {
    // Extract token from header
    const token = extractToken(req);
    
    if (!token) {
      return sendError(res, 401, 'Not authorized, no token provided');
    }
    
    // Verify token
    const decoded = verifyToken(token);
    
    // Get user from database (exclude password)
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return sendError(res, 401, 'User not found');
    }
    
    if (!user.isActive) {
      return sendError(res, 403, 'Account is disabled');
    }
    
    // Attach user to request object
    req.user = user;
    next();
    
  } catch (error) {
    return sendError(res, 401, 'Not authorized, token failed', [error.message]);
  }
};

/**
 * Authorize specific roles
 * Usage: authorize('admin', 'teacher')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'Not authorized');
    }
    
    if (!roles.includes(req.user.role)) {
      return sendError(
        res, 
        403, 
        `User role '${req.user.role}' is not authorized to access this route`
      );
    }
    
    next();
  };
};

/**
 * Check if user is student
 */
const isStudent = (req, res, next) => {
  if (req.user && req.user.role === 'student') {
    return next();
  }
  return sendError(res, 403, 'Access denied. Students only.');
};

/**
 * Check if user is teacher
 */
const isTeacher = (req, res, next) => {
  if (req.user && req.user.role === 'teacher') {
    return next();
  }
  return sendError(res, 403, 'Access denied. Teachers only.');
};

/**
 * Check if user is admin
 */
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return sendError(res, 403, 'Access denied. Admins only.');
};

module.exports = {
  protect,
  authorize,
  isStudent,
  isTeacher,
  isAdmin
};
