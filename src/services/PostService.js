const { withTransaction } = require('../config/db');
const PostRepository = require('../repositories/PostRepository');
const MediaService = require('./MediaService');
const { aiService: AIService } = require('../services/AIService');
const UserRepository = require('../repositories/UserRepository');
const { pool } = require('../config/db');
const { encodeCursor, decodeCursor } = require('../utils/pagination');
const auditLogger = require('../utils/auditLogger');
const { addPostProcessJob } = require('../queues/postProcessQueue');
const { addNotificationJob } = require('../queues/notificationQueue');
const ApiError = require('../utils/ApiError');

const extractPublicId = (url) => {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
  if (match && match[1]) {
    const resource_type = url.match(/\.(mp4|webm|ogg)$/i) ? 'video' : 'image';
    return { public_id: match[1], resource_type };
  }
  return null;
};

class PostService {
  async createPost({ userId, type, title, contentText, files, mediaUrls = [] }) {
    let finalMediaUrls = [...mediaUrls];
    
    if (files && files.length > 0) {
      const uploadedUrls = await Promise.all(files.map(async (f) => {
        const fileType = f.mimetype.startsWith('video') ? 'video' : 'image';
        return await MediaService.uploadMedia(f.path, fileType);
      }));
      finalMediaUrls = [...finalMediaUrls, ...uploadedUrls];
    }

    const initialCategory = 'Tech'; 

    const post = await withTransaction(async (tx) => {
      const p = await PostRepository.create({
        userId,
        type,
        title,
        contentText,
        mediaUrls: finalMediaUrls, 
        categoryName: initialCategory
      }, tx);

      const author = await UserRepository.findById(userId);
      auditLogger.system('POST_CREATED', { 
        postId: p.id, 
        userId,
        authorUsername: author ? author.username : userId,
        type
      });

      return p;
    });

    if (process.env.NODE_ENV !== 'test') {
      addPostProcessJob('AI_CATEGORIZATION', { postId: post.id, title, contentText, postType: type });
      addPostProcessJob('CACHE_INVALIDATION', { authorId: userId });
      addNotificationJob('BULK_NEW_POST', { authorId: userId, postId: post.id });
    }

    return post;
  }

  async deletePost(postId, requester) {
    const post = await PostRepository.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    let canDelete = false;
    if (post.user_id === requester.id) {
      canDelete = true;
    } else if (requester.role === 'superadmin') {
      canDelete = true;
    } else if (requester.role === 'admin') {
      const postAuthor = await UserRepository.findById(post.user_id);
      if (postAuthor && postAuthor.role === 'user') {
        canDelete = true;
      }
    }

    if (!canDelete) {
      throw new ApiError(403, 'Permission denied to delete this post');
    }

    const assetsToDelete = [];
    if (post.media_url) {
      const parsed = extractPublicId(post.media_url);
      if (parsed) assetsToDelete.push(parsed);
    }
    if (post.media_urls) {
      let urls = [];
      try {
        urls = typeof post.media_urls === 'string' ? JSON.parse(post.media_urls) : post.media_urls;
      } catch(e) {}
      
      if (Array.isArray(urls)) {
        urls.forEach(u => {
          const parsed = extractPublicId(u);
          if (parsed) assetsToDelete.push(parsed);
        });
      }
    }

    if (assetsToDelete.length > 0) {
      for (const asset of assetsToDelete) {
        await pool.query(
          `INSERT INTO logs.media_deletions (public_id, resource_type) VALUES ($1, $2)`, 
          [asset.public_id, asset.resource_type]
        );
      }
    }

    await PostRepository.delete(postId);

    const { logger } = require('../config/logger');
    const postAuthor = await UserRepository.findById(post.user_id);
    const authorUsername = postAuthor ? postAuthor.username : post.user_id;
    if (requester.id !== post.user_id && (requester.role === 'admin' || requester.role === 'superadmin')) {
      const AdminUser = await UserRepository.findById(requester.id);
      auditLogger.security('ADMIN_POST_DELETE', { 
        postId, 
        authorId: post.user_id, 
        authorUsername,
        adminId: requester.id,
        adminUsername: AdminUser ? AdminUser.username : requester.id
      });
    } else {
      logger.info(`Post ${postId} deleted by author '${authorUsername}'`, { action: 'deletePost', postId, authorId: post.user_id });
    }
  }

  async getFeed(userId, limit, cursorStr) {
    const redisClient = require('../config/redis');
    const cacheKey = `feed:${userId}:${limit}:${cursorStr || 'start'}`;
    
    try {
      if (process.env.NODE_ENV !== 'test') {
        const cached = await redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached);
      }
    } catch (err) {}

    const decodedCursor = decodeCursor(cursorStr);
    const user = await UserRepository.findById(userId);
    const preferences = user && user.preferences ? (typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences) : [];
    
    const rows = await PostRepository.getFeed(userId, preferences, limit, decodedCursor);
    
    let nextCursor = null;
    let posts = rows;
    
    if (rows.length > limit) {
      posts = rows.slice(0, limit);
      const lastPost = posts[posts.length - 1];
      nextCursor = encodeCursor(lastPost.created_epoch, lastPost.id, { score: lastPost.search_score });
    }

    const result = { posts, nextCursor };

    try {
      if (process.env.NODE_ENV !== 'test') {
        await redisClient.setex(cacheKey, 60, JSON.stringify(result));
      }
    } catch (err) {}

    return result;
  }

  async getAdminPosts(userId, page, limit, q) {
    return await PostRepository.getAdminPosts(userId, page, limit, q);
  }

  async getLikedPosts(userId, limit, cursorStr) {
    const decoded = decodeCursor(cursorStr);
    const rows = await PostRepository.getLikedPosts(userId, limit, decoded);
    
    let nextCursor = null;
    let posts = rows;
    if (rows.length > limit) {
      posts = rows.slice(0, limit);
      const last = posts[posts.length - 1];
      nextCursor = encodeCursor(last.created_epoch, last.id);
    }
    return { posts, nextCursor };
  }

  async getBookmarkedPosts(userId, limit, cursorStr) {
    const decoded = decodeCursor(cursorStr);
    const rows = await PostRepository.getBookmarkedPosts(userId, limit, decoded);
    
    let nextCursor = null;
    let posts = rows;
    if (rows.length > limit) {
      posts = rows.slice(0, limit);
      const last = posts[posts.length - 1];
      nextCursor = encodeCursor(last.created_epoch, last.id);
    }
    return { posts, nextCursor };
  }

  async searchPosts(userId, searchQuery, limit, cursorStr) {
    const decoded = decodeCursor(cursorStr);
    const rows = await PostRepository.searchPosts(userId, searchQuery, limit, decoded);
    
    let nextCursor = null;
    let posts = rows;
    if (rows.length > limit) {
      posts = rows.slice(0, limit);
      const last = posts[posts.length - 1];
      nextCursor = encodeCursor(last.created_epoch, last.id, { rank: last.rank });
    }
    return { posts, nextCursor };
  }
}

module.exports = new PostService();
