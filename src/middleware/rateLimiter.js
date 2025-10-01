const rateLimit = require('express-rate-limit');

// Límite general para API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por ventana
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        retryAfter: req.rateLimit.resetTime
      }
    });
  }
});

// Límite estricto para autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // solo 5 intentos de login
  skipSuccessfulRequests: true, // no contar requests exitosos
  message: 'Too many authentication attempts',
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT',
        message: 'Too many authentication attempts, please try again in 15 minutes'
      }
    });
  }
});

// Límite para creación de recursos
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 30, // máximo 30 certificados por hora
  skipFailedRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'CREATE_RATE_LIMIT',
        message: 'Certificate creation limit exceeded, maximum 30 per hour'
      }
    });
  }
});

// Límite para operaciones blockchain
const blockchainLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // máximo 10 registros blockchain por hora
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'BLOCKCHAIN_RATE_LIMIT',
        message: 'Blockchain operation limit exceeded, maximum 10 per hour'
      }
    });
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  createLimiter,
  blockchainLimiter
};
