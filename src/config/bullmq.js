const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  family: 0 // force IPv4 to prevent connection timeout bugs
});

connection.on('error', (err) => {
  try {
    const { logger } = require('./logger');
    if (logger && process.env.NODE_ENV !== 'test') {
      logger.error('BullMQ Redis Connection Error', { error: err.message });
    }
  } catch (e) {
    // Ignore require error during jest teardown
  }
});

module.exports = connection;
