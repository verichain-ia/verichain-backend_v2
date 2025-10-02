// src/services/cacheService.js
const redis = require('../config/redis');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.defaultTTL = 300; // 5 minutos por defecto
    this.prefix = 'cache:';
    this.strategies = {
      certificates: { ttl: 600, prefix: 'cert:' },      // 10 min
      organizations: { ttl: 1800, prefix: 'org:' },     // 30 min
      metrics: { ttl: 60, prefix: 'metrics:' },         // 1 min
      verifications: { ttl: 300, prefix: 'verify:' },   // 5 min
      users: { ttl: 900, prefix: 'user:' }              // 15 min
    };
  }

  // Métodos base
  async get(key) {
    try {
      const startTime = Date.now();
      const data = await redis.get(`${this.prefix}${key}`);
      
      if (data) {
        const duration = Date.now() - startTime;
        logger.debug(`Cache HIT: ${key} (${duration}ms)`);
        return JSON.parse(data);
      }
      
      logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null; // Fail silently, don't break the app
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      const serialized = JSON.stringify(value);
      await redis.setex(
        `${this.prefix}${key}`,
        ttl,
        serialized
      );
      logger.debug(`Cache SET: ${key} (TTL: ${ttl}s, Size: ${serialized.length} bytes)`);
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  async del(key) {
    try {
      await redis.del(`${this.prefix}${key}`);
      logger.debug(`Cache DELETE: ${key}`);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  async invalidate(pattern) {
    try {
      const keys = await redis.keys(`${this.prefix}${pattern}`);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info(`Cache INVALIDATED: ${keys.length} keys matching pattern "${pattern}"`);
      }
      return keys.length;
    } catch (error) {
      logger.error('Cache invalidation error:', error);
      return 0;
    }
  }

  async flush() {
    try {
      const keys = await redis.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.warn(`Cache FLUSHED: ${keys.length} keys removed`);
      }
      return keys.length;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return 0;
    }
  }

  // Métodos específicos para Certificados
  async getCertificate(id) {
    const key = `${this.strategies.certificates.prefix}${id}`;
    return this.get(key);
  }

  async setCertificate(id, data) {
    const key = `${this.strategies.certificates.prefix}${id}`;
    return this.set(key, data, this.strategies.certificates.ttl);
  }

  async invalidateCertificate(id) {
    const key = `${this.strategies.certificates.prefix}${id}`;
    return this.del(key);
  }

  async invalidateCertificatesByOrg(orgId) {
    return this.invalidate(`${this.strategies.certificates.prefix}*:org:${orgId}`);
  }

  // Métodos para Organizations
  async getOrganization(id) {
    const key = `${this.strategies.organizations.prefix}${id}`;
    return this.get(key);
  }

  async setOrganization(id, data) {
    const key = `${this.strategies.organizations.prefix}${id}`;
    return this.set(key, data, this.strategies.organizations.ttl);
  }

  // Métodos para Métricas
  async getMetrics(type, id = 'global') {
    const key = `${this.strategies.metrics.prefix}${type}:${id}`;
    return this.get(key);
  }

  async setMetrics(type, id, data) {
    const key = `${this.strategies.metrics.prefix}${type}:${id}`;
    return this.set(key, data, this.strategies.metrics.ttl);
  }

  // Métodos para verificaciones
  async getVerification(certId) {
    const key = `${this.strategies.verifications.prefix}${certId}`;
    return this.get(key);
  }

  async setVerification(certId, data) {
    const key = `${this.strategies.verifications.prefix}${certId}`;
    return this.set(key, data, this.strategies.verifications.ttl);
  }

  // Cache warming - pre-cargar datos frecuentes
  async warmUp() {
    try {
      logger.info('Cache warm-up starting...');
      
      // Aquí podrías pre-cargar certificados frecuentes, organizaciones, etc.
      // Por ejemplo, los últimos 10 certificados verificados
      
      logger.info('Cache warm-up completed');
    } catch (error) {
      logger.error('Cache warm-up failed:', error);
    }
  }

  // Estadísticas del cache
  async getStats() {
    try {
      const keys = await redis.keys(`${this.prefix}*`);
      const stats = {
        totalKeys: keys.length,
        byType: {}
      };

      // Contar keys por tipo
      for (const strategy in this.strategies) {
        const pattern = `${this.prefix}${this.strategies[strategy].prefix}*`;
        const typeKeys = await redis.keys(pattern);
        stats.byType[strategy] = typeKeys.length;
      }

      // Memoria usada (aproximada)
      const info = await redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      if (memoryMatch) {
        stats.memoryUsed = memoryMatch[1].trim();
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return null;
    }
  }

  // Cache middleware para Express
  middleware(strategy = 'certificates', keyGenerator = (req) => req.path) {
    return async (req, res, next) => {
      // Solo cachear GET requests
      if (req.method !== 'GET') {
        return next();
      }

      const cacheKey = `${this.strategies[strategy].prefix}${keyGenerator(req)}`;
      const cached = await this.get(cacheKey);

      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        return res.json(cached);
      }

      // Interceptar res.json para cachear la respuesta
      const originalJson = res.json;
      res.json = (data) => {
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Key', cacheKey);
        
        // Solo cachear respuestas exitosas
        if (res.statusCode === 200 && data.success !== false) {
          this.set(cacheKey, data, this.strategies[strategy].ttl);
        }
        
        return originalJson.call(res, data);
      };

      next();
    };
  }
}

// Singleton instance
const cacheService = new CacheService();

// Warm up cache cuando se inicia
if (process.env.NODE_ENV === 'production') {
  setTimeout(() => {
    cacheService.warmUp();
  }, 5000); // Esperar 5 segundos después del inicio
}

module.exports = cacheService;