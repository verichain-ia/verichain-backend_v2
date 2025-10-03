const Redis = require('ioredis');
const logger = require('../utils/logger');

function createRedisClient() {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    logger.info('Redis: Using REDIS_URL for connection');
    return new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 10) return null;
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      enableReadyCheck: true,
      lazyConnect: false
    });
  }
  
  const config = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 10) return null;
      return Math.min(times * 100, 3000);
    }
  };
  
  logger.info('Redis: Using individual parameters', { host: config.host });
  return new Redis(config);
}

const redis = createRedisClient();

redis.on('connect', () => {
  logger.info('Redis client connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis client ready to use');
});

redis.on('error', (error) => {
  logger.error('Redis client error:', error.message);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

module.exports = redis;
