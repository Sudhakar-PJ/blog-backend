const { logger } = require('../config/logger');
const ApiResponse = require('../utils/apiResponse');
const crypto = require('crypto');

/**
 * CSRF Protection Middleware - Double Submit Cookie Pattern
 * 
 * 1. Sets a 'csrf-token' cookie (NOT httpOnly so frontend can read it).
 * 2. Validates 'x-csrf-token' header against the cookie for state-changing requests.
 */
const csrfProtection = (req, res, next) => {
  // Bypass CSRF protection in test environment
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // 1. If cookie doesn't exist, generate and set it
  let csrfToken = req.cookies['csrf-token'];
  
  if (!csrfToken) {
    csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('csrf-token', csrfToken, {
        httpOnly: false, // Must be readable by frontend JS
        secure: true,
        sameSite: 'none',
        partitioned: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 day
      });
  }

  // 2. Protect mutation methods
  const protectedMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (protectedMethods.includes(req.method)) {
    const headerToken = req.headers['x-csrf-token'];
    
    // Safety check: if either is missing or they don't match, block request
    if (!headerToken || !csrfToken || headerToken !== csrfToken) {
      // Security Auditing: Log the failure for admin visibility
      logger.warn(`[SEC_CSRF_FAILURE] ${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        hasHeader: !!headerToken,
        hasCookieInRequest: !!req.cookies['csrf-token'],
        cookieInRequestValue: req.cookies['csrf-token'],
        headerTokenValue: headerToken
      });

      return ApiResponse.error(res, 'CSRF token validation failed', 403);
    }
  }

  next();
};

module.exports = { csrfProtection };
