const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redis');

// In test environment, effectively disable rate limiting to allow dense programmatic testing
const skipTestEnv = (req, res) => process.env.NODE_ENV === 'test';

// General API rate limiter (300 requests per 15 minutes) using Redis Store
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 300, 
  skip: skipTestEnv,
  store: process.env.NODE_ENV === 'test' ? undefined : new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rl:gen:'
  }),
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes'
  },
  standardHeaders: true, 
  legacyHeaders: false, 
});

// Stricter limiter for Auth routes to prevent brute force (10 attempts per 15 mins)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: skipTestEnv,
  store: process.env.NODE_ENV === 'test' ? undefined : new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rl:auth:'
  }),
  message: {
    error: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
// Upload signature limiter (10 signatures per 15 minutes)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: skipTestEnv,
  store: process.env.NODE_ENV === 'test' ? undefined : new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rl:upload:'
  }),
  message: {
    error: 'Too many upload requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  authLimiter,
  uploadLimiter
};
