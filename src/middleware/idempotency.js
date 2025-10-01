const redis = require('../config/redis');
const crypto = require('crypto');
const logger = require('../utils/logger');

class IdempotencyMiddleware {
  static async check(req, res, next) {
    // Solo aplicar a métodos que modifican estado
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['x-idempotency-key'];
    
    if (!idempotencyKey) {
      logger.debug(`Request without idempotency key: ${req.method} ${req.path}`);
      return next();
    }

    // Validar formato del key
    if (!/^[a-zA-Z0-9-_]{8,64}$/.test(idempotencyKey)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency key must be 8-64 alphanumeric characters'
        }
      });
    }

    const userId = req.user?.id || 'anonymous';
    const method = req.method;
    const path = req.originalUrl || req.path;
    const cacheKey = `idempotency:${userId}:${method}:${crypto.createHash('md5').update(path).digest('hex')}:${idempotencyKey}`;
    
    try {
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        const result = JSON.parse(cached);
        
        if (result.status === 'processing') {
          const elapsed = Date.now() - result.timestamp;
          
          if (elapsed > 300000) {
            logger.warn(`Idempotency key timeout, allowing retry: ${idempotencyKey}`);
            await redis.del(cacheKey);
            return next();
          }
          
          logger.warn(`Request already processing with key: ${idempotencyKey}`);
          return res.status(409).json({
            success: false,
            error: {
              code: 'REQUEST_IN_PROGRESS',
              message: 'Request with this idempotency key is already being processed',
              idempotency_key: idempotencyKey,
              retry_after: Math.ceil((300000 - elapsed) / 1000)
            }
          });
        }
        
        logger.info(`Returning cached response for idempotency key: ${idempotencyKey}`);
        res.set('X-Idempotent-Replayed', 'true');
        res.set('X-Idempotency-Key', idempotencyKey);
        res.set('X-Cache-Hit', 'true');
        
        return res.status(result.statusCode).json(result.body);
      }
      
      const processingData = {
        status: 'processing',
        timestamp: Date.now(),
        request_id: crypto.randomUUID(),
        user_id: userId,
        method: method,
        path: path
      };
      
      await redis.setex(cacheKey, 300, JSON.stringify(processingData));
      
      logger.info(`Processing new request with idempotency key: ${idempotencyKey}`);
      
      const originalJson = res.json;
      res.json = async function(body) {
        try {
          const statusCode = res.statusCode;
          
          if (statusCode < 500) {
            const ttl = statusCode < 400 ? 86400 : 3600;
            
            await redis.setex(
              cacheKey,
              ttl,
              JSON.stringify({
                status: 'completed',
                statusCode: statusCode,
                body: body,
                timestamp: Date.now(),
                request_id: processingData.request_id
              })
            );
            
            logger.info(`Cached response for idempotency key: ${idempotencyKey}`);
          } else {
            await redis.del(cacheKey);
            logger.warn(`Server error, removed idempotency key: ${idempotencyKey}`);
          }
        } catch (error) {
          logger.error('Failed to cache idempotent response:', error);
        }
        
        res.set('X-Idempotency-Key', idempotencyKey);
        res.set('X-Idempotent-Replayed', 'false');
        
        return originalJson.call(this, body);
      };
      
      next();
      
    } catch (error) {
      logger.error('Idempotency middleware error:', error);
      logger.warn('Redis unavailable, proceeding without idempotency');
      next();
    }
  }

  static generateKey() {
    return crypto.randomBytes(16).toString('hex');
  }
  
  static async cleanup() {
    try {
      const pattern = 'idempotency:*';
      let cleaned = 0;
      
      // Usar scan en lugar de keys para mejor performance
      const stream = redis.scanStream({
        match: pattern,
        count: 100
      });
      
      return new Promise((resolve, reject) => {
        stream.on('data', async (keys) => {
          if (keys.length) {
            for (const key of keys) {
              try {
                const value = await redis.get(key);
                if (value) {
                  const data = JSON.parse(value);
                  if (data.status === 'processing' && 
                      Date.now() - data.timestamp > 3600000) {
                    await redis.del(key);
                    cleaned++;
                  }
                }
              } catch (err) {
                logger.error(`Error cleaning key ${key}:`, err);
              }
            }
          }
        });
        
        stream.on('end', () => {
          logger.info(`Idempotency cleanup: removed ${cleaned} stale keys`);
          resolve(cleaned);
        });
        
        stream.on('error', (err) => {
          logger.error('Error in cleanup scan:', err);
          reject(err);
        });
      });
    } catch (error) {
      logger.error('Idempotency cleanup failed:', error);
      return 0;
    }
  }
  
  static async getStats() {
    try {
      const pattern = 'idempotency:*';
      const keys = [];
      
      // Usar scan para obtener todas las keys
      const stream = redis.scanStream({
        match: pattern,
        count: 100
      });
      
      return new Promise((resolve) => {
        let processing = 0;
        let completed = 0;
        
        stream.on('data', async (batch) => {
          for (const key of batch) {
            keys.push(key);
            try {
              const value = await redis.get(key);
              if (value) {
                const data = JSON.parse(value);
                if (data.status === 'processing') processing++;
                if (data.status === 'completed') completed++;
              }
            } catch (err) {
              // Ignorar errores de parsing
            }
          }
        });
        
        stream.on('end', () => {
          resolve({
            total: keys.length,
            processing,
            completed,
            timestamp: new Date().toISOString()
          });
        });
        
        stream.on('error', () => {
          resolve({
            total: 0,
            processing: 0,
            completed: 0,
            error: 'Failed to get stats',
            timestamp: new Date().toISOString()
          });
        });
      });
    } catch (error) {
      logger.error('Failed to get idempotency stats:', error);
      return {
        total: 0,
        processing: 0,
        completed: 0,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = IdempotencyMiddleware;