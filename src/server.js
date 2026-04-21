require('dotenv').config();
const { validateEnv } = require('./config/envValidator');

// Validate critical secrets before initializing components
validateEnv();

const http = require('http');
const app = require('./app');
const { connectDB, initSchema, pool } = require('./config/db');
const redisClient = require('./config/redis');
const { logger } = require('./config/logger');
const { initWebSocket } = require('./config/websocket');
const { scheduleCleanup } = require('./queues/logCleanupQueue');
const { scheduleMediaCleanup } = require('./queues/mediaCleanupQueue');
require('./queues/notificationQueue');
require('./queues/postProcessQueue');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    logger.info(`🔥 Server process ${process.pid} is starting`);
    
    await connectDB();
    await initSchema(); 
    await scheduleCleanup(); 
    await scheduleMediaCleanup();

    const httpServer = http.createServer(app);
    initWebSocket(httpServer);
    
    httpServer.listen(PORT, () => {
      logger.info(`⭐ Server online on port ${PORT}`);
    });

    const gracefulShutdown = async (signal) => {
      logger.info(`🛑 Process ${process.pid}: ${signal} received. Shutting down...`);

      httpServer.close(() => {
        logger.info(`   ✓ HTTP server closed`);
      });

      try {
        await redisClient.quit();
        logger.info(`   ✓ Redis disconnected`);
      } catch (err) { /* ignore */ }

      try {
        await pool.end();
        logger.info(`   ✓ PostgreSQL pool drained`);
      } catch (err) { /* ignore */ }

      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  } catch (error) {
    logger.log('critical', '❌ SERVER STARTUP ERROR', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

startServer();
