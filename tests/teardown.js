const { pool } = require('../src/config/db');
const redisClient = require('../src/config/redis');
const bullmqConnection = require('../src/config/bullmq');

module.exports = async () => {
  console.log('\n🧹 Finalizing test resources...');
  
  try {
    // Close shared persistent connections exactly once at the end
    await pool.end();
    await redisClient.quit().catch(() => {});
    await bullmqConnection.quit().catch(() => {});
    
    console.log('✅ Connections closed. Test run complete.');
  } catch (err) {
    console.warn('⚠️ Teardown warning:', err.message);
  }
};
