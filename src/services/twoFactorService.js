// src/services/twoFactorService.js
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const logger = require('../utils/logger');

class TwoFactorService {
  /**
   * Generar secreto para 2FA
   */
  static generateSecret(userEmail) {
    const secret = speakeasy.generateSecret({
      name: `VeriChain (${userEmail})`,
      issuer: 'VeriChain',
      length: 32
    });
    
    return {
      secret: secret.base32,
      otpauth_url: secret.otpauth_url,
      qr_code: null
    };
  }
  /**
   * Generar QR code para el secreto
   */
  static async generateQRCode(otpauthUrl) {
    try {
      const qrCode = await QRCode.toDataURL(otpauthUrl);
      return qrCode;
    } catch (error) {
      logger.error('Error generating QR code:', error);
      throw error;
    }
  }

  /**
   * Verificar token TOTP
   */
  static verifyToken(token, secret) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2 // Permite 2 intervalos de diferencia (60 segundos)
    });
  }

  /**
   * Generar códigos de respaldo
   */
  static generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(
        Math.random().toString(36).substring(2, 10).toUpperCase()
      );
    }
    return codes;
  }

  /**
   * Verificar código de respaldo
   */
  static verifyBackupCode(inputCode, storedCodes) {
    const index = storedCodes.findIndex(code => code === inputCode);
    if (index !== -1) {
      // Eliminar código usado
      storedCodes.splice(index, 1);
      return true;
    }
    return false;
  }
}

module.exports = TwoFactorService;