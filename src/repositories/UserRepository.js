const { query } = require('../config/db');

class UserRepository {
  async create({ email, username, passwordHash, googleId = null, isEmailVerified = false, fullName = null }) {
    const defaultPreferences = JSON.stringify([]);
    const res = await query(
      `INSERT INTO users (email, username, password_hash, google_id, preferences, is_email_verified, full_name) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [email, username, passwordHash, googleId, defaultPreferences, isEmailVerified, fullName]
    );
    return res.rows[0];
  }

  async findByUsername(username) {
    const res = await query(`SELECT * FROM users WHERE username = $1`, [username]);
    return res.rows[0];
  }

  async findByEmail(email) {
    const res = await query(`SELECT * FROM users WHERE email = $1`, [email]);
    return res.rows[0];
  }

  async findById(id) {
    const res = await query(`SELECT * FROM users WHERE id = $1`, [id]);
    return res.rows[0];
  }

  async findByGoogleId(googleId) {
    const res = await query(`SELECT * FROM users WHERE google_id = $1`, [googleId]);
    return res.rows[0];
  }

  async updateVerification(userId, field) {
    const validFields = ['is_email_verified', 'is_phone_verified'];
    if (!validFields.includes(field)) throw new Error('Invalid field');
    
    // When verifying email, automatically unset is_deactivated natively representing reactivation
    let queryStr = `UPDATE users SET ${field} = TRUE WHERE id = $1 RETURNING *`;
    if (field === 'is_email_verified') {
      queryStr = `UPDATE users SET ${field} = TRUE, is_deactivated = FALSE WHERE id = $1 RETURNING *`;
    }

    const res = await query(queryStr, [userId]);
    return res.rows[0];
  }

  async updatePreferences(userId, preferencesArray) {
    const res = await query(`UPDATE users SET preferences = $1 WHERE id = $2 RETURNING *`, [JSON.stringify(preferencesArray), userId]);
    return res.rows[0];
  }

  async updateUserPhoneAndVerify(userId, phoneNumber) {
    const res = await query(
      `UPDATE users SET phone_number = $1, is_phone_verified = TRUE WHERE id = $2 RETURNING *`,
      [phoneNumber, userId]
    );
    return res.rows[0];
  }

  async updateRole(userId, newRole) {
    const res = await query(`UPDATE users SET role = $1 WHERE id = $2 RETURNING *`, [newRole, userId]);
    return res.rows[0];
  }

  async updateProfile(userId, { fullName, bio, profilePicUrl, preferences }) {
    const res = await query(
      `UPDATE users 
       SET full_name = $1, bio = $2, profile_pic_url = $3, preferences = $4 
       WHERE id = $5 RETURNING *`,
      [fullName, bio, profilePicUrl, JSON.stringify(preferences || []), userId]
    );
    return res.rows[0];
  }

  async updateSuspension(userId, isSuspended, reason = null) {
    const res = await query(
      `UPDATE users SET is_suspended = $1, suspension_reason = $2 WHERE id = $3 RETURNING *`,
      [isSuspended, reason, userId]
    );
    return res.rows[0];
  }

  async setDeactivated(userId) {
    const res = await query(
      `UPDATE users SET is_deactivated = TRUE, is_email_verified = FALSE WHERE id = $1 RETURNING *`,
      [userId]
    );
    return res.rows[0];
  }

  async getAllUsers(page = 1, limit = 20, q = '') {
    const offset = (page - 1) * limit;
    let sql = `
      SELECT id, email, username, role, full_name, is_email_verified, two_step_enabled, is_suspended, suspension_reason, is_deactivated, created_at 
      FROM users 
    `;
    let countSql = `SELECT COUNT(*) FROM users`;
    const params = [];
    
    if (q.trim() !== '') {
      sql += ` WHERE username ILIKE $1 OR email ILIKE $1 OR full_name ILIKE $1 `;
      countSql += ` WHERE username ILIKE $1 OR email ILIKE $1 OR full_name ILIKE $1`;
      params.push(`%${q.trim()}%`);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    
    const [res, countRes] = await Promise.all([
      query(sql, [...params, limit, offset]),
      query(countSql, params)
    ]);
    
    return {
      users: res.rows,
      total: parseInt(countRes.rows[0].count)
    };
  }

  async searchBloggers(currentUserId, q = '', limit = 10, page = 1) {
    const offset = (page - 1) * limit;
    const searchQuery = `%${q.trim()}%`;
    
    const sql = `
      WITH RECURSIVE social_graph AS (
        -- Non-recursive term: Direct follows
        SELECT following_id as user_id, 1 as depth, follower_id as source_id 
        FROM follows 
        WHERE follower_id = $1 OR following_id = $1
        
        UNION ALL
        
        -- Recursive term: Follows of follows
        SELECT f.following_id, sg.depth + 1, f.follower_id
        FROM social_graph sg
        JOIN follows f ON sg.user_id = f.follower_id
        WHERE sg.depth < 4 AND f.following_id != $1
      ),
      distinct_graph AS (
        SELECT user_id, MIN(depth) as min_depth
        FROM social_graph
        WHERE user_id != $1
        GROUP BY user_id
      ),
      mutual_context AS (
        -- Find one person I follow who also follows the target (for the "Followed by..." snippet)
        SELECT sg.user_id as target_user_id, u.username as mutual_username, COUNT(*) OVER(PARTITION BY sg.user_id) as total_mutuals
        FROM social_graph sg
        JOIN follows my_follows ON my_follows.follower_id = $1 AND my_follows.following_id = sg.source_id
        JOIN users u ON u.id = sg.source_id
        WHERE sg.depth = 2
      ),
      follower_counts AS (
        SELECT following_id as user_id, COUNT(*) as count
        FROM follows
        GROUP BY following_id
      )
      SELECT 
        u.id, u.username, u.full_name, u.profile_pic_url,
        COALESCE(dg.min_depth, 99) as social_tier,
        COALESCE(fc.count, 0) as total_followers,
        mc.mutual_username,
        mc.total_mutuals
      FROM users u
      LEFT JOIN distinct_graph dg ON u.id = dg.user_id
      LEFT JOIN (
        SELECT DISTINCT ON (target_user_id) * FROM mutual_context
      ) mc ON u.id = mc.target_user_id
      LEFT JOIN follower_counts fc ON u.id = fc.user_id
      WHERE (u.username ILIKE $2 OR u.full_name ILIKE $2) AND u.id != $1
      ORDER BY social_tier ASC, total_followers DESC, u.username ASC
      LIMIT $3 OFFSET $4
    `;

    const res = await query(sql, [currentUserId, searchQuery, limit, offset]);
    return res.rows;
  }

  async updatePassword(userId, passwordHash) {
    const res = await query(`UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING *`, [passwordHash, userId]);
    return res.rows[0];
  }

  async incrementFailedAttempts(userId) {
    const res = await query(
      `UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = $1 RETURNING failed_attempts`,
      [userId]
    );
    const attempts = res.rows[0].failed_attempts;
    if (attempts >= 5) {
      const lockoutTime = new Date(Date.now() + 15 * 60000);
      await query(
        `UPDATE users SET lockout_until = $1 WHERE id = $2`,
        [lockoutTime, userId]
      );
      const { logger } = require('../config/logger');
      // Fetch email or username for better log
      const resUser = await query(`SELECT email, username FROM users WHERE id = $1`, [userId]);
      const user = resUser.rows[0];
      logger.critical(`ACCOUNT_LOCKOUT: User '${user ? (user.username || user.email) : userId}' was locked for 15 minutes after 5 failed attempts`, {
        action: 'lockout',
        userId,
        attempts
      });
    }
    return attempts;
  }

  async resetFailedAttempts(userId) {
    await query(
      `UPDATE users SET failed_attempts = 0, lockout_until = NULL WHERE id = $1`,
      [userId]
    );
  }
}

module.exports = new UserRepository();
