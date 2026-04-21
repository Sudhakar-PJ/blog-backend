const { query } = require('../config/db');

class InteractionRepository {
  async getCommentsForPost(postId, limit = 50, cursor = null) {
    let sql = `SELECT c.*, u.username as author_username, u.role as author_role, u.profile_pic_url as author_avatar
       FROM comments c 
       JOIN users u ON c.user_id = u.id 
       WHERE c.post_id = $1`;
    const params = [postId];

    if (cursor) {
      sql += ` AND (c.created_at, c.id) > ($2, $3) `;
      params.push(cursor.timestamp, cursor.id);
    }

    sql += ` ORDER BY c.created_at ASC, c.id ASC LIMIT $${params.length + 1}`;
    params.push(limit + 1);

    const res = await query(sql, params);
    return res.rows;
  }

  async getLikesForTarget(targetType, targetId) {
    const res = await query(
      `SELECT i.*, u.username, u.full_name, u.profile_pic_url as avatar
       FROM interactions i
       JOIN users u ON i.user_id = u.id
       WHERE i.target_type = $1 AND i.target_id = $2 AND i.interaction_type = 'like'
       ORDER BY i.id DESC`,
      [targetType, targetId]
    );
    return res.rows;
  }

  async addComment(postId, userId, text, parentId, tx) {
    const res = await (tx ? tx.query.bind(tx) : query)(
      `INSERT INTO comments (post_id, user_id, text, parent_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [postId, userId, text, parentId || null]
    );
    return res.rows[0];
  }

  async getCommentById(id, tx) {
    const res = await (tx ? tx.query.bind(tx) : query)(`SELECT * FROM comments WHERE id = $1`, [id]);
    return res.rows[0];
  }

  async deleteComment(id, tx) {
    await (tx ? tx.query.bind(tx) : query)(`DELETE FROM comments WHERE id = $1`, [id]);
  }

  async upsertLikeDislike(userId, targetType, targetId, interactionType, tx) {
    const q = tx ? tx.query.bind(tx) : query;
    // targetType: 'post' | 'comment'
    // interactionType: 'like' | 'dislike'
    
    // Check if exists
    const existing = await q(
      `SELECT id, interaction_type FROM interactions WHERE user_id = $1 AND target_type = $2 AND target_id = $3`,
      [userId, targetType, targetId]
    );

    if (existing.rowCount > 0) {
      if (existing.rows[0].interaction_type === interactionType) {
        // Toggle off meaning delete
        await q(`DELETE FROM interactions WHERE id = $1`, [existing.rows[0].id]);
        return { action: 'removed' };
      } else {
        // Switch from like to dislike or vice versa
        await q(`UPDATE interactions SET interaction_type = $1 WHERE id = $2`, [interactionType, existing.rows[0].id]);
        return { action: 'updated', interactionType };
      }
    } else {
      await q(
        `INSERT INTO interactions (user_id, target_type, target_id, interaction_type) VALUES ($1, $2, $3, $4)`,
        [userId, targetType, targetId, interactionType]
      );
      return { action: 'added', interactionType };
    }
  }

  async toggleBookmark(userId, postId, tx) {
    const q = tx ? tx.query.bind(tx) : query;
    const existing = await q(`SELECT id FROM bookmarks WHERE user_id = $1 AND post_id = $2`, [userId, postId]);
    if (existing.rowCount > 0) {
      await q(`DELETE FROM bookmarks WHERE id = $1`, [existing.rows[0].id]);
      return { action: 'removed' };
    } else {
      await q(`INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2)`, [userId, postId]);
      return { action: 'added' };
    }
  }

  async recordView(userId, targetType, targetId, tx) {
    await (tx ? tx.query.bind(tx) : query)(
      `INSERT INTO interactions (user_id, target_type, target_id, interaction_type) 
       VALUES ($1, $2, $3, 'view') 
       ON CONFLICT (user_id, target_type, target_id, interaction_type) DO NOTHING`,
      [userId, targetType, targetId]
    );
  }

  async getPostMetrics(postId, tx) {
    const q = tx ? tx.query.bind(tx) : query;
    const res = await q(`
      SELECT 
        (SELECT COUNT(*) FROM interactions WHERE target_type='post' AND target_id=$1 AND interaction_type='like') AS likes_count,
        (SELECT COUNT(*) FROM interactions WHERE target_type='post' AND target_id=$1 AND interaction_type='dislike') AS dislikes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id=$1) AS comments_count
    `, [postId]);
    return res.rows[0];
  }
}

module.exports = new InteractionRepository();
