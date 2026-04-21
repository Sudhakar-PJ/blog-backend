const NotificationService = require('../services/NotificationService');
const ApiResponse = require('../utils/apiResponse');

class NotificationController {
  async getNotifications(req, res, next) {
    try {
      const { limit = 20, offset = 0 } = req.query;
      const notifications = await NotificationService.getNotifications(req.user.id, parseInt(limit), parseInt(offset));
      return ApiResponse.success(res, { notifications });
    } catch (error) {
      next(error);
    }
  }

  async getUnreadCount(req, res, next) {
    try {
      const count = await NotificationService.getUnreadCount(req.user.id);
      return ApiResponse.success(res, { count });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req, res, next) {
    try {
      const { id } = req.params;
      const notification = await NotificationService.markAsRead(req.user.id, id);
      return ApiResponse.success(res, { message: 'Marked as read', notification });
    } catch (error) {
      next(error);
    }
  }

  async markAllAsRead(req, res, next) {
    try {
      await NotificationService.markAllAsRead(req.user.id);
      return ApiResponse.success(res, { message: 'All marked as read' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NotificationController();
