const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

/**
 * API Cache Middleware
 * Provides HTTP caching for GET requests using the existing cache service
 */
const apiCache = (duration = '5 minutes') => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Parse duration to seconds
    const durationInSeconds = parseDuration(duration);
    
    // Generate cache key based on URL and user
    const cacheKey = `api:${req.originalUrl}:${req.user?.id || 'public'}`;
    
    try {
      // Try to get from cache
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        logger.debug(`Cache HIT: ${cacheKey}`);
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', `public, max-age=${durationInSeconds}`);
        return res.json(cached);
      }
    } catch (error) {
      logger.error('Cache read error:', error);
      // Continue without cache on error
    }

    // Cache MISS - intercept response to cache it
    const originalJson = res.json;
    res.json = function(data) {
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Cache-Control', `public, max-age=${durationInSeconds}`);
      
      // Cache successful responses only
      if (res.statusCode === 200 && data.success) {
        cacheService.set(cacheKey, data, durationInSeconds)
          .catch(err => logger.error('Cache write error:', err));
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
};

/**
 * Parse duration string to seconds
 */
function parseDuration(duration) {
  const units = {
    second: 1,
    seconds: 1,
    minute: 60,
    minutes: 60,
    hour: 3600,
    hours: 3600,
    day: 86400,
    days: 86400
  };

  const match = duration.match(/(\d+)\s*(second|seconds|minute|minutes|hour|hours|day|days)/i);
  
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    return value * units[unit];
  }
  
  // Default to 5 minutes if parsing fails
  return 300;
}

module.exports = {
  apiCache,
  parseDuration
};
