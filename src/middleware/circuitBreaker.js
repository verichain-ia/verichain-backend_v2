const CircuitBreaker = require('opossum');
const logger = require('../utils/logger');

class CircuitBreakerFactory {
  static breakers = new Map();
  
  static defaultOptions = {
    timeout: 30000, // 30 segundos
    errorThresholdPercentage: 50, // Abrir si 50% de requests fallan
    resetTimeout: 30000, // Intentar cerrar después de 30 segundos
    volumeThreshold: 10, // Mínimo 10 requests para calcular el porcentaje
    rollingCountTimeout: 10000, // Ventana de 10 segundos para estadísticas
    name: 'default'
  };

  /**
   * Crear o obtener un circuit breaker
   */
  static getBreaker(name, fn, options = {}) {
    if (!this.breakers.has(name)) {
      const breakerOptions = {
        ...this.defaultOptions,
        ...options,
        name
      };
      
      const breaker = new CircuitBreaker(fn, breakerOptions);
      
      // Event listeners
      breaker.on('open', () => {
        logger.warn(`Circuit breaker ${name} is OPEN`);
      });
      
      breaker.on('halfOpen', () => {
        logger.info(`Circuit breaker ${name} is HALF-OPEN`);
      });
      
      breaker.on('close', () => {
        logger.info(`Circuit breaker ${name} is CLOSED`);
      });
      
      breaker.on('fallback', (data) => {
        logger.info(`Circuit breaker ${name} using fallback`, data);
      });
      
      breaker.on('timeout', () => {
        logger.error(`Circuit breaker ${name} timeout`);
      });
      
      breaker.on('reject', () => {
        logger.error(`Circuit breaker ${name} rejected request`);
      });
      
      this.breakers.set(name, breaker);
    }
    
    return this.breakers.get(name);
  }

  /**
   * Circuit breaker para servicios blockchain
   */
  static blockchainBreaker(fn) {
    return this.getBreaker('blockchain', fn, {
      timeout: 45000, // 45 segundos para blockchain
      errorThresholdPercentage: 60,
      resetTimeout: 60000 // 1 minuto reset
    });
  }

  /**
   * Circuit breaker para base de datos
   */
  static databaseBreaker(fn) {
    return this.getBreaker('database', fn, {
      timeout: 10000, // 10 segundos
      errorThresholdPercentage: 70,
      resetTimeout: 20000
    });
  }

  /**
   * Circuit breaker para servicios externos
   */
  static externalServiceBreaker(serviceName, fn) {
    return this.getBreaker(`external-${serviceName}`, fn, {
      timeout: 15000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    });
  }

  /**
   * Obtener estadísticas de todos los breakers
   */
  static getStats() {
    const stats = {};
    
    this.breakers.forEach((breaker, name) => {
      stats[name] = {
        name: breaker.name,
        enabled: breaker.enabled,
        closed: breaker.closed,
        open: breaker.opened,
        halfOpen: breaker.halfOpen,
        stats: breaker.stats
      };
    });
    
    return stats;
  }

  /**
   * Resetear un breaker específico
   */
  static reset(name) {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.close();
      return true;
    }
    return false;
  }

  /**
   * Resetear todos los breakers
   */
  static resetAll() {
    this.breakers.forEach(breaker => breaker.close());
  }

  /**
   * Middleware Express para aplicar circuit breaker
   */
  static middleware(name, options = {}) {
    return async (req, res, next) => {
      const breaker = this.getBreaker(name, async () => {
        return new Promise((resolve, reject) => {
          const originalSend = res.send;
          const originalJson = res.json;
          
          res.send = function(data) {
            resolve(data);
            return originalSend.call(this, data);
          };
          
          res.json = function(data) {
            resolve(data);
            return originalJson.call(this, data);
          };
          
          // Timeout handler
          const timer = setTimeout(() => {
            reject(new Error('Request timeout'));
          }, options.timeout || 30000);
          
          // Clear timeout on response
          res.on('finish', () => clearTimeout(timer));
          
          next();
        });
      }, options);
      
      try {
        await breaker.fire();
      } catch (error) {
        logger.error(`Circuit breaker ${name} error:`, error);
        
        // Use fallback if available
        if (options.fallback) {
          return options.fallback(req, res);
        }
        
        // Default error response
        res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: `Service ${name} is temporarily unavailable`,
            retry_after: breaker.options.resetTimeout / 1000
          }
        });
      }
    };
  }
}

module.exports = CircuitBreakerFactory;