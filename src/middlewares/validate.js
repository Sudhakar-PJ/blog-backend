const Joi = require('joi');
const { logger } = require('../config/logger');
const ApiResponse = require('../utils/apiResponse');

/**
 * Higher-order middleware to handle Joi validation for body, params, and query.
 * @param {Object} schema - Object containing Joi schemas for body, params, and/or query.
 */
const validate = (schema) => (req, res, next) => {
  const validSchema = {};
  const dataToValidate = {};

  // Extract relevant parts from the schema
  ['body', 'params', 'query'].forEach((key) => {
    if (schema[key]) {
      validSchema[key] = schema[key];
      dataToValidate[key] = req[key];
    }
  });

  const { value, error } = Joi.object(validSchema)
    .prefs({ errors: { label: 'key' }, abortEarly: false, stripUnknown: true })
    .validate(dataToValidate);

  if (error) {
    const errorMessage = error.details.map((details) => details.message).join(', ');
    
    // Security Logging: Validation failures are logged as warnings
    logger.warn(`[VALIDATION_FAILURE] ${req.method} ${req.originalUrl}: ${errorMessage}`, {
      user: req.user?.id || 'anonymous',
      ip: req.ip,
      payload: dataToValidate.body, // Log the body for forensics
      errors: error.details
    });

    return ApiResponse.error(res, errorMessage, 400);
  }

  // Assign validated and stripped values back to the request
  Object.assign(req, value);
  return next();
};

module.exports = validate;
