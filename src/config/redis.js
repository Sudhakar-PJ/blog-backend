const Redis = require('ioredis');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const client = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  family: 0 // IPv4
});

client.on('error', () => {});

client.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('🚀 Redis Connected');
  }
});

module.exports = client;
