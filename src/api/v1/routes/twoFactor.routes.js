// src/api/v1/routes/twoFactor.routes.js
const router = require('express').Router();
const { protect } = require('../../../middleware/auth');
const TwoFactorService = require('../../../services/twoFactorService');
const supabaseAdmin = require('../../../services/supabaseAdmin');
const ResponseFormatter = require('../../../middleware/responseFormatter');
const logger = require('../../../utils/logger');

// Habilitar 2FA - paso 1: generar secreto
router.post('/enable', protect, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    // Generar secreto
    const { secret, otpauth_url } = TwoFactorService.generateSecret(userEmail);
    
    // Generar QR
    const qrCode = await TwoFactorService.generateQRCode(otpauth_url);
    
    // Generar códigos de respaldo
    const backupCodes = TwoFactorService.generateBackupCodes();
    
    // Guardar temporalmente en Redis (expira en 10 minutos)
    const redis = require('../../../config/redis');
    await redis.setex(
      `2fa_setup:${userId}`,
      600,
      JSON.stringify({ secret, backupCodes })
    );
    
    ResponseFormatter.success(res, {
      qr_code: qrCode,
      secret: secret,
      backup_codes: backupCodes
    }, 'Scan the QR code with your authenticator app');
    
  } catch (error) {
    next(error);
  }
});

// Habilitar 2FA - paso 2: verificar y activar
router.post('/verify-enable', protect, async (req, res, next) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;
    
    if (!token) {
      return ResponseFormatter.validationError(res, [
        { field: 'token', message: '2FA token is required' }
      ]);
    }
    
    // Obtener secreto temporal de Redis
    const redis = require('../../../config/redis');
    const setupData = await redis.get(`2fa_setup:${userId}`);
    
    if (!setupData) {
      return ResponseFormatter.error(res, '2FA setup expired. Please start again', 400);
    }
    
    const { secret, backupCodes } = JSON.parse(setupData);
    
    // Verificar token
    const isValid = TwoFactorService.verifyToken(token, secret);
    
    if (!isValid) {
      return ResponseFormatter.error(res, 'Invalid 2FA token', 400);
    }
    
    // Guardar en base de datos
    const { data, error } = await supabaseAdmin.client
    .from('users')
    .update({
        two_factor_secret: secret,
        two_factor_enabled: true,
        two_factor_backup_codes: backupCodes
    })
    .eq('id', userId)
    .select();

    if (error) {
    logger.error('Failed to update 2FA in database:', error);
    throw error;
    }
    
    // Limpiar Redis
    await redis.del(`2fa_setup:${userId}`);
    
    logger.info(`2FA enabled for user ${userId}`);
    
    ResponseFormatter.success(res, {
      enabled: true,
      backup_codes: backupCodes
    }, '2FA has been enabled successfully');
    
  } catch (error) {
    next(error);
  }
});

// Deshabilitar 2FA
router.post('/disable', protect, async (req, res, next) => {
  try {
    const { password, token } = req.body;
    const userId = req.user.id;
    
    // TODO: Verificar password y token actual
    
    await supabaseAdmin.client
      .from('users')
      .update({
        two_factor_secret: null,
        two_factor_enabled: false,
        two_factor_backup_codes: null
      })
      .eq('id', userId);
    
    ResponseFormatter.success(res, null, '2FA has been disabled');
  } catch (error) {
    next(error);
  }
});

module.exports = router;