const NotificationRepository = require('../repositories/NotificationRepository');
const { getIO } = require('../config/websocket');

class NotificationService {
  async createNotification(data, tx = null) {
    const notification = await NotificationRepository.createNotification(data, tx);
    if (notification) {
      getIO().to(`user:${data.userId}`).emit('new_notification', notification);
    }
    return notification;
  }

  async createBulkNotifications(userIds, actorId, type, targetId, tx = null) {
    const notifications = await NotificationRepository.createBulkNotifications(userIds, actorId, type, targetId, tx);
    if (notifications.length > 0) {
      const io = getIO();
      notifications.forEach(n => {
        io.to(`user:${n.user_id}`).emit('new_notification', n);
      });
    }
    return notifications;
  }

  async getNotifications(userId, limit, offset) {
    return await NotificationRepository.getNotifications(userId, limit, offset);
  }

  async getUnreadCount(userId) {
    return await NotificationRepository.getUnreadCount(userId);
  }

  async markAsRead(userId, notificationId) {
    return await NotificationRepository.markAsRead(userId, notificationId);
  }

  async markAllAsRead(userId) {
    return await NotificationRepository.markAllAsRead(userId);
  }
}

module.exports = new NotificationService();
