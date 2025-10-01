const jwt = require('jsonwebtoken');
const TokenService = require('../services/tokenService');
const { AuthenticationError } = require('../errors');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  try {
    // Extraer token del header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'No token provided' 
      });
    }
    
    const token = authHeader.slice(7); // Remover "Bearer "
    
    // Verificar si el token está en blacklist
    const isBlacklisted = await TokenService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      logger.warn(`Blacklisted token attempted: ${token.substring(0, 20)}...`);
      return res.status(401).json({ 
        success: false, 
        error: 'Token has been revoked' 
      });
    }
    
    // Verificar y decodificar token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false, 
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
      throw jwtError;
    }
    
    // Verificar que es un token de acceso (no refresh)
    if (decoded.type === 'refresh') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token type',
        code: 'WRONG_TOKEN_TYPE'
      });
    }
    
    // Adjuntar usuario al request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      organization_id: decoded.organization_id
    };
    
    // Log de acceso (solo en debug)
    logger.debug(`User ${decoded.email} authenticated for ${req.method} ${req.path}`);
    
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication failed' 
    });
  }
};

// Middleware para verificar roles específicos
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Access denied for user ${req.user.email} with role ${req.user.role}`);
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }
    
    next();
  };
};

// Middleware para verificar organización
const requireOrganization = (req, res, next) => {
  if (!req.user.organization_id) {
    return res.status(403).json({
      success: false,
      error: 'User must belong to an organization'
    });
  }
  next();
};

module.exports = { 
  protect: authMiddleware,
  requireRole,
  requireOrganization
};