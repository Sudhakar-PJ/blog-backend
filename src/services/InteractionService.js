const { withTransaction } = require('../config/db');
const InteractionRepository = require('../repositories/InteractionRepository');
const PostRepository = require('../repositories/PostRepository');
const NotificationService = require('./NotificationService');
const { getIO } = require('../config/websocket');
const { encodeCursor, decodeCursor } = require('../utils/pagination');
const { addNotificationJob } = require('../queues/notificationQueue');
const ApiError = require('../utils/ApiError');

class InteractionService {
  async getComments(postId, limit = 50, cursorStr = null) {
    const decoded = decodeCursor(cursorStr);
    const rows = await InteractionRepository.getCommentsForPost(postId, limit, decoded);
    
    let nextCursor = null;
    let comments = rows;
    if (rows.length > limit) {
      comments = rows.slice(0, limit);
      const last = comments[comments.length - 1];
      nextCursor = encodeCursor(last.created_at, last.id);
    }
    return { comments, nextCursor };
  }

  async getLikes(targetType, targetId) {
    return await InteractionRepository.getLikesForTarget(targetType, targetId);
  }

  async addComment(postId, userId, text, parentId = null) {
    if (!text) {
      throw new ApiError(400, 'Comment text required');
    }
    
    return await withTransaction(async (tx) => {
      const post = await PostRepository.findById(postId, tx);
      if (!post) throw new ApiError(404, 'Post not found');

      if (post.user_id === userId && !parentId) {
        throw new ApiError(403, 'You cannot leave a top-level parent comment on your own post.');
      }

      const comment = await InteractionRepository.addComment(postId, userId, text, parentId, tx);

      if (parentId) {
        // Notify parent comment author
        const parentComment = await InteractionRepository.getCommentById(parentId, tx);
        if (parentComment && parentComment.user_id !== userId) {
          if (process.env.NODE_ENV !== 'test') {
            addNotificationJob('SINGLE', {
              userId: parentComment.user_id,
              actorId: userId,
              type: 'reply',
              targetId: postId
            });
          }
        }
      } else {
        // Notify post author
        if (post.user_id !== userId) {
          if (process.env.NODE_ENV !== 'test') {
            addNotificationJob('SINGLE', {
              userId: post.user_id,
              actorId: userId,
              type: 'comment',
              targetId: post.id,
              targetType: 'post',
              message: `commented on your post: ${post.title.substring(0, 20)}...`
            });
          }
        }
      }

      const metrics = await InteractionRepository.getPostMetrics(postId, tx);
      getIO().emit('post_metrics_sync', { postId, ...metrics });

      return comment;
    });
  }

  async deleteComment(commentId, requester) {
    const comment = await InteractionRepository.getCommentById(commentId);
    if (!comment) {
      throw new ApiError(404, 'Comment not found');
    }

    let canDelete = false;
    if (comment.user_id === requester.id) {
      canDelete = true;
    } else if (requester.role === 'superadmin' || requester.role === 'admin') {
      canDelete = true;
    }

    if (!canDelete) {
      throw new ApiError(403, 'Permission denied to delete this comment');
    }

    await InteractionRepository.deleteComment(commentId);

    const metrics = await InteractionRepository.getPostMetrics(comment.post_id);
    getIO().emit('post_metrics_sync', { postId: comment.post_id, ...metrics });
  }

  async react(userId, targetType, targetId, type) {
    if (!['post', 'comment'].includes(targetType) || !['like', 'dislike'].includes(type)) {
      throw new ApiError(400, 'Invalid target type or interaction type');
    }

    return await withTransaction(async (tx) => {
      let cachedPost = null;

      if (targetType === 'post') {
        cachedPost = await PostRepository.findById(targetId, tx);
        if (cachedPost && cachedPost.user_id === userId) {
          throw new ApiError(403, 'You cannot like or dislike your own post.');
        }
      }

      const result = await InteractionRepository.upsertLikeDislike(userId, targetType, targetId, type, tx);

      if (result.action === 'added' && type === 'like') {
        let notifyUserId = null;
        let notifyPostId = targetId;

        if (targetType === 'post') {
          if (cachedPost) notifyUserId = cachedPost.user_id;
        } else if (targetType === 'comment') {
          const comment = await InteractionRepository.getCommentById(targetId, tx);
          if (comment) {
            notifyUserId = comment.user_id;
            notifyPostId = comment.post_id;
          }
        }

        if (notifyUserId && notifyUserId !== userId) {
          if (process.env.NODE_ENV !== 'test') {
            addNotificationJob('SINGLE', {
              userId: notifyUserId,
              actorId: userId,
              type: 'like_post',
              targetId: notifyPostId
            });
          }
        }
      }

      if (targetType === 'post') {
        const metrics = await InteractionRepository.getPostMetrics(targetId, tx);
        getIO().emit('post_metrics_sync', { postId: targetId, ...metrics });
      } else if (targetType === 'comment') {
        const comment = await InteractionRepository.getCommentById(targetId, tx);
        if (comment) {
          const metrics = await InteractionRepository.getPostMetrics(comment.post_id, tx);
          getIO().emit('post_metrics_sync', { postId: comment.post_id, ...metrics });
        }
      }

      return result;
    });
  }

  async bookmark(userId, postId) {
    return await withTransaction(async (tx) => {
      const post = await PostRepository.findById(postId, tx);
      if (post && post.user_id === userId) {
        throw new ApiError(403, 'You cannot bookmark your own post.');
      }
      return await InteractionRepository.toggleBookmark(userId, postId, tx);
    });
  }

  async markAsViewed(userId, targetType, targetId) {
    if (!['post', 'comment'].includes(targetType)) {
      throw new ApiError(400, 'Invalid target type');
    }
    // We don't need to notify anyone for a view
    return await InteractionRepository.recordView(userId, targetType, targetId);
  }
}

module.exports = new InteractionService();
