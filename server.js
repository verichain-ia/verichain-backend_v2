require('dotenv').config();
const express = require('express');
const cors = require('cors');
const securityConfig = require('./src/config/security');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { apiLimiter } = require('./src/middleware/rateLimiter');
const ResponseFormatter = require('./src/middleware/responseFormatter');
const Sanitizer = require('./src/middleware/sanitizer');
const logger = require('./src/utils/logger');
const metricsMiddleware = require('./src/middleware/metrics');
const correlationIdMiddleware = require('./src/middleware/correlationId');

const app = express();

// Middleware básicos - ORDEN IMPORTANTE
app.use(securityConfig.helmet);
app.use(cors(securityConfig.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(ResponseFormatter.addRequestId());
app.use(correlationIdMiddleware);

// Metrics middleware - DEBE IR ANTES DE LAS RUTAS
app.use(metricsMiddleware);

// Logging de requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Swagger Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VeriChain API',
      version: '2.0.0',
      description: 'Blockchain Certificate Verification System API',
      contact: {
        name: 'VeriChain Team',
        email: 'support@verichain.app'
      }
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Development server'
      },
      {
        url: 'https://api.verichain.app',
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
      { name: 'Metrics', description: 'Analytics and metrics' },
      { name: 'Queues', description: 'Queue management' },
      { name: '2FA', description: 'Two-factor authentication' },
      { name: 'Cache', description: 'Cache management' },
      { name: 'Monitoring', description: 'Health checks and metrics' }
    ]
  },
  apis: ['./src/api/v1/routes/*.js', './src/api/v1/routes/*.routes.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "VeriChain API Docs"
}));

// Monitoring routes - SIN AUTENTICACIÓN
const monitoringRoutes = require('./src/api/v1/routes/monitoring.routes');
app.use('/api/v1', monitoringRoutes);

// Health check legacy - mantener para compatibilidad
app.get('/health', async (req, res) => {
  const paseoService = require('./src/services/blockchain/PaseoService');
  const { supabase } = require('./src/services/supabaseService');
  
  let dbStatus = 'unknown';
  try {
    const { count } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true });
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'disconnected';
    logger.error('Database health check failed:', error);
  }

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      api: 'running',
      database: dbStatus,
      blockchain: paseoService.getStatus(),
      queues: 'initializing'
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'VeriChain API',
    version: '2.0.0',
    status: 'running',
    documentation: {
      swagger: '/api-docs',
      postman: 'https://documenter.getpostman.com/view/verichain'
    },
    endpoints: {
      health: {
        legacy: '/health',
        live: '/api/v1/health/live',
        ready: '/api/v1/health/ready',
        startup: '/api/v1/health/startup',
        detailed: '/api/v1/health'
      },
      metrics: '/api/v1/metrics',
      auth: '/api/v1/auth',
      certificates: '/api/v1/certificates',
      organizations: '/api/v1/organizations',
      queues: '/api/v1/queues',
      '2fa': '/api/v1/2fa',
      cache: '/api/v1/cache'
    }
  });
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// API v1 Routes - ORDEN IMPORTANTE
app.use('/api/v1/auth', require('./src/api/v1/routes/auth.routes'));
app.use('/api/v1/certificates', require('./src/api/v1/routes/certificates'));
app.use('/api/v1/organizations', require('./src/api/v1/routes/organizations.routes'));
app.use('/api/v1/metrics', require('./src/api/v1/routes/metrics.routes'));
app.use('/api/v1/2fa', require('./src/api/v1/routes/twoFactor.routes'));
app.use('/api/v1/queues', require('./src/api/v1/routes/queues.routes'));
app.use('/api/v1/cache', require('./src/api/v1/routes/cache.routes'));
app.use('/api/v1/diagnostics', require('./src/api/v1/routes/diagnostics.routes'));
app.use('/api/v1/errors', require('./src/api/v1/routes/errors.routes'));

// Error handlers - SIEMPRE AL FINAL
const { errorHandler, notFound } = require('./src/middleware/errorHandler');

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Start server con inicialización correcta
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, '0.0.0.0', async () => {
  logger.info(`Server started on port ${PORT}`);
  
  console.log('\n🚀 VeriChain Backend v2.0 - Full API');
  console.log('=====================================');
  console.log(`✅ Server: http://localhost:${PORT}`);
  console.log(`📚 Swagger: http://localhost:${PORT}/api-docs`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`📈 Metrics: http://localhost:${PORT}/api/v1/metrics`);
  console.log('=====================================');
  console.log('📌 Endpoints disponibles:');
  console.log('   - Auth: /api/v1/auth/*');
  console.log('   - Certificates: /api/v1/certificates/*');
  console.log('   - Organizations: /api/v1/organizations/*');
  console.log('   - Metrics: /api/v1/metrics/*');
  console.log('   - Queues: /api/v1/queues/*');
  console.log('   - 2FA: /api/v1/2fa/*');
  console.log('   - Cache: /api/v1/cache/*');
  console.log('   - Health: /api/v1/health/*');
  console.log('=====================================');
  console.log('🔍 Monitoring endpoints:');
  console.log('   - Liveness: /api/v1/health/live');
  console.log('   - Readiness: /api/v1/health/ready');
  console.log('   - Startup: /api/v1/health/startup');
  console.log('   - Prometheus: /api/v1/metrics');
  console.log('=====================================\n');
  
  // Initialize services DESPUÉS de que el servidor esté corriendo
  try {
    // Initialize blockchain service
    const paseoService = require('./src/services/blockchain/PaseoService');
    logger.info('Blockchain service initialized');
    
    // Initialize metrics service
    const metricsService = require('./src/services/metricsService');
    const metrics = metricsService.getInstance();
    logger.info('Metrics service initialized');
    
    // Initialize queue workers con delay para asegurar Redis está listo
    setTimeout(() => {
      try {
        const blockchainWorker = require('./src/workers/blockchainWorker');
        blockchainWorker.start()
          .then(() => logger.info('Blockchain worker started'))
          .catch(err => logger.error('Failed to start blockchain worker:', err));
      } catch (error) {
        logger.error('Worker initialization error:', error);
        // No crashear el servidor si los workers fallan
      }
    }, 2000); // 2 segundos de delay
    
  } catch (error) {
    logger.error('Service initialization error:', error);
    // El servidor continúa aunque algunos servicios fallen
  }
});

// Graceful shutdown mejorado
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  
  // Cerrar Queue Manager
  try {
    const QueueManager = require('./src/queues/queueConfig');
    const queueManager = QueueManager.getInstance();
    await queueManager.closeAll();
    logger.info('Queue connections closed');
  } catch (error) {
    logger.error('Error closing queues:', error);
  }
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  
  // Cerrar Queue Manager
  try {
    const QueueManager = require('./src/queues/queueConfig');
    const queueManager = QueueManager.getInstance();
    await queueManager.closeAll();
    logger.info('Queue connections closed');
  } catch (error) {
    logger.error('Error closing queues:', error);
  }
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;