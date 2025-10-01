require('dotenv').config();
const express = require('express');
const cors = require('cors');
const securityConfig = require('./src/config/security');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { apiLimiter } = require('./src/middleware/rateLimiter');
const ResponseFormatter = require('./src/middleware/responseFormatter');
const Sanitizer = require('./src/middleware/sanitizer');


const app = express();

// Middleware básicos
app.use(securityConfig.helmet);
app.use(cors(securityConfig.cors));
app.use(express.json());
//app.use(Sanitizer.mongoSanitize());
app.use(ResponseFormatter.addRequestId());
app.use(express.urlencoded({ extended: true }));
app.use('/api/', apiLimiter);
app.use('/api/v1/2fa', require('./src/api/v1/routes/twoFactor.routes'));

// Logging de requests
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Swagger Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VeriChain API',
      version: '1.0.0',
      description: 'Blockchain Certificate Verification System API',
      contact: {
        name: 'VeriChain Team',
        email: 'support@verichain.app'
      }
    },
    servers: [
      {
        url: 'http://localhost:4000/api/v1',
        description: 'Development server'
      },
      {
        url: 'https://api.verichain.app/api/v1',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Certificates', description: 'Certificate management' },
      { name: 'Organizations', description: 'Organization management' },
      { name: 'Metrics', description: 'Analytics and metrics' }
    ]
  },
  apis: ['./src/api/v1/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "VeriChain API Docs"
}));

// Health check
app.get('/health', async (req, res) => {
  const paseoService = require('./src/services/blockchain/PaseoService');
  const { supabase } = require('./src/services/supabaseService');
  
  let dbStatus = 'unknown';
  try {
    const { count } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true });
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      api: 'running',
      database: dbStatus,
      blockchain: paseoService.getStatus()
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'VeriChain API',
    version: 'v2',
    status: 'running',
    documentation: {
      swagger: '/api-docs',
      postman: 'https://documenter.getpostman.com/view/verichain'
    },
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      certificates: '/api/v1/certificates',
      organizations: '/api/v1/organizations',
      metrics: '/api/v1/metrics'
    }
  });
});

// API v1 Routes
app.use('/api/v1/auth', require('./src/api/v1/routes/auth.routes'));
app.use('/api/v1/certificates', require('./src/api/v1/routes/certificates'));
app.use('/api/v1/organizations', require('./src/api/v1/routes/organizations.routes'));
app.use('/api/v1/metrics', require('./src/api/v1/routes/metrics.routes'));
app.use('/api/v1/diagnostics', require('./src/api/v1/routes/diagnostics.routes'));

// IMPORTANTE: Error handlers van DESPUÉS de todas las rutas
// Importar los handlers (asegúrate de crear estos archivos primero)
const { errorHandler, notFound } = require('./src/middleware/errorHandler');
const logger = require('./src/utils/logger');

// 404 handler - para rutas no encontradas
app.use(notFound);

// Error handler - maneja todos los errores
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server started on port ${PORT}`);
  
  console.log('\n🚀 VeriChain Backend v2 - Full API');
  console.log('=====================================');
  console.log(`✅ Server: http://localhost:${PORT}`);
  console.log(`📚 Swagger: http://localhost:${PORT}/api-docs`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log('=====================================');
  console.log('📌 Endpoints disponibles:');
  console.log('   - Auth: /api/v1/auth/*');
  console.log('   - Certificates: /api/v1/certificates/*');
  console.log('   - Organizations: /api/v1/organizations/*');
  console.log('   - Metrics: /api/v1/metrics/*');
  console.log('=====================================\n');
  
  // Initialize blockchain service
  require('./src/services/blockchain/PaseoService');
});

module.exports = app;