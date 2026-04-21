const { query } = require('../config/db');

class NotificationRepository {
  async createNotification({ userId, actorId, type, targetId = null }, tx = null) {
    if (userId === actorId) return null; // Don't notify self
    const q = tx ? tx.query.bind(tx) : query;
    
    if (type === 'like_post' || type === 'comment' || type === 'reply') {
      const existing = await q(
        `SELECT id FROM notifications WHERE user_id=$1 AND type=$2 AND target_id=$3`, 
        [userId, type, targetId]
      );
      if (existing.rowCount > 0) {
        const res = await q(
          `UPDATE notifications SET actor_id=$1, is_read=FALSE, created_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,
          [actorId, existing.rows[0].id]
        );
        return res.rows[0];
      }
    }
    
    // Fallback for new notifications or non-aggregated types (like 'follow')
    const res = await q(
      `INSERT INTO notifications (user_id, actor_id, type, target_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, actorId, type, targetId]
    );
    return res.rows[0];
  }

  async createBulkNotifications(userIds, actorId, type, targetId, tx = null) {
    const q = tx ? tx.query.bind(tx) : query;
    // Exclude self from the userIds array
    const filteredUserIds = userIds.filter(id => id !== actorId);
    if (filteredUserIds.length === 0) return [];

    let values = [];
    let params = [];
    let paramIndex = 1;

    for (const userId of filteredUserIds) {
      values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
      params.push(userId, actorId, type, targetId);
      paramIndex += 4;
    }

    const queryStr = `INSERT INTO notifications (user_id, actor_id, type, target_id) VALUES ${values.join(',')} RETURNING *`;
    const res = await q(queryStr, params);
    return res.rows;
  }



  async getNotifications(userId, limit = 20, offset = 0) {
    const res = await query(
      `SELECT n.*, u.username as actor_username, u.full_name as actor_name, u.profile_pic_url as actor_avatar
       FROM notifications n
       JOIN users u ON n.actor_id = u.id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return res.rows;
  }

  async getUnreadCount(userId) {
    const res = await query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );
    return parseInt(res.rows[0].count);
  }

  async markAsRead(userId, notificationId) {
    const res = await query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
      [notificationId, userId]
    );
    return res.rows[0];
  }

  async markAllAsRead(userId) {
    const res = await query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE RETURNING id`,
      [userId]
    );
    return res.rows;
  }
}

module.exports = new NotificationRepository();
