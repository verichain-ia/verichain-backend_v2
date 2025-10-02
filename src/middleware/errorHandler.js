const logger = require('../utils/logger');
const AppError = require('../errors/AppError');
const ErrorTracker = require('../services/errorTracker');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Obtener error tracker
  const errorTracker = ErrorTracker.getInstance();
  
  // Contexto del error con correlation ID
  const context = {
    correlationId: req.correlationId,
    userId: req.user?.id,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  };
  
  // Trackear el error
  const { category, fingerprint } = errorTracker.trackError(err, context);

  // Log del error (mejorado con correlation ID)
  logger.error({
    correlationId: req.correlationId,  // AGREGADO
    category,                           // AGREGADO
    fingerprint,                        // AGREGADO
    error: {
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode,
      code: err.code
    },
    request: {
      method: req.method,
      url: req.url,
      ip: req.ip,
      user: req.user?.id
    }
  });

  // Errores de Mongoose/Supabase
  if (err.code === '23505') {
    // Duplicate key error
    error = new AppError('Duplicate field value', 400, 'DUPLICATE_ERROR');
  }

  if (err.code === 'PGRST116') {
    // Not found error de Supabase
    error = new AppError('Resource not found', 404, 'NOT_FOUND');
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token', 401, 'INVALID_TOKEN');
  }

  if (err.name === 'TokenExpiredError') {
    error = new AppError('Token expired', 401, 'TOKEN_EXPIRED');
  }

  // Respuesta en desarrollo vs producción
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(error.statusCode || 500).json({
    success: false,
    correlationId: req.correlationId,  // AGREGADO
    error: {
      code: error.code || 'SERVER_ERROR',
      message: error.message || 'Something went wrong',
      details: error.details || null,
      category: isDevelopment ? category : undefined,      // AGREGADO
      fingerprint: isDevelopment ? fingerprint : undefined, // AGREGADO
      ...(isDevelopment && { stack: err.stack })
    },
    ...(isDevelopment && { originalError: err.message })
  });
};

// Middleware para rutas no encontradas
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    correlationId: req.correlationId,  // AGREGADO
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.originalUrl} not found`
    }
  });
};

module.exports = { errorHandler, notFound };