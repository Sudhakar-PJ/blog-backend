const { Pool } = require('pg');
const types = require('pg').types;
require('dotenv').config();

// Force TIMESTAMPTZ (1184) and TIMESTAMP (1114) to return as strings
// This preserves microsecond precision required for stable cursor-based pagination
types.setTypeParser(1184, (val) => val);
types.setTypeParser(1114, (val) => val);

const poolConfig = {
  connectionString: process.env.DB_URL,
};

// Only enforce SSL if explicitly targeting a cloud remote DB (like Neon) or running in Production
if (
  process.env.NODE_ENV === 'production' || 
  process.env.DB_URL.includes('neon.tech') ||
  process.env.DB_URL.includes('sslmode=require')
) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);


pool.on('error', (err, client) => {
  // Silent - logged to PG/Redis via Winston
  if (process.env.NODE_ENV !== 'test') {
    process.exit(-1);
  }
});

const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('🐘 PostgreSQL Connected');
    client.release();
  } catch (err) {
    throw err;
  }
};

const initSchema = async () => {
  const client = await pool.connect();
  try {
    // Enable UUID extension
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // --- SCHEMA INITIALIZATION ---
    // Create schemas

    // Create schemas
    await client.query(`CREATE SCHEMA IF NOT EXISTS logs;`);
    
    // Create App Logs Table (HTTP logs, error logs)
    await client.query(`
      CREATE TABLE IF NOT EXISTS logs.app_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        level VARCHAR(50),
        message TEXT,
        meta JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Critical Error Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS logs.server_errors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message TEXT,
        stack_trace TEXT,
        meta JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Media Deletions Ledger for Cloudinary Housekeeping
    await client.query(`
      CREATE TABLE IF NOT EXISTS logs.media_deletions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        public_id VARCHAR(255) NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Main Tables
    await client.query(`
      CREATE TYPE user_role AS ENUM ('user', 'admin', 'superadmin');
    `).catch(() => {}); // catch error if enum exists

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE,
        password_hash TEXT,
        google_id VARCHAR(255) UNIQUE,
        role user_role DEFAULT 'user',
        preferences JSONB DEFAULT '[]',
        full_name VARCHAR(255),
        bio TEXT,
        profile_pic_url TEXT,
        phone_number VARCHAR(50),
        is_email_verified BOOLEAN DEFAULT FALSE,
        is_phone_verified BOOLEAN DEFAULT FALSE,
        two_step_enabled BOOLEAN DEFAULT FALSE,
        is_suspended BOOLEAN DEFAULT FALSE,
        is_deactivated BOOLEAN DEFAULT FALSE,
        suspension_reason TEXT,
        failed_attempts INTEGER DEFAULT 0,
        lockout_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL, -- 'text', 'image', 'video'
        title VARCHAR(255) NOT NULL,
        content_text TEXT,
        media_url TEXT,
        media_urls JSONB DEFAULT '[]', -- newly added for multi-file gallery arrays
        category_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        target_type VARCHAR(50) NOT NULL, -- 'post', 'comment'
        target_id UUID NOT NULL,
        interaction_type VARCHAR(50) NOT NULL, -- 'like', 'dislike', 'view'
        UNIQUE(user_id, target_type, target_id, interaction_type)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, post_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS follows (
        follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
        following_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (follower_id, following_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        actor_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL, -- 'follow', 'like_post', 'comment', 'reply', 'new_post'
        target_id UUID, -- Can be post_id, comment_id, etc. depending on type
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Performance Indexes (B-Tree)
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_posts_category_date ON posts(category_name, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_posts_user_date ON posts(user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_comments_post_date ON comments(post_id, created_at ASC);`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_date ON notifications(user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_interactions_target ON interactions(target_type, target_id);`,
      `CREATE INDEX IF NOT EXISTS idx_bookmarks_user_post ON bookmarks(user_id, post_id);`,
      `CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);`,
      `CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);`,
      // Full-Text Search GIN Index
      `CREATE INDEX IF NOT EXISTS idx_posts_search ON posts USING GIN (to_tsvector('english', title || ' ' || COALESCE(content_text, '')));`
    ];

    for (let q of indexQueries) {
      await client.query(q).catch(() => {});
    }

    // --- POLYMORPHIC CLEANUP TRIGGERS ---
    // Handle cleanup for tables without hard Foreign Keys (interactions, notifications) 
    
    await client.query(`
      CREATE OR REPLACE FUNCTION public.cleanup_deleted_target_data()
      RETURNS trigger AS $$
      BEGIN
          DELETE FROM interactions WHERE target_id = OLD.id;
          DELETE FROM notifications WHERE target_id = OLD.id;
          RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trigger_cleanup_post_data ON posts;
      CREATE TRIGGER trigger_cleanup_post_data
      AFTER DELETE ON posts
      FOR EACH ROW EXECUTE FUNCTION cleanup_deleted_target_data();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trigger_cleanup_comment_data ON comments;
      CREATE TRIGGER trigger_cleanup_comment_data
      AFTER DELETE ON comments
      FOR EACH ROW EXECUTE FUNCTION cleanup_deleted_target_data();
    `);

    // Schema ready
    console.log('🛠️  Database Schema Initialized (UUID Migration Complete & Triggers Active)');
  } catch (err) {
    throw err;
  } finally {
    client.release();
  }
};

const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    // Log rollback manually to the server_errors table for high visibility
    await pool.query(
      `INSERT INTO logs.server_errors (message, stack_trace, meta) VALUES ($1, $2, $3)`,
      [`Transaction Rollback: ${e.message}`, e.stack, { timestamp: new Date().toISOString() }]
    ).catch(() => {});
    throw e;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  withTransaction,
  connectDB,
  initSchema
};
