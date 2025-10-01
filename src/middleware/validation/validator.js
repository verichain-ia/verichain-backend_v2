// src/middleware/validation/validator.js
const xss = require('xss');

class ValidationMiddleware {
  /**
   * Valida el body de la request con el schema de Joi
   */
  static validateBody(schema) {
    return async (req, res, next) => {
      try {
        // Sanitizar primero
        req.body = ValidationMiddleware.sanitizeObject(req.body);
        
        // Validar con Joi
        const validated = await schema.validateAsync(req.body, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });

        req.body = validated;
        next();
      } catch (error) {
        if (error.isJoi) {
          const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            type: detail.type
          }));

          return res.status(422).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Validation failed',
              details: errors
            }
          });
        }
        next(error);
      }
    };
  }

  /**
   * Valida query params
   */
  static validateQuery(schema) {
    return async (req, res, next) => {
      try {
        const validated = await schema.validateAsync(req.query, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });

        // Crear un nuevo objeto en lugar de modificar directamente
        req.validatedQuery = validated;
        next();
      } catch (error) {
        if (error.isJoi) {
          const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            type: detail.type
          }));

          return res.status(422).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Query validation failed',
              details: errors
            }
          });
        }
        next(error);
      }
    };
  }

  /**
   * Valida params de ruta
   */
  static validateParams(schema) {
    return async (req, res, next) => {
      try {
        const validated = await schema.validateAsync(req.params, {
          abortEarly: false,
          stripUnknown: false
        });

        req.validatedParams = validated;
        next();
      } catch (error) {
        if (error.isJoi) {
          return res.status(422).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid parameters',
              details: error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
              }))
            }
          });
        }
        next(error);
      }
    };
  }

  /**
   * Sanitiza un objeto recursivamente
   */
  static sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        if (typeof value === 'string') {
          // Sanitizar XSS
          sanitized[key] = xss(value.trim());
        } else if (Array.isArray(value)) {
          sanitized[key] = value.map(item => 
            typeof item === 'object' ? ValidationMiddleware.sanitizeObject(item) : item
          );
        } else if (value && typeof value === 'object') {
          sanitized[key] = ValidationMiddleware.sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }
    }

    return sanitized;
  }

  /**
   * Middleware para sanitización general - SIMPLIFICADO
   */
  static sanitize() {
    return (req, res, next) => {
      // Solo sanitizar body ya que query y params pueden ser read-only
      if (req.body) {
        req.body = ValidationMiddleware.sanitizeObject(req.body);
      }
      next();
    };
  }

  /**
   * Valida que el ID sea válido
   */
  static validateId() {
    return (req, res, next) => {
      const { id } = req.params;

      if (!id || id.length > 20) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ID',
            message: 'Invalid certificate ID format'
          }
        });
      }

      next();
    };
  }

  /**
   * Valida UUID
   */
  static validateUUID() {
    return (req, res, next) => {
      const { id } = req.params;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!uuidRegex.test(id)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_UUID',
            message: 'Invalid UUID format'
          }
        });
      }

      next();
    };
  }
}

module.exports = ValidationMiddleware;