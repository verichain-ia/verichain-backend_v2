// src/queues/queueConfig.js - VERSIÓN COMERCIAL COMPLETA
const Bull = require('bull');
const logger = require('../utils/logger');

class QueueManager {
  constructor() {
    this.queues = {};
    this.isConnected = false;
    this.initialized = false;
  }

  getRedisConfig() {
    // Si hay REDIS_URL, usarla directamente (Railway)
    if (process.env.REDIS_URL) {
        logger.info('Using REDIS_URL for Bull queues');
      return process.env.REDIS_URL;
    }
    
    // Fallback a configuración separada
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.debug(`Redis retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      }
    };
  }

  async init() {
    if (this.initialized) {
      logger.warn('QueueManager already initialized');
      return;
    }

    logger.info('Initializing Queue Management System...');
    
    const redisConfig = this.getRedisConfig();

    // Definición completa de todas las queues
    const queueDefinitions = {
      blockchainRegistration: {
        name: 'blockchain-registration',
        options: {
          redis: redisConfig,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 500,
            timeout: 60000
          }
        }
      },
      emailNotifications: {
        name: 'email-notifications',
        options: {
          redis: redisConfig,
          defaultJobOptions: {
            attempts: 5,
            backoff: {
              type: 'fixed',
              delay: 3000
            },
            removeOnComplete: 50,
            removeOnFail: 100
          }
        }
      },
      certificateGeneration: {
        name: 'certificate-generation',
        options: {
          redis: redisConfig,
          defaultJobOptions: {
            attempts: 2,
            timeout: 30000,
            removeOnComplete: true,
            removeOnFail: false
          }
        }
      },
      pdfGeneration: {
        name: 'pdf-generation',
        options: {
          redis: redisConfig,
          defaultJobOptions: {
            attempts: 3,
            timeout: 45000,
            removeOnComplete: 20,
            removeOnFail: 50
          }
        }
      },
      analyticsProcessing: {
        name: 'analytics-processing',
        options: {
          redis: redisConfig,
          defaultJobOptions: {
            attempts: 1,
            timeout: 120000,
            removeOnComplete: 10,
            removeOnFail: false
          }
        }
      }
    };

    // Inicializar cada queue con todos los event handlers
    for (const [key, config] of Object.entries(queueDefinitions)) {
      try {
        logger.info(`Initializing queue: ${key}`);
        
        const queue = new Bull(config.name, config.options);
        
        // Configurar todos los event listeners
        this.setupQueueEventListeners(queue, config.name);
        
        // Verificar conexión
        await queue.isReady();
        
        this.queues[key] = queue;
        logger.info(`✅ Queue '${key}' initialized successfully`);
        
      } catch (error) {
        logger.error(`❌ Failed to initialize queue ${key}:`, error);
        // Continuar con otras queues aunque una falle
      }
    }

    const initializedCount = Object.keys(this.queues).length;
    const totalCount = Object.keys(queueDefinitions).length;
    
    if (initializedCount > 0) {
      this.isConnected = true;
      this.initialized = true;
      logger.info(`Queue system ready: ${initializedCount}/${totalCount} queues initialized`);
    } else {
      throw new Error('Failed to initialize any queues - check Redis connection');
    }
  }

  setupQueueEventListeners(queue, queueName) {
    queue.on('error', (error) => {
      logger.error(`Queue ${queueName} error:`, error);
    });

    queue.on('waiting', (jobId) => {
      logger.debug(`Job ${jobId} waiting in ${queueName}`);
    });

    queue.on('active', (job) => {
      logger.info(`Job ${job.id} active in ${queueName}`, {
        data: job.data,
        attemptsMade: job.attemptsMade
      });
    });

    queue.on('completed', (job, result) => {
      logger.info(`Job ${job.id} completed in ${queueName}`, {
        processingTime: Date.now() - job.timestamp,
        result: typeof result === 'object' ? result : { result }
      });
    });

    queue.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed in ${queueName}:`, {
        error: err.message,
        attemptsMade: job.attemptsMade,
        willRetry: job.attemptsMade < job.opts.attempts
      });
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} stalled in ${queueName} - will be retried`);
    });

    queue.on('removed', (job) => {
      logger.debug(`Job ${job.id} removed from ${queueName}`);
    });
  }

  async getQueue(queueName) {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.queues[queueName]) {
      const available = Object.keys(this.queues);
      throw new Error(
        `Queue '${queueName}' not found. Available queues: ${available.join(', ') || 'none'}`
      );
    }
    
    return this.queues[queueName];
  }

  async addJob(queueName, data, options = {}) {
    try {
      const queue = await this.getQueue(queueName);
      
      // Agregar metadata
      const enrichedData = {
        ...data,
        _metadata: {
          queuedAt: new Date().toISOString(),
          queueName: queueName
        }
      };
      
      const job = await queue.add(enrichedData, {
        ...options,
        timestamp: Date.now()
      });
      
      logger.info(`Job ${job.id} added to ${queueName}`, {
        jobId: job.id,
        queueName: queueName
      });
      
      return {
        id: job.id,
        queue: queueName,
        data: job.data,
        opts: job.opts
      };
      
    } catch (error) {
      logger.error(`Failed to add job to ${queueName}:`, error);
      throw error;
    }
  }

  async getQueueStatus(queueName) {
    try {
      const queue = await this.getQueue(queueName);
      
      const [
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused
      ] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.getPausedCount()
      ]);

      const total = waiting + active + delayed + paused;
      const processedTotal = completed + failed;
      const successRate = processedTotal > 0 
        ? ((completed / processedTotal) * 100).toFixed(2) 
        : 0;

      return {
        name: queueName,
        status: await queue.isPaused() ? 'paused' : 'active',
        counts: {
          waiting,
          active,
          completed,
          failed,
          delayed,
          paused,
          total
        },
        metrics: {
          successRate: `${successRate}%`,
          failureRate: `${processedTotal > 0 ? ((failed / processedTotal) * 100).toFixed(2) : 0}%`,
          throughput: this.calculateThroughput(completed, queue._initTime)
        },
        health: this.calculateQueueHealth(failed, completed, waiting)
      };
      
    } catch (error) {
      logger.error(`Failed to get status for queue ${queueName}:`, error);
      return {
        name: queueName,
        status: 'error',
        error: error.message
      };
    }
  }

  calculateThroughput(completed, initTime) {
    if (!initTime) return '0 jobs/min';
    const minutesRunning = (Date.now() - initTime) / 60000;
    const throughput = minutesRunning > 0 ? (completed / minutesRunning).toFixed(2) : 0;
    return `${throughput} jobs/min`;
  }

  calculateQueueHealth(failed, completed, waiting) {
    if (completed === 0 && failed === 0) {
      return waiting > 100 ? 'overloaded' : 'idle';
    }
    
    const failureRate = failed / (failed + completed);
    
    if (failureRate > 0.5) return 'critical';
    if (failureRate > 0.2) return 'warning';
    if (waiting > 1000) return 'busy';
    
    return 'healthy';
  }

  async getAllQueuesStatus() {
    if (!this.initialized) {
      await this.init();
    }
    
    const statuses = {};
    let overallHealth = 'healthy';
    
    for (const queueName of Object.keys(this.queues)) {
      const status = await this.getQueueStatus(queueName);
      statuses[queueName] = status;
      
      // Determinar salud general
      if (status.health === 'critical' || overallHealth === 'critical') {
        overallHealth = 'critical';
      } else if (status.health === 'warning' && overallHealth !== 'critical') {
        overallHealth = 'warning';
      }
    }
    
    return {
      timestamp: new Date().toISOString(),
      overallHealth,
      totalQueues: Object.keys(this.queues).length,
      queues: statuses
    };
  }

  async getJobs(queueName, status = 'waiting', limit = 10, offset = 0) {
    const queue = await this.getQueue(queueName);
    
    let jobs;
    switch(status) {
      case 'waiting':
        jobs = await queue.getWaiting(offset, offset + limit);
        break;
      case 'active':
        jobs = await queue.getActive(offset, offset + limit);
        break;
      case 'completed':
        jobs = await queue.getCompleted(offset, offset + limit);
        break;
      case 'failed':
        jobs = await queue.getFailed(offset, offset + limit);
        break;
      case 'delayed':
        jobs = await queue.getDelayed(offset, offset + limit);
        break;
      default:
        throw new Error(`Invalid job status: ${status}`);
    }
    
    return jobs.map(job => ({
      id: job.id,
      data: job.data,
      progress: job.progress(),
      attemptsMade: job.attemptsMade,
      opts: job.opts,
      createdAt: new Date(job.timestamp),
      processedAt: job.processedOn ? new Date(job.processedOn) : null,
      failedReason: job.failedReason || null
    }));
  }

  async retryFailedJobs(queueName, limit = 100) {
    const queue = await this.getQueue(queueName);
    const failedJobs = await queue.getFailed(0, limit);
    
    const results = {
      total: failedJobs.length,
      retried: 0,
      errors: []
    };
    
    for (const job of failedJobs) {
      try {
        await job.retry();
        results.retried++;
      } catch (error) {
        results.errors.push({
          jobId: job.id,
          error: error.message
        });
      }
    }
    
    logger.info(`Retry operation completed for ${queueName}:`, results);
    return results;
  }

  async clearQueue(queueName, type = 'completed') {
    const queue = await this.getQueue(queueName);
    
    const validTypes = ['completed', 'failed', 'delayed', 'active', 'wait', 'all'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid clear type. Valid types: ${validTypes.join(', ')}`);
    }
    
    if (type === 'all') {
      await queue.empty();
      await queue.clean(0, 'completed');
      await queue.clean(0, 'failed');
      logger.info(`Queue ${queueName} completely cleared`);
    } else {
      await queue.clean(0, type);
      logger.info(`Cleared ${type} jobs from queue ${queueName}`);
    }
    
    return { success: true, cleared: type };
  }

  async pauseQueue(queueName) {
    const queue = await this.getQueue(queueName);
    await queue.pause();
    logger.info(`Queue ${queueName} paused`);
    return { success: true, status: 'paused' };
  }

  async resumeQueue(queueName) {
    const queue = await this.getQueue(queueName);
    await queue.resume();
    logger.info(`Queue ${queueName} resumed`);
    return { success: true, status: 'active' };
  }

  async closeAll() {
    logger.info('Shutting down queue system...');
    
    for (const [name, queue] of Object.entries(this.queues)) {
      try {
        await queue.close();
        logger.info(`Queue ${name} closed successfully`);
      } catch (error) {
        logger.error(`Error closing queue ${name}:`, error);
      }
    }
    
    this.queues = {};
    this.isConnected = false;
    this.initialized = false;
    logger.info('Queue system shut down complete');
  }

  async healthCheck() {
    const health = {
      status: 'checking',
      timestamp: new Date().toISOString(),
      queues: {}
    };
    
    if (!this.initialized) {
      health.status = 'uninitialized';
      return health;
    }
    
    let hasErrors = false;
    
    for (const [name, queue] of Object.entries(this.queues)) {
      try {
        await queue.isReady();
        health.queues[name] = 'healthy';
      } catch (error) {
        health.queues[name] = 'unhealthy';
        hasErrors = true;
      }
    }
    
    health.status = hasErrors ? 'degraded' : 'healthy';
    return health;
  }
}

// Singleton con patrón getInstance
let instance = null;

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  if (instance) {
    logger.info('SIGTERM received, closing queue system...');
    await instance.closeAll();
  }
});

process.on('SIGINT', async () => {
  if (instance) {
    logger.info('SIGINT received, closing queue system...');
    await instance.closeAll();
  }
});

// Exportar con patrón getInstance
module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new QueueManager();
    }
    return instance;
  }
};
