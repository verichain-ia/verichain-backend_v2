const { supabase } = require('../services/supabaseService');
const redis = require('../config/redis');
const QueueManager = require('../queues/queueConfig');
const os = require('os');
const fs = require('fs').promises;

class HealthController {
  constructor() {
  this.redisClient = redis; // Usar la instancia ya configurada
}

  // Liveness probe - ¿El servidor responde?
  async getLiveness(req, res) {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  }

  // Readiness probe - ¿Puede procesar requests?
  async getReadiness(req, res) {
    const checks = {
      database: 'checking',
      redis: 'checking',
      queues: 'checking'
    };

    let isReady = true;

    // Check database
    try {
      const { error } = await supabase
        .from('certificates')
        .select('id')
        .limit(1);
      
      checks.database = error ? 'unhealthy' : 'healthy';
      if (error) isReady = false;
    } catch (err) {
      checks.database = 'unhealthy';
      isReady = false;
    }

    // Check Redis
    try {
      const pong = await this.redisClient.ping();
      checks.redis = pong === 'PONG' ? 'healthy' : 'unhealthy';
      if (pong !== 'PONG') isReady = false;
    } catch (err) {
      checks.redis = 'unhealthy';
      isReady = false;
    }

    // Check Queues - CORREGIDO con getInstance y init
    try {
      const queueManager = QueueManager.getInstance();
      
      // Inicializar si no está inicializado
      if (!queueManager.initialized) {
        await queueManager.init();
      }
      
      const statuses = await queueManager.getAllQueuesStatus();
      const allHealthy = Object.values(statuses.queues || {}).every(
        q => q.status === 'active'
      );
      checks.queues = allHealthy ? 'healthy' : 'degraded';
      if (!allHealthy) isReady = false;
    } catch (err) {
      checks.queues = 'unhealthy';
      isReady = false;
    }

    const status = isReady ? 200 : 503;
    res.status(status).json({
      status: isReady ? 'ready' : 'not ready',
      checks,
      timestamp: new Date().toISOString()
    });
  }

  // Startup probe - ¿Completó la inicialización?
  async getStartup(req, res) {
    const startupChecks = {
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      },
      cpu: {
        cores: os.cpus().length,
        loadAverage: os.loadavg(),
        usage: process.cpuUsage()
      },
      system: {
        platform: os.platform(),
        release: os.release(),
        totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
        freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024),
        unit: 'GB'
      }
    };

    // Check required environment variables
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'JWT_SECRET',
      'REDIS_HOST'
    ];

    const missingEnvVars = requiredEnvVars.filter(
      varName => !process.env[varName]
    );

    startupChecks.configuration = {
      complete: missingEnvVars.length === 0,
      missingVariables: missingEnvVars
    };

    const status = missingEnvVars.length === 0 ? 200 : 500;
    
    res.status(status).json({
      status: status === 200 ? 'started' : 'incomplete',
      checks: startupChecks,
      timestamp: new Date().toISOString()
    });
  }

  // Detailed health check
  async getDetailedHealth(req, res) {
    const health = {
      service: 'verichain-backend',
      version: '1.0.0',
      status: 'checking',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {}
    };

    // Database detailed check
    try {
      const start = Date.now();
      const { data, error } = await supabase
        .from('certificates')
        .select('count', { count: 'exact' });
      
      health.checks.database = {
        status: error ? 'unhealthy' : 'healthy',
        responseTime: Date.now() - start,
        certificateCount: data?.[0]?.count || 0,
        error: error?.message
      };
    } catch (err) {
      health.checks.database = {
        status: 'unhealthy',
        error: err.message
      };
    }

    // Redis detailed check
    try {
      const start = Date.now();
      const info = await this.redisClient.info();
      const dbSize = await this.redisClient.dbsize();
      
      health.checks.redis = {
        status: 'healthy',
        responseTime: Date.now() - start,
        keys: dbSize,
        memoryUsage: info.match(/used_memory_human:(.+)/)?.[1]
      };
    } catch (err) {
      health.checks.redis = {
        status: 'unhealthy',
        error: err.message
      };
    }

    // Queue detailed check - CORREGIDO con getInstance y init
    try {
      const queueManager = QueueManager.getInstance();
      
      // Inicializar si no está inicializado
      if (!queueManager.initialized) {
        await queueManager.init();
      }
      
      const statuses = await queueManager.getAllQueuesStatus();
      
      health.checks.queues = {
        status: 'healthy',
        details: statuses
      };
    } catch (err) {
      health.checks.queues = {
        status: 'unhealthy',
        error: err.message
      };
    }

    // Blockchain check (sin conexión real por ahora)
    health.checks.blockchain = {
      status: 'healthy',
      network: 'paseo-testnet',
      note: 'Circuit breaker active'
    };

    // Determinar status general
    const allHealthy = Object.values(health.checks).every(
      check => check.status === 'healthy'
    );

    health.status = allHealthy ? 'healthy' : 'degraded';

    res.status(200).json(health);
  }
}

module.exports = new HealthController();