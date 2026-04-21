require('dotenv').config();
const { validateEnv } = require('./config/envValidator');

// Validate critical secrets before initializing components
validateEnv();

const http = require('http');
const cluster = require('cluster');
const os = require('os');
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
const numCPUs = os.cpus().length;

const startPrimary = async () => {
  try {
    logger.info(`🔥 Primary process ${process.pid} is starting`);
    
    await connectDB();
    await initSchema(); 
    await scheduleCleanup(); 
    await scheduleMediaCleanup();

    logger.info(`🍴 Forking ${numCPUs} workers...`);
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      logger.warn(`💀 Worker ${worker.process.pid} died. Signal: ${signal}, Code: ${code}. Forking replacement...`);
      cluster.fork();
    });

  } catch (error) {
    logger.log('critical', '❌ PRIMARY STARTUP ERROR', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

const startWorker = async () => {
  try {
    await connectDB(); // Each worker needs its own pool connection
    
    const httpServer = http.createServer(app);
    initWebSocket(httpServer);
    
    httpServer.listen(PORT, () => {
      logger.info(`⭐ Worker ${process.pid} online on port ${PORT}`);
    });

    const gracefulShutdown = async (signal) => {
      logger.info(`🛑 Worker ${process.pid}: ${signal} received. Shutting down...`);

      httpServer.close(() => {
        logger.info(`   ✓ Worker ${process.pid}: HTTP server closed`);
      });

      try {
        await redisClient.quit();
        logger.info(`   ✓ Worker ${process.pid}: Redis disconnected`);
      } catch (err) { /* ignore */ }

      try {
        await pool.end();
        logger.info(`   ✓ Worker ${process.pid}: PostgreSQL pool drained`);
      } catch (err) { /* ignore */ }

      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  } catch (error) {
    logger.log('critical', `❌ WORKER ${process.pid} STARTUP ERROR`, { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

if (cluster.isPrimary) {
  startPrimary();
} else {
  startWorker();
}
