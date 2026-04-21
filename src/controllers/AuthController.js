const AuthService = require('../services/AuthService');
const { isWebBrowser } = require('../utils/platformUtils');
const ApiResponse = require('../utils/apiResponse');

class AuthController {
  constructor() {
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.verify2FALogin = this.verify2FALogin.bind(this);
    this.refresh = this.refresh.bind(this);
    this.googleCallback = this.googleCallback.bind(this);
    this.verifyEmail = this.verifyEmail.bind(this);
    this.me = this.me.bind(this);
    this.logout = this.logout.bind(this);
  }
  _getOrGenerateDeviceId(req) {
    const crypto = require('crypto');
    let deviceId = req.cookies?.deviceId || req.body?.deviceId;
    if (!deviceId) deviceId = crypto.randomUUID();
    return deviceId;
  }

  _setAuthCookies(req, res, { accessToken, refreshToken, deviceId }) {
    const isBrowser = isWebBrowser(req);
    if (!isBrowser) return;

    if (accessToken) {
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        partitioned: true,
        maxAge: 15 * 60 * 1000 // 15 mins
      });
    }

    if (refreshToken) {
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        partitioned: true,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }

    if (deviceId) {
      res.cookie('deviceId', deviceId, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        partitioned: true,
        maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year
      });
    }
  }

  async register(req, res, next) {
    try {
      const { email, username, password } = req.body;
      if (!email || !username || !password) {
        return ApiResponse.error(res, 'Username, email and password required', 400);
      }
      
      const deviceId = this._getOrGenerateDeviceId(req);
      const { user, accessToken, refreshToken } = await AuthService.registerWithEmailPassword(email, username, password, deviceId);
      
      this._setAuthCookies(req, res, { accessToken, refreshToken, deviceId });
      
      if (isWebBrowser(req)) {
        return ApiResponse.success(res, { user }, 201);
      } else {
        return ApiResponse.success(res, { user, accessToken, refreshToken }, 201);
      }
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const deviceId = this._getOrGenerateDeviceId(req);
      const result = await AuthService.loginWithEmailPassword(email, password, deviceId);
      
      if (result.requires2FA) {
        return ApiResponse.success(res, result, 202); // 202 Accepted, waiting for code
      }

      const { user, accessToken, refreshToken } = result;
      this._setAuthCookies(req, res, { accessToken, refreshToken, deviceId });

      if (isWebBrowser(req)) {
        return ApiResponse.success(res, { user });
      } else {
        return ApiResponse.success(res, { user, accessToken, refreshToken });
      }
    } catch (error) {
      next(error);
    }
  }

  async verify2FALogin(req, res, next) {
    try {
      const { userId, code } = req.body;
      if (!userId || !code) return ApiResponse.error(res, 'Missing 2FA payload', 400);

      const deviceId = this._getOrGenerateDeviceId(req);
      const { user, accessToken, refreshToken } = await AuthService.loginWith2FA(userId, code, deviceId);
      this._setAuthCookies(req, res, { accessToken, refreshToken, deviceId });

      if (isWebBrowser(req)) {
        return ApiResponse.success(res, { user });
      } else {
        return ApiResponse.success(res, { user, accessToken, refreshToken });
      }
    } catch (error) {
      next(error);
    }
  }

  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.cookies;
      if (!refreshToken) {
        return ApiResponse.error(res, 'Refresh token required', 401);
      }

      const deviceId = this._getOrGenerateDeviceId(req);
      const { user, accessToken, refreshToken: newRefreshToken } = await AuthService.refreshTokens(refreshToken, deviceId);
      this._setAuthCookies(req, res, { accessToken, refreshToken: newRefreshToken, deviceId });

      if (isWebBrowser(req)) {
        return ApiResponse.success(res, { user });
      } else {
        return ApiResponse.success(res, { user, accessToken, refreshToken: newRefreshToken });
      }
    } catch (error) {
      if (error.statusCode === 401) {
        // Clear cookies if refresh token is dead
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
      }
      next(error);
    }
  }

  async googleCallback(req, res, next) {
    try {
      const { user, accessToken, refreshToken, deviceId } = req.user;
      this._setAuthCookies(req, res, { accessToken, refreshToken, deviceId });
      // Redirect to frontend upon success
      const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/feed`);
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(req, res, next) {
    try {
      const { userId, code } = req.body;
      const success = await AuthService.verifyEmailCode(userId, code);
      if (success) {
        return ApiResponse.success(res, { message: 'Email verified successfully' });
      } else {
        return ApiResponse.error(res, 'Invalid or expired code', 400);
      }
    } catch (error) {
      next(error);
    }
  }

  async me(req, res, next) {
    try {
      const UserRepository = require('../repositories/UserRepository');
      const user = await UserRepository.findById(req.user.id);
      if (!user) {
        return ApiResponse.error(res, 'User not found', 401);
      }
      return ApiResponse.success(res, { user: AuthService.sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      // Clean up Redis server-side memory if possible
      const { refreshToken, deviceId } = req.cookies;
      const { allDevices } = req.body;

      if (refreshToken) {
        try {
          const jwt = require('jsonwebtoken');
          const redisClient = require('../config/redis');
          const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
          
          if (allDevices) {
            await AuthService.logoutAllDevices(decoded.id);
          } else if (deviceId) {
            await redisClient.del(`refresh_token:${decoded.id}:${deviceId}`);
          } else {
            // fallback if using old keys without deviceId
            await redisClient.del(`refresh_token:${decoded.id}`);
          }
        } catch (err) {
          // Quietly fail if token is already expired/invalid
        }
      }

      res.clearCookie('accessToken'); // Just in case any old ones remain
      res.clearCookie('refreshToken');
      // Intentionally not clearing deviceId so it persists for the next login on this physical device
      return ApiResponse.success(res, { message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      if (!email) return ApiResponse.error(res, 'Email is required', 400);
      const result = await AuthService.forgotPassword(email);
      return ApiResponse.success(res, result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
