const { validationResult } = require('express-validator');
const { sendError } = require('../utils/responseUtils');

/**
 * Validate request based on express-validator rules
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const extractedErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg
    }));
    
    return sendError(res, 400, 'Validation failed', extractedErrors);
  }
  
  next();
};

module.exports = validate;
