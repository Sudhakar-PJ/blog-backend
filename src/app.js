const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const passport = require('./config/passport');
const { requestContextMiddleware } = require('./middlewares/requestContext');
const { httpLogger, logger } = require('./config/logger');
const { apiLimiter } = require('./middlewares/rateLimit');
const { csrfProtection } = require('./middlewares/csrfMiddleware');
const ApiError = require('./utils/ApiError');

// Route imports
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const interactionRoutes = require('./routes/interactionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const app = express();

app.set('trust proxy', 1);

// Standard middlewares
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false, // Turn off defaults to be 100% explicit
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      "connect-src": ["'self'", "http://localhost:5000", "ws://localhost:5000", "http://localhost:5173", "ws://localhost:5173", "https://res.cloudinary.com"],
      "img-src": ["'self'", "data:", "https://res.cloudinary.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "object-src": ["'none'"],
      ...(process.env.NODE_ENV === 'production' ? { "upgrade-insecure-requests": [] } : {}),
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  exposedHeaders: ['X-CSRF-Token']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(hpp()); // Prevent HTTP Parameter Pollution
app.use(cookieParser());
app.use(csrfProtection);
app.use(passport.initialize());

// Business logic middlewares
app.use(requestContextMiddleware);
app.use(httpLogger);
app.use('/api', apiLimiter);

// Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API Modules
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/interactions', interactionRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/media', mediaRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok', message: 'API V1 is running' }, error: null });
});

// 404 Fallback
app.use((req, res) => {
  logger.warn(`404 NOT FOUND: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    data: null,
    error: `Route ${req.method} ${req.originalUrl} not found`,
    requestId: req.id
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  const requestId = req.id || 'system';

  // In production or for non-operational errors, hide details
  if (process.env.NODE_ENV === 'production' && !err.isOperational) {
    statusCode = 500;
    message = 'Something went wrong. Please try again later.';
  } else if (statusCode >= 500) {
    // Even in dev, we might want to standardize internal 500 messages if they aren't ApiErrors
    message = 'Internal Server Error';
  }

  // Always log the RAW error internally
  if (statusCode >= 500) {
    logger.log('error', `[INTERNAL_ERROR] ${err.message}`, { 
      stack: err.stack, 
      statusCode, 
      requestId,
      originalMessage: err.message // Keep the raw message in logs
    });
  } else {
    logger.warn(`[OPERATIONAL_ERROR] ${message}`, { statusCode, requestId });
  }
  
  res.status(statusCode).json({
    success: false,
    data: null,
    error: message,
    requestId 
  });
});

module.exports = app;
