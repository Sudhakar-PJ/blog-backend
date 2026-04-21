const InteractionService = require('../services/InteractionService');
const ApiResponse = require('../utils/apiResponse');

class InteractionController {
  async getComments(req, res, next) {
    try {
      const { postId } = req.params;
      const { limit = 50, cursor } = req.query;
      const result = await InteractionService.getComments(postId, parseInt(limit), cursor);
      return ApiResponse.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getLikes(req, res, next) {
    try {
      const { targetType, targetId } = req.params;
      const likes = await InteractionService.getLikes(targetType, targetId);
      return ApiResponse.success(res, { likes });
    } catch (error) {
      next(error);
    }
  }

  async addComment(req, res, next) {
    try {
      const { postId } = req.params;
      const { text, parentId } = req.body;
      const userId = req.user.id;

      const comment = await InteractionService.addComment(postId, userId, text, parentId);
      return ApiResponse.success(res, { comment }, 201);
    } catch (error) {
      next(error);
    }
  }

  async deleteComment(req, res, next) {
    try {
      const { commentId } = req.params;
      await InteractionService.deleteComment(commentId, req.user);
      return ApiResponse.success(res, { message: 'Comment deleted' });
    } catch (error) {
      next(error);
    }
  }

  async react(req, res, next) {
    try {
      const { targetType, targetId } = req.params;
      const { type } = req.body; // 'like' or 'dislike'
      const userId = req.user.id;

      const result = await InteractionService.react(userId, targetType, targetId, type);
      return ApiResponse.success(res, { result });
    } catch (error) {
      next(error);
    }
  }

  async bookmark(req, res, next) {
    try {
      const { postId } = req.params;
      const userId = req.user.id;

      const result = await InteractionService.bookmark(userId, postId);
      return ApiResponse.success(res, { result });
    } catch (error) {
      next(error);
    }
  }

  async markViewed(req, res, next) {
    try {
      const { targetType, targetId } = req.params;
      const userId = req.user.id;

      await InteractionService.markAsViewed(userId, targetType, targetId);
      return ApiResponse.success(res, { message: 'View recorded' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InteractionController();
