const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');

let io;

const initWebSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : ['http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true
    },
    transports: ['polling', 'websocket']
  });

  // Redis Adapter for Clustering
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const pubClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    family: 0
  });
  const subClient = pubClient.duplicate();
  
  io.adapter(createAdapter(pubClient, subClient));

  const { logger } = require('./logger');

  io.use((socket, next) => {
    // 1. Try auth object (Legacy/Mobile)
    let token = socket.handshake.auth.token;

    // 2. Try Cookies (Secure Browsers)
    if (!token && socket.handshake.headers.cookie) {
      try {
        const cookie = require('cookie');
        const cookies = cookie.parse(socket.handshake.headers.cookie);
        token = cookies.accessToken;
      } catch (err) {
        logger.error(`[SOCKET] Cookie parsing failed for session ${socket.id}: ${err.message}`);
      }
    }

    if (!token) {
      logger.warn(`[SOCKET] Authentication failed: No token found for session ${socket.id}. Headers: ${JSON.stringify(socket.handshake.headers)}`);
      return next(new Error('Authentication error: Token missing'));
    }
    
    jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
      if (err) {
        logger.warn(`[SOCKET] Authentication failed: Invalid token for session ${socket.id} - ${err.message}`);
        return next(new Error('Authentication error: Invalid token'));
      }
      socket.user = decoded;
      logger.info(`[SOCKET] User ${decoded.id} authenticated for session ${socket.id}`);
      next();
    });
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);
  });

  return io;
};

const getIO = () => {
  if (!io) {
    // Return a dummy object with emit for safety during early initialization if needed
    return { emit: () => {}, to: () => ({ emit: () => {} }) };
  }
  return io;
};

module.exports = { initWebSocket, getIO };
