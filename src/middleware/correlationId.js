const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Middleware para agregar correlation ID a cada request
 * Permite rastrear una request a través de todo el sistema
 */
function correlationIdMiddleware(req, res, next) {
  // Buscar correlation ID existente o crear uno nuevo
  const correlationId = req.headers['x-correlation-id'] || 
                        req.headers['x-request-id'] || 
                        uuidv4();
  
  // Agregar a request y response
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  
  // Agregar al contexto de logging
  req.log = {
    info: (message, meta = {}) => {
      logger.info(message, { correlationId, ...meta });
    },
    error: (message, meta = {}) => {
      logger.error(message, { correlationId, ...meta });
    },
    warn: (message, meta = {}) => {
      logger.warn(message, { correlationId, ...meta });
    },
    debug: (message, meta = {}) => {
      logger.debug(message, { correlationId, ...meta });
    }
  };
  
  // Log del inicio del request
  req.log.info(`${req.method} ${req.path} - Request started`, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  // Interceptar el final del response
  const originalSend = res.send;
  res.send = function(data) {
    // Log del final del request
    req.log.info(`${req.method} ${req.path} - Request completed`, {
      statusCode: res.statusCode,
      responseTime: Date.now() - req._startTime
    });
    
    originalSend.call(this, data);
  };
  
  // Guardar tiempo de inicio
  req._startTime = Date.now();
  
  next();
}

module.exports = correlationIdMiddleware;