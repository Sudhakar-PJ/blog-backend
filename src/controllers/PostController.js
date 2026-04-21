const PostService = require('../services/PostService');
const ApiResponse = require('../utils/apiResponse');

class PostController {
  async createPost(req, res, next) {
    try {
      const { type, title, contentText, mediaUrls } = req.body;
      const files = req.files; // multers `.array()` sets req.files
      if (!type || !title) return ApiResponse.error(res, 'Type and title are required', 400);

      const post = await PostService.createPost({
        userId: req.user.id,
        type,
        title,
        contentText,
        files,
        mediaUrls: mediaUrls || []
      });

      return ApiResponse.success(res, { post }, 201);
    } catch (error) {
      next(error);
    }
  }

  async deletePost(req, res, next) {
    try {
      const { postId } = req.params;
      await PostService.deletePost(postId, req.user);
      return ApiResponse.success(res, { message: 'Post deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async getFeed(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const { cursor } = req.query;
      const result = await PostService.getFeed(req.user.id, limit, cursor);
      return ApiResponse.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getMyPosts(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const offset = parseInt(req.query.offset) || 0;
      
      const PostRepository = require('../repositories/PostRepository');
      const posts = await PostRepository.findByUserId(req.user.id, limit, offset);
      return ApiResponse.success(res, { posts });
    } catch (error) {
      next(error);
    }
  }

  async getUserPosts(req, res, next) {
    try {
      const userId = req.params.userId;
      const limit = parseInt(req.query.limit) || 20;
      const offset = parseInt(req.query.offset) || 0;
      
      const PostRepository = require('../repositories/PostRepository');
      const posts = await PostRepository.findByUserId(userId, limit, offset);
      return ApiResponse.success(res, { posts });
    } catch (error) {
      next(error);
    }
  }

  async getLikedPosts(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const { cursor } = req.query;
      const result = await PostService.getLikedPosts(req.user.id, limit, cursor);
      return ApiResponse.success(res, result);
    } catch (error) { next(error); }
  }

  async getBookmarkedPosts(req, res, next) {
    try {
      const { limit = 20, cursor } = req.query;
      const result = await PostService.getBookmarkedPosts(req.user.id, parseInt(limit), cursor);
      return ApiResponse.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async search(req, res, next) {
    try {
      const { q, limit = 20, cursor } = req.query;
      if (!q) return ApiResponse.error(res, 'Search query (q) is required', 400);
      
      const result = await PostService.searchPosts(req.user.id, q, parseInt(limit), cursor);
      return ApiResponse.success(res, result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PostController();
