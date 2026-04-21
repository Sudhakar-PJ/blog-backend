const jwt = require('jsonwebtoken');
require('dotenv').config();

const authenticate = async (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'Authentication token required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    
    // Check if user was abruptly suspended
    const redis = require('../config/redis');
    const isSuspended = await redis.get(`suspended_user:${decoded.id}`);
    if (isSuspended === 'true') {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Your account has been suspended by an administrator.'
      });
    }

    req.user = decoded; // { id, role }

    // Anti-Stale: If accessing an admin route, re-verify role directly from DB
    // This allows immediate access after promotion without requiring a manual relog.
    if (req.originalUrl.includes('/admin/')) {
        const UserRepository = require('../repositories/UserRepository');
        const user = await UserRepository.findById(decoded.id);
        if (user) {
            req.user.role = user.role;
        }
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'Invalid or expired access token'
    });
  }
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Permission denied'
      });
    }
    next();
  };
};

module.exports = {
  authenticate,
  authorizeRoles
};
