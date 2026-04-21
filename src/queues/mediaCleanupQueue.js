const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const { pool } = require('../config/db');
const { logger } = require('../config/logger');

// BullMQ strictly requires ioredis
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  family: 0 // force IPv4 to prevent ETIMEDOUT bugs
});

connection.on('error', (err) => {
  console.warn('⚠️ BullMQ Media Redis connection warning:', err.message);
});

const mediaCleanupQueue = new Queue('mediaCleanup', { connection });

const worker = new Worker('mediaCleanup', async (job) => {
  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    const { rows: deletions } = await pool.query(`SELECT id, public_id, resource_type FROM logs.media_deletions LIMIT 500`);
    
    if (deletions.length > 0) {
      const imageIds = deletions.filter(d => d.resource_type === 'image').map(d => d.public_id);
      const videoIds = deletions.filter(d => d.resource_type === 'video').map(d => d.public_id);

      // Execute targeted deletions against the CDN
      if (imageIds.length > 0) {
        await cloudinary.api.delete_resources(imageIds, { resource_type: 'image' });
      }
      if (videoIds.length > 0) {
        await cloudinary.api.delete_resources(videoIds, { resource_type: 'video' });
      }

      // Flush processed items out of our Ledger
      const processedIds = deletions.map(d => d.id);
      await pool.query(`DELETE FROM logs.media_deletions WHERE id = ANY($1::uuid[])`, [processedIds]);

      logger.info(`Housekeeping Ledger: Safely purged ${imageIds.length} images and ${videoIds.length} videos from CDN.`);
    }
  } catch (error) {
    logger.error('Media cleanup task failed', { error: error.message, stack: error.stack });
  }
}, { connection });

worker.on('error', (err) => {
  console.warn('⚠️ BullMQ Media Worker thread exception:', err.message);
});

// Schedule the repeatable job
const scheduleMediaCleanup = async () => {
  await mediaCleanupQueue.add('dailyMediaCleanupJob', {}, {
    repeat: {
      pattern: '0 0 * * *' // Runs every night at midnight
    }
  });
};

module.exports = {
  scheduleMediaCleanup,
  worker
};
