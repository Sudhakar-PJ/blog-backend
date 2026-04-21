const Joi = require('joi');
const { logger } = require('./logger');

const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(5000),

  // Database
  DB_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required()
    .messages({
      'string.empty': 'DB_URL is inherently required.',
      'any.required': 'DB_URL is inherently required.',
      'string.uriCustomScheme': 'DB_URL must be a valid PostgreSQL connection string (postgresql://...)'
    }),

  // Redis
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).optional(),

  // JWT configuration
  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),

}).options({ allowUnknown: true });

const validateEnv = () => {
  const { error, value } = envSchema.validate(process.env);
  
  if (error) {
    const errorMessages = error.details.map(detail => detail.message).join('\n  - ');
    if (logger) {
       logger.log('critical', `❌ Environment Variable Validation Failed:\n  - ${errorMessages}`);
    } else {
       console.error(`\x1b[31m❌ Environment Variable Validation Failed:\n  - ${errorMessages}\x1b[0m`);
    }
    process.exit(1);
  }

  // Assign validated configurations back to process.env (like defaults if any were missing)
  process.env.NODE_ENV = value.NODE_ENV;
  process.env.PORT = value.PORT;
};

module.exports = { validateEnv };
