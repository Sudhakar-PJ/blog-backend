const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Nexus Platform API',
      version: '1.0.0',
      description: 'The complete technical documentation and interactive tester for the Nexus Enterprise platform. This API handles AI-categorized content, real-time social interactions, and granular administrative management.',
      contact: {
        name: 'Nexus Tech Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token to access protected routes.',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // Path to the API docs (where JSDoc is written)
  apis: ['./src/routes/*.js', './src/models/*.js'], 
};

const specs = swaggerJsdoc(options);
module.exports = specs;
