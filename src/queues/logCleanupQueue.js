const { Queue, Worker } = require('bullmq');
const connection = require('../config/bullmq');
const { pool } = require('../config/db');
const { logger } = require('../config/logger');

const cleanupQueue = new Queue('logCleanup', { connection });

// Define the Worker that executes the cleanup query
const worker = new Worker('logCleanup', async (job) => {
  try {
    // 1. Silent Log Cleanup
    await pool.query(`DELETE FROM logs.server_errors WHERE created_at < NOW() - INTERVAL '30 days'`);
    await pool.query(`DELETE FROM logs.app_logs WHERE created_at < NOW() - INTERVAL '30 days'`);
    
  } catch (error) {
    logger.error('Background task failed', { error: error.message, stack: error.stack });
  }
}, { connection });

worker.on('error', (err) => {
  console.warn('⚠️ BullMQ Worker thread exception:', err.message);
});

// Schedule the repeatable job
const scheduleCleanup = async () => {
  await cleanupQueue.add('dailyCleanupJob', {}, {
    repeat: {
      pattern: '0 0 * * *' // Runs every night at midnight
    }
  });
};

module.exports = {
  scheduleCleanup,
  worker,
  cleanupQueue
};
