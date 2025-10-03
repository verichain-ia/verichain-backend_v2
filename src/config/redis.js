const Redis = require('ioredis');
const logger = require('../utils/logger');

// Parser para REDIS_URL
function parseRedisUrl(url) {
  if (!url) return null;
  
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined
    };
  } catch (error) {
    logger.error('Invalid REDIS_URL format:', error);
    return null;
  }
}

// Configuración de Redis
let redisConfig;

if (process.env.REDIS_URL) {
  // Si hay REDIS_URL, usarla (Railway/producción)
  const parsed = parseRedisUrl(process.env.REDIS_URL);
  if (parsed) {
    redisConfig = parsed;
    logger.info('Using REDIS_URL for connection');
  }
}

if (!redisConfig) {
  // Fallback a variables separadas (desarrollo local)
  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  };
  logger.info('Using individual Redis variables');
}

// Agregar configuración adicional
redisConfig.db = process.env.REDIS_DB || 0;
redisConfig.retryStrategy = (times) => {
  const delay = Math.min(times * 50, 2000);
  return delay;
};
redisConfig.maxRetriesPerRequest = 3;
redisConfig.enableReadyCheck = true;
redisConfig.lazyConnect = false;

const redis = new Redis(redisConfig);

redis.on('connect', () => {
  logger.info('Redis client connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis client ready to use');
});

redis.on('error', (error) => {
  logger.error('Redis client error:', error);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

module.exports = redis;
