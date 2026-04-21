const UserService = require('../services/UserService');
const PostService = require('../services/PostService');
const { query } = require('../config/db');
const ApiResponse = require('../utils/apiResponse');

class AdminController {
  async getAllUsers(req, res, next) {
    try {
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const q = req.query.q || '';
      
      const data = await UserService.getAllUsers(page, limit, q);
      return ApiResponse.success(res, { 
        users: data.users, 
        total: data.total, 
        totalPages: Math.ceil(data.total / limit),
        currentPage: page
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllPosts(req, res, next) {
    try {
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const q = req.query.q || '';

      const data = await PostService.getAdminPosts(req.user.id, page, limit, q);
      return ApiResponse.success(res, { 
        posts: data.posts,
        total: data.total,
        totalPages: Math.ceil(data.total / limit),
        currentPage: page
      });
    } catch (error) {
      next(error);
    }
  }

  async getSystemLogs(req, res, next) {
    try {
      // Fetch warn and critical logs from Postgres (Redis logs are purely ephemeral and hidden from UI)
      const result = await query(`
        SELECT 
          id, 
          level, 
          message, 
          meta->>'requestId' as request_id,
          meta, 
          created_at
        FROM logs.app_logs
        ORDER BY created_at DESC
        LIMIT 100
      `);
      return ApiResponse.success(res, { logs: result.rows });
    } catch (error) {
      const { logger } = require('../config/logger');
      logger.error('Admin Panel: Failed to fetch app logs', { error: error.message });
      return ApiResponse.error(res, 'Failed to access system logs from Postgres.', 500);
    }
  }

  async getServerErrors(req, res, next) {
    try {
      const result = await query(`
        SELECT 
          id, 
          message, 
          stack_trace, 
          meta->>'requestId' as request_id,
          meta, 
          created_at 
        FROM logs.server_errors 
        ORDER BY created_at DESC 
        LIMIT 100
      `);
      return ApiResponse.success(res, { errors: result.rows });
    } catch (error) {
      const { logger } = require('../config/logger');
      logger.error('Admin Panel: Failed to fetch server errors', { error: error.message });
      return ApiResponse.error(res, 'Failed to access server errors schema.', 500);
    }
  }

  async getHotLogs(req, res, next) {
    try {
      const redisClient = require('../config/redis');
      const today = new Date().toISOString().split('T')[0];
      const keyName = `logs:info:${today}`;
      
      const rawLogs = await redisClient.lrange(keyName, -100, -1);
      const logs = rawLogs.reverse().map(l => JSON.parse(l));
      
      return ApiResponse.success(res, { logs });
    } catch (error) {
      next(error);
    }
  }

  async searchLogsByRequestId(req, res, next) {
    try {
      const { requestId } = req.query;
      if (!requestId) return ApiResponse.error(res, 'requestId is required', 400);

      const redisClient = require('../config/redis');
      const today = new Date().toISOString().split('T')[0];
      
      // 1. Search DB (Persistent)
      const dbLogsPromise = query(`
        SELECT 'persistent' as tier, level, message, meta, created_at FROM logs.app_logs WHERE meta->>'requestId' = $1
        UNION ALL
        SELECT 'error' as tier, 'error' as level, message, meta, created_at FROM logs.server_errors WHERE meta->>'requestId' = $1
      `, [requestId]);

      // 2. Search Redis (Ephemeral - current day only for simple fetch)
      const redisLogsPromise = redisClient.lrange(`logs:info:${today}`, 0, -1);

      const [dbRes, redisRaw] = await Promise.all([dbLogsPromise, redisLogsPromise]);
      
      const redisLogs = redisRaw
        .map(l => JSON.parse(l))
        .filter(l => l.requestId === requestId)
        .map(l => ({ ...l, tier: 'hot' }));

      const allLogs = [...dbRes.rows, ...redisLogs].sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp));

      return ApiResponse.success(res, { logs: allLogs });
    } catch (error) {
      next(error);
    }
  }

  async promoteToAdmin(req, res, next) {
    try {
      const { id } = req.params;
      const updated = await UserService.promoteToAdmin(id, req.user);
      return ApiResponse.success(res, { message: 'User promoted to admin', user: updated });
    } catch (error) {
      next(error);
    }
  }

  async suspendUser(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      if (!reason) return ApiResponse.error(res, 'Suspension reason is required', 400);
      
      await UserService.toggleSuspension(id, req.user, 'suspend', reason);
      return ApiResponse.success(res, { message: 'User account has been suspended.' });
    } catch (error) {
      next(error);
    }
  }

  async unsuspendUser(req, res, next) {
    try {
      const { id } = req.params;
      await UserService.toggleSuspension(id, req.user, 'unsuspend');
      return ApiResponse.success(res, { message: 'User account has been unsuspended.' });
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body || { reason: 'Administrative forced deletion' };
      await UserService.deleteAccount(id, req.user, reason);
      return ApiResponse.success(res, { message: 'User account deleted permanently.' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminController();
