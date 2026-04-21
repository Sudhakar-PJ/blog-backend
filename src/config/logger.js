const winston = require('winston');
const Transport = require('winston-transport');
const morgan = require('morgan');
const { pool } = require('./db');
const redisClient = require('./redis');
const { asyncLocalStorage } = require('../middlewares/requestContext');

// Formatter 1: Redact PII (Personally Identifiable Information)
const redactFormat = winston.format((info) => {
  const sensitiveKeys = [
    'password', 'token', 'accessToken', 'refreshToken', 'googleId',
    'phoneNumber', 'cvv', 'ssn', 'card', 'pin', 'secret', 'credit_card', 'cc'
  ];

  const redact = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => redact(item));
    }

    const newObj = {};
    for (const key in obj) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        newObj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        newObj[key] = redact(obj[key]);
      } else {
        newObj[key] = obj[key];
      }
    }
    return newObj;
  };

  if (info.meta) {
    info.meta = redact(info.meta);
  }
  if (info.payload) {
    info.payload = redact(info.payload);
  }
  
  return info;
});

// Formatter 2: Attach Request Tracing UUID
const attachRequestId = winston.format((info) => {
  const store = asyncLocalStorage?.getStore();
  if (store && store.has('requestId')) {
    info.requestId = store.get('requestId');
  }
  return info;
});

// Transport: PostgreSQL (For errors, warnings, and critical logs)
class PostgresTransport extends Transport {
  constructor(opts) {
    super(opts);
  }

  async log(info, callback) {
    setImmediate(() => this.emit('logged', info));
    const { level, message, stack, ...meta } = info;
    
    if (['critical', 'error', 'warn'].includes(level)) {
      try {
        if (level === 'error') {
          await pool.query(
            `INSERT INTO logs.server_errors (message, stack_trace, meta) VALUES ($1, $2, $3)`,
            [message, stack || null, meta]
          );
        } else {
          // critical and warn
          await pool.query(
            `INSERT INTO logs.app_logs (level, message, meta) VALUES ($1, $2, $3)`,
            [level, message, meta]
          );
        }
      } catch (err) {
        // Transport failure - silent
      }
    }
    
    if (callback) callback();
  }
}

// Transport: Redis (Hot-tier generic INFO logs with auto expiration)
class RedisTransport extends Transport {
  constructor(opts) {
    super(opts);
  }

  async log(info, callback) {
    setImmediate(() => this.emit('logged', info));
    
    if (info.level === 'info') {
      try {
        const logDate = new Date().toISOString().split('T')[0];
        const keyName = `logs:info:${logDate}`; // e.g. logs:info:2026-04-06
        
        await redisClient.rpush(keyName, JSON.stringify(info));
        // Ensure 1 day expiration on the collection array
        await redisClient.expire(keyName, 24 * 60 * 60); 
      } catch (err) {
        // Transport failure - silent
      }
    }
    
    if (callback) callback();
  }
}

const customLevels = {
  levels: {
    critical: 0,
    error: 1,
    warn: 2,
    info: 3,
    http: 4,
    debug: 5
  },
  colors: {
    critical: 'magenta',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'cyan',
    debug: 'blue'
  }
};

winston.addColors(customLevels.colors);

const logger = winston.createLogger({
  levels: customLevels.levels,
  level: process.env.LOG_LEVEL || 'info', 
  format: winston.format.combine(
    attachRequestId(), // Bind the request context memory
    redactFormat(), // Clean arbitrary meta payloads
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          (info) => {
            const { timestamp, requestId, level, message, stack, ...meta } = info;
            const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
            return `[${timestamp}] [${requestId || 'system'}] ${level}: ${message}${metaStr}${stack ? '\n' + stack : ''}`;
          }
        )
      )
    }),
    new PostgresTransport()
    // RedisTransport disabled to preserve free-tier request limits
  ]
});

// Configure Morgan to extract contextual timing and ID, stringify, and tunnel directly to Winston
morgan.token('reqId', (req) => req.id);
const httpLogger = morgan(
  (tokens, req, res) => {
    return JSON.stringify({
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: tokens.status(req, res),
      contentLength: tokens.res(req, res, 'content-length'),
      responseTime: tokens['response-time'](req, res),
      requestId: tokens.reqId(req, res) // Direct assignment
    });
  },
  { 
    stream: {
      write: (message) => {
        try {
          const parsed = JSON.parse(message);
          logger.info(`HTTP ${parsed.method} ${parsed.url}`, { source: 'morgan_http', ...parsed });
        } catch (e) {
          logger.info(message.trim(), { source: 'morgan_http' });
        }
      }
    }
  }
);

module.exports = {
  httpLogger,
  logger
};
