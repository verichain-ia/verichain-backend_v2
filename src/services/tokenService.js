// src/services/tokenService.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class TokenService {
  static TOKEN_TYPES = {
    ACCESS: 'access',
    REFRESH: 'refresh'
  };

  static EXPIRY = {
    ACCESS: '15m',
    REFRESH: '7d',
    REFRESH_SECONDS: 604800 // 7 días en segundos
  };

  /**
   * Generar par de tokens (access + refresh)
   */
  static async generateTokenPair(payload) {
    const tokenFamily = crypto.randomBytes(16).toString('hex');
    
    const accessToken = jwt.sign(
      { ...payload, type: this.TOKEN_TYPES.ACCESS },
      process.env.JWT_SECRET,
      { expiresIn: this.EXPIRY.ACCESS }
    );

    const refreshToken = jwt.sign(
      { 
        ...payload, 
        type: this.TOKEN_TYPES.REFRESH,
        family: tokenFamily
      },
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
      { expiresIn: this.EXPIRY.REFRESH }
    );

    // Guardar refresh token en Redis
    await this.storeRefreshToken(payload.id, refreshToken, tokenFamily);

    return { accessToken, refreshToken, tokenFamily };
  }

  /**
   * Guardar refresh token en Redis
   */
  static async storeRefreshToken(userId, token, family) {
    const key = `refresh_token:${userId}:${family}`;
    await redis.setex(key, this.EXPIRY.REFRESH_SECONDS, token);
    
    // Mantener lista de familias activas
    await redis.sadd(`user_token_families:${userId}`, family);
    
    logger.info(`Refresh token stored for user ${userId}, family ${family}`);
  }

  /**
   * Validar y rotar refresh token
   */
  static async rotateRefreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET
      );

      const key = `refresh_token:${decoded.id}:${decoded.family}`;
      const storedToken = await redis.get(key);

      // Verificar que el token existe en Redis
      if (!storedToken || storedToken !== refreshToken) {
        // Posible ataque - invalidar toda la familia
        await this.invalidateTokenFamily(decoded.id, decoded.family);
        throw new Error('Invalid refresh token - possible token reuse detected');
      }

      // Generar nuevo par de tokens
      const newTokens = await this.generateTokenPair({
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        organization_id: decoded.organization_id
      });

      // Eliminar token antiguo
      await redis.del(key);

      logger.info(`Token rotated for user ${decoded.id}`);
      return newTokens;
    } catch (error) {
      logger.error('Token rotation failed:', error);
      throw error;
    }
  }

  /**
   * Invalidar familia de tokens (seguridad ante robo)
   */
  static async invalidateTokenFamily(userId, family) {
    const key = `refresh_token:${userId}:${family}`;
    await redis.del(key);
    await redis.srem(`user_token_families:${userId}`, family);
    
    logger.warn(`Token family ${family} invalidated for user ${userId}`);
  }

  /**
   * Invalidar todos los tokens de un usuario
   */
  static async invalidateAllUserTokens(userId) {
    const families = await redis.smembers(`user_token_families:${userId}`);
    
    for (const family of families) {
      await redis.del(`refresh_token:${userId}:${family}`);
    }
    
    await redis.del(`user_token_families:${userId}`);
    
    logger.info(`All tokens invalidated for user ${userId}`);
  }

  /**
   * Verificar token en blacklist
   */
  static async isTokenBlacklisted(token) {
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    return !!isBlacklisted;
  }

  /**
   * Agregar token a blacklist
   */
  static async blacklistToken(token, expiryInSeconds = 900) {
    await redis.setex(`blacklist:${token}`, expiryInSeconds, '1');
    logger.info('Token blacklisted');
  }

  /**
   * Limpiar tokens expirados (job periódico)
   */
  static async cleanupExpiredTokens() {
    // Implementar con Bull Queue más adelante
    logger.info('Token cleanup executed');
  }
}

module.exports = TokenService;