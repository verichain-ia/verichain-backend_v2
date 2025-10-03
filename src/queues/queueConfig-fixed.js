// src/queues/queueConfig.js - VERSIÓN COMERCIAL COMPLETA
const Bull = require('bull');
const logger = require('../utils/logger');

class QueueManager {
  constructor() {
    this.queues = {};
    this.isConnected = false;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      logger.warn('QueueManager already initialized');
      return;
    }

    logger.info('Initializing Queue Management System...');
    
    // Configure Redis for Bull queues
    let redisConfig;
    
    if (process.env.REDIS_URL) {
      // Use REDIS_URL directly for Bull (Railway/Production)
      redisConfig = process.env.REDIS_URL;
      logger.info('Queues: Using REDIS_URL for connection');
    } else {
      // Fallback to individual parameters (Development)
      redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          logger.debug(`Queue Redis retry ${times}, delay: ${delay}ms`);
          return delay;
        }
      };
      logger.info('Queues: Using individual Redis parameters');
    }

    // Rest of the existing queueConfig code stays the same...
    // (Keep all the queue definitions exactly as they are)
