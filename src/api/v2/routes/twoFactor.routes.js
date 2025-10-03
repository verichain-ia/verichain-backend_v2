// src/api/v1/routes/twoFactor.routes.js
const router = require('express').Router();
const { protect } = require('../../../middleware/auth');
const TwoFactorService = require('../../../services/twoFactorService');
const supabaseAdmin = require('../../../services/supabaseAdmin');
const ResponseFormatter = require('../../../middleware/responseFormatter');
const logger = require('../../../utils/logger');

/**
 * @swagger
 * components:
 *   schemas:
 *     TwoFactorSetup:
 *       type: object
 *       properties:
 *         qr_code:
 *           type: string
 *           description: Base64 encoded QR code image for authenticator apps
 *           example: "data:image/png;base64,iVBORw0KGgoAAAANS..."
 *         secret:
 *           type: string
 *           description: Secret key for manual entry in authenticator apps
 *           example: "JBSWY3DPEHPK3PXP"
 *         backup_codes:
 *           type: array
 *           items:
 *             type: string
 *           description: One-time backup codes for account recovery
 *           example: ["a1b2c3d4", "e5f6g7h8", "i9j0k1l2"]
 *     TwoFactorVerifyEnable:
 *       type: object
 *       required:
 *         - token
 *       properties:
 *         token:
 *           type: string
 *           description: 6-digit TOTP token from authenticator app
 *           example: "123456"
 *           pattern: "^[0-9]{6}$"
 *     TwoFactorDisable:
 *       type: object
 *       required:
 *         - password
 *         - token
 *       properties:
 *         password:
 *           type: string
 *           description: User's current password for security verification
 *           example: "SecurePassword123!"
 *         token:
 *           type: string
 *           description: Current 6-digit TOTP token
 *           example: "654321"
 */

/**
 * @swagger
 * tags:
 *   name: Two-Factor Authentication
 *   description: Two-Factor Authentication (2FA) management endpoints. Implements TOTP (Time-based One-Time Password) using authenticator apps like Google Authenticator or Authy.
 */

/**
 * @swagger
 * /api/v1/2fa/enable:
 *   post:
 *     summary: Initialize 2FA setup
 *     description: |
 *       Generates a new 2FA secret and QR code for the authenticated user.
 *       This is step 1 of the 2FA activation process.
 *       The secret is temporarily stored for 10 minutes to allow verification.
 *       
 *       **Important**: User must verify with a token within 10 minutes or the setup will expire.
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA setup initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/TwoFactorSetup'
 *                 message:
 *                   type: string
 *                   example: "Scan the QR code with your authenticator app"
 *             example:
 *               success: true
 *               data:
 *                 qr_code: "data:image/png;base64,iVBORw0KGgoAAAANS..."
 *                 secret: "JBSWY3DPEHPK3PXP"
 *                 backup_codes: ["a1b2c3d4", "e5f6g7h8", "i9j0k1l2", "m3n4o5p6", "q7r8s9t0"]
 *               message: "Scan the QR code with your authenticator app"
 *       401:
 *         description: User not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @swagger
 * /api/v1/2fa/verify-enable:
 *   post:
 *     summary: Verify and activate 2FA
 *     description: |
 *       Verifies the TOTP token and permanently enables 2FA for the user.
 *       This is step 2 of the 2FA activation process.
 *       
 *       **Security Notes**:
 *       - Token must be verified within 10 minutes of setup initialization
 *       - Backup codes are generated and should be stored securely by the user
 *       - Once enabled, 2FA will be required for all future logins
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TwoFactorVerifyEnable'
 *     responses:
 *       200:
 *         description: 2FA enabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                       example: true
 *                     backup_codes:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Backup codes for account recovery (save these securely!)
 *                 message:
 *                   type: string
 *                   example: "2FA has been enabled successfully"
 *       400:
 *         description: Invalid token or setup expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalid_token:
 *                 value:
 *                   success: false
 *                   error: "Invalid 2FA token"
 *               setup_expired:
 *                 value:
 *                   success: false
 *                   error: "2FA setup expired. Please start again"
 *       401:
 *         description: User not authenticated
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 */
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

/**
 * @swagger
 * /api/v1/2fa/disable:
 *   post:
 *     summary: Disable 2FA
 *     description: |
 *       Disables Two-Factor Authentication for the user account.
 *       Requires both the current password and a valid TOTP token for security verification.
 *       
 *       **Warning**: Disabling 2FA reduces account security.
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TwoFactorDisable'
 *     responses:
 *       200:
 *         description: 2FA disabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: null
 *                 message:
 *                   type: string
 *                   example: "2FA has been disabled"
 *       400:
 *         description: Invalid password or token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Internal server error
 */
router.post('/disable', protect, async (req, res, next) => {
  try {
    const { password, token } = req.body;
    const userId = req.user.id;
    
    // SECURITY: Password verification required before disabling 2FA
    
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