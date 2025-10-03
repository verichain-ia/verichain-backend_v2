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

// Swagger Configuration - ACTUALIZADO para v1 y v2 con schemas
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VeriChain API',
      version: '2.0.0',
      description: 'Blockchain Certificate Verification System API - Supports v1 and v2',
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
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              example: 'Error message'
            },
            code: {
              type: 'string',
              example: 'ERROR_CODE'
            },
            statusCode: {
              type: 'number',
              example: 400
            }
          }
        },
        ValidationErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: {
                    type: 'string',
                    example: 'email'
                  },
                  message: {
                    type: 'string',
                    example: 'Email is required'
                  }
                }
              }
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              description: 'Response data'
            },
            message: {
              type: 'string',
              example: 'Operation successful'
            }
          }
        }
      }
    },
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Certificates', description: 'Certificate management' },
      { name: 'Organizations', description: 'Organization management' },
      { name: 'Metrics', description: 'Analytics and metrics' },
      { name: 'Queues', description: 'Queue management' },
      { name: 'Two-Factor Authentication', description: 'Two-factor authentication' },
      { name: 'Cache', description: 'Cache management' },
      { name: 'Monitoring', description: 'Health checks and metrics' },
      { name: 'Versioning', description: 'API version information' },
      { name: 'Webhooks', description: 'Webhook configuration and management' }
    ]
  },
  apis: [
    './src/api/v1/routes/*.js', 
    './src/api/v1/routes/*.routes.js',
    './src/api/v2/routes/*.js',
    './src/api/v2/routes/*.routes.js',
    './src/api/versionRouter.js'
  ]
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "VeriChain API Docs"
}));

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

// Root endpoint - ACTUALIZADO con información de versiones
app.get('/', (req, res) => {
  res.json({
    name: 'VeriChain API',
    version: '2.0.0',
    status: 'running',
    apiVersions: {
      current: 'v1',
      available: ['v1', 'v2'],
      deprecated: []
    },
    documentation: {
      swagger: '/api-docs',
      postman: 'https://documenter.getpostman.com/view/verichain',
      versions: '/api/versions'
    },
    endpoints: {
      v1: {
        base: '/api/v1',
        auth: '/api/v1/auth',
        certificates: '/api/v1/certificates',
        organizations: '/api/v1/organizations',
        metrics: '/api/v1/metrics',
        '2fa': '/api/v1/auth/2fa',
        cache: '/api/v1/cache',
        health: '/api/v1/health'
      },
      v2: {
        base: '/api/v2',
        auth: '/api/v2/auth',
        certificates: '/api/v2/certificates',
        organizations: '/api/v2/organizations',
        analytics: '/api/v2/analytics',
        jobs: '/api/v2/jobs',
        cache: '/api/v2/cache',
        health: '/api/v2/health',
        webhooks: '/api/v2/webhooks'
      }
    }
  });
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// ========================================
// API VERSIONING - NUEVA IMPLEMENTACIÓN
// ========================================
const versionRouter = require('./src/api/versionRouter');
app.use('/api', versionRouter);

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
  
  console.log('\n🚀 VeriChain Backend v2.0 - Multi-Version API');
  console.log('=====================================');
  console.log(`✅ Server: http://localhost:${PORT}`);
  console.log(`📚 Swagger: http://localhost:${PORT}/api-docs`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🔄 Versions: http://localhost:${PORT}/api/versions`);
  console.log('=====================================');
  console.log('📌 API v1 Endpoints (Current):');
  console.log('   - Auth: /api/v1/auth/*');
  console.log('   - 2FA: /api/v1/auth/2fa/*');
  console.log('   - Certificates: /api/v1/certificates/*');
  console.log('   - Organizations: /api/v1/organizations/*');
  console.log('   - Metrics: /api/v1/metrics/*');
  console.log('   - Queues: /api/v1/queues/*');
  console.log('   - Cache: /api/v1/cache/*');
  console.log('   - Health: /api/v1/health/*');
  console.log('=====================================');
  console.log('🆕 API v2 Endpoints (Next):');
  console.log('   - Auth: /api/v2/auth/*');
  console.log('   - 2FA: /api/v2/auth/2fa/*');
  console.log('   - Certificates: /api/v2/certificates/*');
  console.log('   - Organizations: /api/v2/organizations/*');
  console.log('   - Analytics: /api/v2/analytics/*');
  console.log('   - Jobs: /api/v2/jobs/*');
  console.log('   - Cache: /api/v2/cache/*');
  console.log('   - Health: /api/v2/health/*');
  console.log('   - Webhooks: /api/v2/webhooks/*');
  console.log('=====================================');
  console.log('🔍 Monitoring endpoints:');
  console.log('   - Liveness: /api/v{1,2}/health/live');
  console.log('   - Readiness: /api/v{1,2}/health/ready');
  console.log('   - Startup: /api/v{1,2}/health/startup');
  console.log('   - Prometheus: /api/v{1,2}/metrics');
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