const AuthService = require('../services/AuthService');
const UserRepository = require('../repositories/UserRepository');
const ApiResponse = require('../utils/apiResponse');
const { isWebBrowser } = require('../utils/platformUtils');
const { logger } = require('../config/logger');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');

class AuthController {
  constructor() {
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.verify2FALogin = this.verify2FALogin.bind(this);
    this.refresh = this.refresh.bind(this);
    this.googleCallback = this.googleCallback.bind(this);
    this.googleExchange = this.googleExchange.bind(this);
    this.verifyEmail = this.verifyEmail.bind(this);
    this.me = this.me.bind(this);
    this.logout = this.logout.bind(this);
    this.forgotPassword = this.forgotPassword.bind(this);
  }

  _setAuthCookies(req, res, { accessToken, refreshToken, deviceId }) {
    const isBrowser = isWebBrowser(req);
    if (!isBrowser) return;

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      maxAge: 15 * 60 * 1000, // 15 mins
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.cookie('deviceId', deviceId, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    });
  }

  async register(req, res, next) {
    try {
      const { email, password, username } = req.body;
      const deviceId = req.cookies?.deviceId || require('crypto').randomUUID();
      
      const { user, accessToken, refreshToken } = await AuthService.register({
        email,
        password,
        username,
        deviceId,
      });

      this._setAuthCookies(req, res, { accessToken, refreshToken, deviceId });
      return ApiResponse.success(res, { user }, 201);
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const deviceId = req.cookies?.deviceId || require('crypto').randomUUID();

      const result = await AuthService.login({ email, password, deviceId });

      if (result.requires2FA) {
        return ApiResponse.success(res, { 
          requires2FA: true, 
          tempToken: result.tempToken 
        }, 200, '2FA code required');
      }

      this._setAuthCookies(req, res, { 
        accessToken: result.accessToken, 
        refreshToken: result.refreshToken, 
        deviceId 
      });

      return ApiResponse.success(res, { user: result.user });
    } catch (error) {
      next(error);
    }
  }

  async verify2FALogin(req, res, next) {
    try {
      const { code, tempToken } = req.body;
      const deviceId = req.cookies?.deviceId || require('crypto').randomUUID();

      const { user, accessToken, refreshToken } = await AuthService.verify2FALogin({
        code,
        tempToken,
        deviceId,
      });

      this._setAuthCookies(req, res, { accessToken, refreshToken, deviceId });
      return ApiResponse.success(res, { user });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req, res, next) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      const deviceId = req.cookies?.deviceId;

      if (!refreshToken || !deviceId) {
        return ApiResponse.error(res, 'Refresh token or device ID missing', 401);
      }

      const { accessToken, newRefreshToken } = await AuthService.refresh({
        refreshToken,
        deviceId,
      });

      this._setAuthCookies(req, res, { 
        accessToken, 
        refreshToken: newRefreshToken, 
        deviceId 
      });
      
      return ApiResponse.success(res, { success: true });
    } catch (error) {
      // If refresh fails, clear cookies to force re-login
      res.clearCookie('accessToken', { sameSite: 'none', secure: true, partitioned: true });
      res.clearCookie('refreshToken', { sameSite: 'none', secure: true, partitioned: true });
      next(error);
    }
  }

  async googleCallback(req, res, next) {
    try {
      const { accessToken, refreshToken, deviceId } = req.user;
      const crypto = require('crypto');
      const exchangeCode = crypto.randomBytes(32).toString('hex');
      
      const redisClient = require('../config/redis');
      await redisClient.setex(`auth_exchange:${exchangeCode}`, 300, JSON.stringify({
        accessToken, refreshToken, deviceId
      }));

      const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:5173';
      logger.info(`Google callback successful. Redirecting to frontend with code for device: ${deviceId}`);
      res.redirect(`${frontendUrl}/auth/success?code=${exchangeCode}`);
    } catch (error) {
      logger.error('Google callback error:', error);
      next(error);
    }
  }

  async googleExchange(req, res, next) {
    try {
      const { code } = req.body;
      logger.info(`Received exchange request for code: ${code?.substring(0, 5)}...`);
      
      if (!code) return ApiResponse.error(res, 'Exchange code required', 400);

      const redisClient = require('../config/redis');
      const data = await redisClient.get(`auth_exchange:${code}`);
      
      if (!data) {
        logger.warn('Exchange code not found in Redis or expired');
        return ApiResponse.error(res, 'Invalid or expired exchange code', 401);
      }

      const { accessToken, refreshToken, deviceId } = JSON.parse(data);
      await redisClient.del(`auth_exchange:${code}`);

      this._setAuthCookies(req, res, { accessToken, refreshToken, deviceId });

      const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
      const user = await UserRepository.findById(decoded.id);

      logger.info(`Exchange successful for user: ${user?.email}`);
      return ApiResponse.success(res, { user: AuthService.sanitizeUser(user) });
    } catch (error) {
      logger.error('Google exchange error:', error);
      next(error);
    }
  }

  async verifyEmail(req, res, next) {
    try {
      const { code } = req.body;
      const authHeader = req.headers.authorization;
      if (!authHeader) return ApiResponse.error(res, 'Missing access token', 401);
      
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

      const user = await AuthService.verifyEmail(decoded.id, code);
      return ApiResponse.success(res, { user });
    } catch (error) {
      next(error);
    }
  }

  async me(req, res, next) {
    try {
      const user = await UserRepository.findById(req.user.id);
      return ApiResponse.success(res, { user: AuthService.sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      const deviceId = req.cookies?.deviceId;
      const allDevices = req.body?.allDevices === true;

      if (deviceId && req.user) {
        if (allDevices) {
          await AuthService.logoutAllDevices(req.user.id);
        } else {
          await AuthService.logout(req.user.id, deviceId);
        }
      }

      // Explicitly clear cookies with production-grade attributes
      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        partitioned: true,
        path: '/'
      };

      res.clearCookie('accessToken', cookieOptions);
      res.clearCookie('refreshToken', cookieOptions);
      // We keep deviceId to maintain tracking across sessions unless user explicitly clears it
      
      return ApiResponse.success(res, null, 200, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      await AuthService.forgotPassword(email);
      return ApiResponse.success(res, null, 200, 'Password reset instructions sent');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
