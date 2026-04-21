const { query } = require('../config/db');

class FollowRepository {
  async follow(followerId, followingId, tx = null) {
    const q = tx ? tx.query.bind(tx) : query;
    const res = await q(
      `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`,
      [followerId, followingId]
    );
    return res.rows[0];
  }

  async unfollow(followerId, followingId, tx = null) {
    const q = tx ? tx.query.bind(tx) : query;
    const res = await q(
      `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING *`,
      [followerId, followingId]
    );
    return res.rows[0];
  }

  async isFollowing(followerId, followingId, tx = null) {
    const q = tx ? tx.query.bind(tx) : query;
    const res = await q(
      `SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [followerId, followingId]
    );
    return res.rowCount > 0;
  }

  async getFollowers(userId, tx = null) {
    const q = tx ? tx.query.bind(tx) : query;
    const res = await q(
      `SELECT u.id, u.username, u.full_name, u.profile_pic_url, f.created_at
       FROM follows f
       JOIN users u ON f.follower_id = u.id
       WHERE f.following_id = $1
       ORDER BY f.created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  async getFollowing(userId) {
    const res = await query(
      `SELECT u.id, u.username, u.full_name, u.profile_pic_url, f.created_at
       FROM follows f
       JOIN users u ON f.following_id = u.id
       WHERE f.follower_id = $1
       ORDER BY f.created_at DESC`,
      [userId]
    );
    return res.rows;
  }
}

module.exports = new FollowRepository();
