const crypto = require('crypto');
const logger = require('../utils/logger');

class ResponseFormatter {
  /**
   * Formato de éxito estándar
   */
  static success(res, data = null, message = null, statusCode = 200) {
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      request_id: res.locals.requestId || crypto.randomUUID()
    };

    if (message) response.message = message;
    if (data !== null) response.data = data;

    // Agregar metadata si existe
    if (res.locals.metadata) {
      response.metadata = res.locals.metadata;
    }

    // Agregar paginación si existe
    if (res.locals.pagination) {
      response.pagination = res.locals.pagination;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Formato de error estándar
   */
  static error(res, message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    const response = {
      success: false,
      timestamp: new Date().toISOString(),
      request_id: res.locals.requestId || crypto.randomUUID(),
      error: {
        code: code,
        message: message,
        status: statusCode
      }
    };

    if (details) {
      response.error.details = details;
    }

    // Log del error
    logger.error(`API Error: ${code} - ${message}`, {
      request_id: response.request_id,
      status: statusCode,
      details: details
    });

    return res.status(statusCode).json(response);
  }

  /**
   * Respuesta de creación (201)
   */
  static created(res, data, message = 'Resource created successfully') {
    return ResponseFormatter.success(res, data, message, 201);
  }

  /**
   * Respuesta sin contenido (204)
   */
  static noContent(res) {
    return res.status(204).send();
  }

  /**
   * Respuesta de validación fallida (422)
   */
  static validationError(res, errors) {
    return ResponseFormatter.error(
      res,
      'Validation failed',
      422,
      'VALIDATION_ERROR',
      errors
    );
  }

  /**
   * Respuesta no autorizado (401)
   */
  static unauthorized(res, message = 'Authentication required') {
    return ResponseFormatter.error(
      res,
      message,
      401,
      'UNAUTHORIZED'
    );
  }

  /**
   * Respuesta prohibido (403)
   */
  static forbidden(res, message = 'Insufficient permissions') {
    return ResponseFormatter.error(
      res,
      message,
      403,
      'FORBIDDEN'
    );
  }

  /**
   * Respuesta no encontrado (404)
   */
  static notFound(res, resource = 'Resource') {
    return ResponseFormatter.error(
      res,
      `${resource} not found`,
      404,
      'NOT_FOUND'
    );
  }

  /**
   * Middleware para agregar request ID
   */
  static addRequestId() {
    return (req, res, next) => {
      res.locals.requestId = req.headers['x-request-id'] || crypto.randomUUID();
      res.setHeader('X-Request-Id', res.locals.requestId);
      next();
    };
  }

  /**
   * Wrapper para controllers async
   */
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

module.exports = ResponseFormatter;