// Suppress known backend network teardown quirks during Jest exit (pgPass, Redis socket timeouts)
process.on('uncaughtException', err => {
  if (err.message && (err.message.includes('pgPass') || err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT'))) return;
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
  if (err && err.message && (err.message.includes('pgPass') || err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT'))) return;
  console.error('Unhandled Rejection:', err);
});

const { pool, initSchema } = require('../src/config/db');
const redisClient = require('../src/config/redis');
const bullmqConnection = require('../src/config/bullmq');

// Initialize schema once before all tests
beforeAll(async () => {
  try {
    await initSchema();
  } catch (err) {
    console.warn('⚠️ Schema initialization skipped or failed:', err.message);
  }
});

// Import all workers and queues to close them
const { worker: logWorker, logCleanupQueue } = require('../src/queues/logCleanupQueue');
const { worker: mediaWorker, mediaCleanupQueue } = require('../src/queues/mediaCleanupQueue');
const { worker: notifyWorker, notificationQueue } = require('../src/queues/notificationQueue');
const { worker: postWorker, postProcessQueue } = require('../src/queues/postProcessQueue');

// Global teardown to prevent open handles
afterAll(async () => {
  // Let pending microtasks and background audit logs fully settle
  // This is crucial on Windows/Node 22 to prevent the pgPass crash
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    // Close workers and queues first to stop new background activity
    await Promise.all([
      logWorker.close().catch(() => {}), logCleanupQueue?.close().catch(() => {}),
      mediaWorker.close().catch(() => {}), mediaCleanupQueue?.close().catch(() => {}),
      notifyWorker.close().catch(() => {}), notificationQueue?.close().catch(() => {}),
      postWorker.close().catch(() => {}), postProcessQueue?.close().catch(() => {})
    ]);

    // Close connections in order
    // NOTE: pool.end(), redisClient.quit() and bullmqConnection.quit() 
    // are now handled in the globalTeardown.js to ensure they only happen
    // once at the very end of all test suites.
  } catch (err) {
    // Silent - we don't want teardown errors burying our coverage results
  }
});

/**
 * Helper to clear database tables (Destructive)
 */
const clearDB = async () => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Attempted to clear DB outside of test environment!');
  }
  const tables = ['notifications', 'follows', 'bookmarks', 'interactions', 'comments', 'posts', 'users'];
  for (const table of tables) {
    await pool.query(`DELETE FROM ${table}`);
  }
  await redisClient.flushall(); // Clear all cached feeds/data
};

module.exports = {
  clearDB,
  pool
};
