const Redis = require('ioredis');
const logger = require('../utils/logger');

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false
};

const redis = new Redis(redisConfig);

redis.on('connect', () => {
  logger.info('Redis client connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis client ready to use');
});

redis.on('error', (error) => {
  logger.error('Redis client error:', error);
  // No lanzar el error, solo loguearlo
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

module.exports = redis;
