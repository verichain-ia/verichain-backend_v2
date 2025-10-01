const jwt = require('jsonwebtoken');
const supabaseService = require('../services/supabaseService');
const supabaseAdmin = require('../services/supabaseAdmin');
const { AuthenticationError, AuthorizationError, ValidationError } = require('../errors');
const ResponseFormatter = require('../middleware/responseFormatter');
const TokenService = require('../services/tokenService');
const logger = require('../utils/logger');


const authController = {
  async register(req, res, next) {
    try {
      const { email, password, name, organization_id } = req.body;
      
      // 1. Crear usuario en Supabase Auth
      const { data: authData, error: authError } = await supabaseService.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name
          }
        }
      });
      
      if (authError) {
        if (authError.message.includes('already registered')) {
          throw new ValidationError([{ 
            field: 'email', 
            message: 'Email already registered' 
          }]);
        }
        throw authError;
      }
      
      // 2. Crear registro en public.users
      const userData = await supabaseAdmin.createUserProfile({
        id: authData.user.id,
        email,
        full_name: name,
        organization_id,
        role: 'student'
      });
      
      // Generar tokens con el nuevo sistema
      const { accessToken, refreshToken } = await TokenService.generateTokenPair({
        id: userData.id,
        email: userData.email,
        role: userData.role,
        organization_id: userData.organization_id
      });

      ResponseFormatter.created(res, {
        token: accessToken,
        refreshToken,
        user: { 
          id: userData.id, 
          email: userData.email, 
          name: userData.full_name,
          role: userData.role 
        }
      }, 'User registered successfully');
    } catch (error) {
      next(error); // Pasa el error al error handler
    }
  },

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      
      // 1. Autenticar con Supabase Auth
      const { data: authData, error: authError } = await supabaseService.supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (authError) {
        throw new AuthenticationError('Invalid email or password');
      }
      
      // 2. Obtener datos del usuario
      const user = await supabaseAdmin.getUserForAuth(authData.user.id);
      
      if (!user) {
        throw new AuthenticationError('User profile not found');
      }
      
      // En lugar de generar tokens manualmente, usa TokenService
      const { accessToken, refreshToken } = await TokenService.generateTokenPair({
        id: user.id,
        email: user.email,
        role: user.role,
        organization_id: user.organization_id
      });

      ResponseFormatter.success(res, {
        token: accessToken,  // Mantener como 'token' para compatibilidad
        refreshToken,
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.full_name,
          role: user.role,
          organization_id: user.organization_id 
        }
      }, 'Login successful');
    } catch (error) {
      next(error);
    }
  },

  async logout(req, res, next) {
    try {
      // Obtener el user ID del token (si está autenticado)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          // Invalidar todos los tokens del usuario
          await TokenService.invalidateAllUserTokens(decoded.id);
          // Agregar token actual a blacklist
          await TokenService.blacklistToken(token);
        } catch (err) {
          // Si el token es inválido, continuar con el logout normal
          logger.debug('Token invalid during logout:', err.message);
        }
      }
      
      // Logout de Supabase
      await supabaseService.supabase.auth.signOut();
      
      ResponseFormatter.success(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  },

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        throw new ValidationError([{ 
          field: 'refreshToken', 
          message: 'Refresh token is required' 
        }]);
      }
      
      // Usar el nuevo sistema de rotación de tokens
      try {
        const tokens = await TokenService.rotateRefreshToken(refreshToken);
        
        ResponseFormatter.success(res, { 
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken 
        }, 'Token refreshed successfully');
        
      } catch (tokenError) {
        // Si falla la rotación, es un token inválido o posible ataque
        logger.warn('Token rotation failed:', tokenError.message);
        throw new AuthenticationError('Invalid or expired refresh token');
      }
      
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof ValidationError) {
        next(error);
      } else {
        next(new AuthenticationError('Token refresh failed'));
      }
    }
  },

  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      
      if (!email) {
        throw new ValidationError([{ 
          field: 'email', 
          message: 'Email is required' 
        }]);
      }
      
      // Usar Supabase Auth para reset de password
      const { error } = await supabaseService.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: process.env.FRONTEND_URL ? 
          `${process.env.FRONTEND_URL}/reset-password` : 
          'http://localhost:3000/reset-password'
      });
      
      if (error) throw error;
      
      // No revelar si el email existe o no por seguridad
      ResponseFormatter.success(res, null, 'If the email exists, a password reset link has been sent');
    } catch (error) {
      next(error);
    }
  },

  async resetPassword(req, res, next) {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        const errors = [];
        if (!token) errors.push({ field: 'token', message: 'Reset token is required' });
        if (!password) errors.push({ field: 'password', message: 'New password is required' });
        throw new ValidationError(errors);
      }
      
      // Actualizar password usando Supabase Auth
      const { error } = await supabaseService.supabase.auth.updateUser({
        password: password
      });
      
      if (error) {
        if (error.message.includes('expired')) {
          throw new AuthenticationError('Reset token has expired');
        }
        throw error;
      }
      
      ResponseFormatter.success(res, null, 'Password has been reset successfully');
    } catch (error) {
      next(error);
    }
  },

  async verifyEmail(req, res, next) {
    try {
      const { token } = req.query;
      
      if (!token) {
        throw new ValidationError([{ 
          field: 'token', 
          message: 'Verification token is required' 
        }]);
      }
      
      // Verificar email con Supabase Auth
      const { error } = await supabaseService.supabase.auth.verifyOtp({
        token_hash: token,
        type: 'email'
      });
      
      if (error) {
        if (error.message.includes('expired')) {
          throw new AuthenticationError('Verification token has expired');
        }
        throw new AuthenticationError('Invalid verification token');
      }
      
      ResponseFormatter.success(res, null, 'Email has been verified successfully');
    } catch (error) {
      next(error);
    }
  }
};

module.exports = authController;