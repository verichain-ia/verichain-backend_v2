const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Categorías de errores para mejor tracking y debugging
 */
const ERROR_CATEGORIES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  BLOCKCHAIN_ERROR: 'BLOCKCHAIN_ERROR',
  QUEUE_ERROR: 'QUEUE_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  BUSINESS_LOGIC_ERROR: 'BUSINESS_LOGIC_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

class ErrorTracker {
  constructor() {
    this.errorStats = new Map();
    this.recentErrors = [];
    this.maxRecentErrors = 100;
  }

  /**
   * Categoriza un error basado en su mensaje y stack
   */
  categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    const stack = error.stack?.toLowerCase() || '';
    
    if (message.includes('validation') || message.includes('invalid')) {
      return ERROR_CATEGORIES.VALIDATION_ERROR;
    }
    if (message.includes('unauthorized') || message.includes('jwt')) {
      return ERROR_CATEGORIES.AUTHENTICATION_ERROR;
    }
    if (message.includes('forbidden') || message.includes('permission')) {
      return ERROR_CATEGORIES.AUTHORIZATION_ERROR;
    }
    if (message.includes('database') || message.includes('supabase') || stack.includes('postgres')) {
      return ERROR_CATEGORIES.DATABASE_ERROR;
    }
    if (message.includes('blockchain') || message.includes('paseo')) {
      return ERROR_CATEGORIES.BLOCKCHAIN_ERROR;
    }
    if (message.includes('queue') || message.includes('bull')) {
      return ERROR_CATEGORIES.QUEUE_ERROR;
    }
    if (message.includes('cache') || message.includes('redis')) {
      return ERROR_CATEGORIES.CACHE_ERROR;
    }
    if (message.includes('rate limit') || message.includes('too many')) {
      return ERROR_CATEGORIES.RATE_LIMIT_ERROR;
    }
    if (message.includes('external') || message.includes('api')) {
      return ERROR_CATEGORIES.EXTERNAL_SERVICE_ERROR;
    }
    
    return ERROR_CATEGORIES.UNKNOWN_ERROR;
  }

  /**
   * Genera un fingerprint único para el error
   * Útil para agrupar errores similares
   */
  generateFingerprint(error, category) {
    const components = [
      category,
      error.name || 'Error',
      // Normalizar el mensaje removiendo valores dinámicos
      error.message?.replace(/[0-9a-f-]{36}/gi, 'UUID')
                   .replace(/\d+/g, 'N')
                   .replace(/["'][^"']+["']/g, 'STR')
    ];
    
    // Si hay stack, agregar las primeras líneas relevantes
    if (error.stack) {
      const stackLines = error.stack.split('\n').slice(1, 3);
      components.push(...stackLines.map(line => 
        line.trim().replace(/:\d+:\d+/g, '')
      ));
    }
    
    const fingerprint = crypto
      .createHash('md5')
      .update(components.join('|'))
      .digest('hex');
    
    return fingerprint;
  }

  /**
   * Registra un error con toda la información relevante
   */
  trackError(error, context = {}) {
    const category = this.categorizeError(error);
    const fingerprint = this.generateFingerprint(error, category);
    const timestamp = new Date().toISOString();
    
    // Información completa del error
    const errorInfo = {
      timestamp,
      category,
      fingerprint,
      name: error.name || 'Error',
      message: error.message,
      stack: error.stack,
      context,
      correlationId: context.correlationId,
      userId: context.userId,
      path: context.path,
      method: context.method
    };
    
    // Actualizar estadísticas
    if (!this.errorStats.has(fingerprint)) {
      this.errorStats.set(fingerprint, {
        count: 0,
        firstSeen: timestamp,
        lastSeen: timestamp,
        category,
        message: error.message,
        contexts: []
      });
    }
    
    const stats = this.errorStats.get(fingerprint);
    stats.count++;
    stats.lastSeen = timestamp;
    stats.contexts.push(context);
    
    // Mantener solo los últimos 10 contextos por fingerprint
    if (stats.contexts.length > 10) {
      stats.contexts = stats.contexts.slice(-10);
    }
    
    // Agregar a errores recientes
    this.recentErrors.unshift(errorInfo);
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.pop();
    }
    
    // Log estructurado del error
    logger.error('Error tracked', {
      category,
      fingerprint,
      errorName: error.name,
      errorMessage: error.message,
      ...context
    });
    
    // Alertas para errores críticos
    if (stats.count > 10 && stats.count % 10 === 0) {
      logger.error(`ALERT: Error ${fingerprint} has occurred ${stats.count} times`, {
        category,
        message: error.message
      });
    }
    
    return {
      category,
      fingerprint,
      tracked: true
    };
  }

  /**
   * Obtiene estadísticas de errores
   */
  getErrorStats() {
    const stats = {
      totalErrors: 0,
      byCategory: {},
      topErrors: [],
      recentErrors: this.recentErrors.slice(0, 10)
    };
    
    // Contar por categoría
    for (const [fingerprint, errorStat] of this.errorStats) {
      stats.totalErrors += errorStat.count;
      
      if (!stats.byCategory[errorStat.category]) {
        stats.byCategory[errorStat.category] = 0;
      }
      stats.byCategory[errorStat.category] += errorStat.count;
    }
    
    // Top 10 errores más frecuentes
    stats.topErrors = Array.from(this.errorStats.entries())
      .map(([fingerprint, stat]) => ({
        fingerprint,
        count: stat.count,
        category: stat.category,
        message: stat.message,
        firstSeen: stat.firstSeen,
        lastSeen: stat.lastSeen
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return stats;
  }

  /**
   * Limpia errores antiguos
   */
  cleanup(olderThanHours = 24) {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    
    // Limpiar estadísticas antiguas
    for (const [fingerprint, stat] of this.errorStats) {
      if (new Date(stat.lastSeen) < cutoff) {
        this.errorStats.delete(fingerprint);
      }
    }
    
    // Limpiar errores recientes
    this.recentErrors = this.recentErrors.filter(
      error => new Date(error.timestamp) > cutoff
    );
  }
}

// Singleton
let instance = null;

module.exports = {
  ERROR_CATEGORIES,
  getInstance: () => {
    if (!instance) {
      instance = new ErrorTracker();
    }
    return instance;
  }
};