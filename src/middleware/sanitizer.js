// src/middleware/sanitizer.js
const mongoSanitize = require('mongo-sanitize');
const logger = require('../utils/logger');

class Sanitizer {
  /**
   * Sanitizar inputs contra NoSQL injection usando mongo-sanitize
   */
  static mongoSanitize() {
    return (req, res, next) => {
      try {
        // Sanitizar cada parte del request
        if (req.body) {
          const originalBody = JSON.stringify(req.body);
          req.body = mongoSanitize(req.body);
          if (originalBody !== JSON.stringify(req.body)) {
            logger.warn('NoSQL injection attempt blocked in body');
          }
        }
        
        if (req.query) {
          const originalQuery = JSON.stringify(req.query);
          req.query = mongoSanitize(req.query);
          if (originalQuery !== JSON.stringify(req.query)) {
            logger.warn('NoSQL injection attempt blocked in query');
          }
        }
        
        if (req.params) {
          const originalParams = JSON.stringify(req.params);
          req.params = mongoSanitize(req.params);
          if (originalParams !== JSON.stringify(req.params)) {
            logger.warn('NoSQL injection attempt blocked in params');
          }
        }
        
        next();
      } catch (error) {
        logger.error('Sanitizer error:', error);
        next(); // Continuar aunque falle el sanitizer
      }
    };
  }

  /**
   * Sanitizar SQL queries
   */
  static sqlSanitize() {
    return (req, res, next) => {
      // SQL sanitization si usas SQL
      next();
    };
  }

  /**
   * XSS ya está manejado por validator.js
   */
  static xssSanitize() {
    return (req, res, next) => {
      next();
    };
  }
}

module.exports = Sanitizer;