const ApiResponse = require('../utils/apiResponse');
const { logger } = require('../config/logger');

/**
 * Honeypot Bot Protection Middleware
 * 
 * Checks for a hidden 'website' field in the request body.
 * Real users will not see or fill this field (controlled via CSS).
 * Bots typically fill all fields, triggering this trap.
 */
const honeypot = (req, res, next) => {
  const { website } = req.body;

  if (website && website.trim() !== '') {
    // Audit the bot attempt
    logger.warn('Honeypot trap triggered: potential bot registration attempt blocked.', {
      ip: req.ip,
      body: req.body,
      userAgent: req.headers['user-agent']
    });

    // Strategy: Return 200 OK with success message to fool the bot into thinking it succeeded, 
    // but do not actually process the request. Or return 403. 
    // We'll return 200 to keep them from retrying immediately.
    return ApiResponse.success(res, { 
      message: 'Initial registration processing started. Please check your email.',
      _bt: true 
    });
  }

  next();
};

module.exports = { honeypot };
