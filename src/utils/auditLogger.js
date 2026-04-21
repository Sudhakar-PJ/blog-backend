const { logger } = require('../config/logger');

/**
 * Audit Logger utility for tracking high-priority security and system items.
 */
class AuditLogger {
  /**
   * Log a security-related event (Logins, PWD changes, Admin actions)
   * @param {string} action The action being performed (e.g., 'USER_LOGIN')
   * @param {Object} meta Additional metadata (userId, email, ip, etc.)
   */
  security(action, meta = {}) {
    logger.log('critical', `SEC_AUDIT: ${action}`, {
      source: 'security_audit',
      action,
      ...meta
    });
  }

  /**
   * Log a system-wide structural change
   */
  system(action, meta = {}) {
    logger.warn(`SYS_AUDIT: ${action}`, {
      source: 'system_audit',
      action,
      ...meta
    });
  }
}

module.exports = new AuditLogger();
