const { sendError } = require('../utils/responseUtils');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    return sendError(res, 400, 'Validation Error', errors);
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return sendError(res, 400, `${field} already exists`);
  }
  
  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return sendError(res, 400, 'Invalid ID format');
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 401, 'Invalid token');
  }
  
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 401, 'Token expired');
  }
  
  // Default error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  return sendError(res, statusCode, message);
};

/**
 * Handle 404 - Route not found
 */
const notFound = (req, res, next) => {
  return sendError(res, 404, `Route ${req.originalUrl} not found`);
};

module.exports = {
  errorHandler,
  notFound
};
