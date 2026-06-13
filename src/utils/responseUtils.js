/**
 * Success response wrapper
 * 
 * @param {Object} res - Express response object
 * @param {Number} statusCode - HTTP status code
 * @param {String} message - Success message
 * @param {Object} data - Response data
 */
const sendSuccess = (res, statusCode, message, data = null) => {
  const response = {
    success: true,
    message
  };
  
  if (data) {
    response.data = data;
  }
  
  res.status(statusCode).json(response);
};

/**
 * Error response wrapper
 * 
 * @param {Object} res - Express response object
 * @param {Number} statusCode - HTTP status code
 * @param {String} message - Error message
 * @param {Array} errors - Array of error details
 */
const sendError = (res, statusCode, message, errors = null) => {
  const response = {
    success: false,
    message
  };
  
  if (errors) {
    response.errors = errors;
  }
  
  res.status(statusCode).json(response);
};

/**
 * Paginate results
 * 
 * @param {Number} page - Current page
 * @param {Number} limit - Items per page
 * @returns {Object} { skip, limit }
 */
const paginate = (page = 1, limit = 10) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  const skip = (pageNum - 1) * limitNum;
  
  return {
    skip,
    limit: limitNum,
    page: pageNum
  };
};

module.exports = {
  sendSuccess,
  sendError,
  paginate
};
