const PostService = require('../../src/services/PostService');
const PostRepository = require('../../src/repositories/PostRepository');
const MediaService = require('../../src/services/MediaService');
const UserRepository = require('../../src/repositories/UserRepository');
const { pool, withTransaction } = require('../../src/config/db');

jest.mock('../../src/repositories/PostRepository');
jest.mock('../../src/services/MediaService');
jest.mock('../../src/repositories/UserRepository');
jest.mock('../../src/config/db', () => ({
  pool: { query: jest.fn() },
  withTransaction: jest.fn(cb => cb('mock-tx'))
}));
jest.mock('../../src/utils/auditLogger');
jest.mock('../../src/config/logger');

describe('PostService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPost', () => {
    it('should upload files and create a post', async () => {
      MediaService.uploadMedia.mockResolvedValue('http://cloudinary.com/image.jpg');
      PostRepository.create.mockResolvedValue({ id: 'p1', title: 'Test' });
      UserRepository.findById.mockResolvedValue({ username: 'author' });

      const files = [{ path: '/tmp/1.jpg', mimetype: 'image/jpeg' }];
      const post = await PostService.createPost({ userId: 'u1', type: 'text', title: 'Title', contentText: 'Content', files });

      expect(post.id).toBe('p1');
      expect(MediaService.uploadMedia).toHaveBeenCalled();
      expect(PostRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        mediaUrls: ['http://cloudinary.com/image.jpg']
      }), 'mock-tx');
    });
  });

  describe('deletePost', () => {
    it('should throw error if post not found', async () => {
      PostRepository.findById.mockResolvedValue(null);
      await expect(PostService.deletePost('p1', { id: 'u1' }))
        .rejects.toThrow('Post not found');
    });

    it('should allow author to delete post', async () => {
      PostRepository.findById.mockResolvedValue({ id: 'p1', user_id: 'u1', media_urls: [] });
      await PostService.deletePost('p1', { id: 'u1' });
      expect(PostRepository.delete).toHaveBeenCalledWith('p1');
    });

    it('should allow superadmin to delete any post', async () => {
      PostRepository.findById.mockResolvedValue({ id: 'p1', user_id: 'u1' });
      await PostService.deletePost('p1', { id: 'admin', role: 'superadmin' });
      expect(PostRepository.delete).toHaveBeenCalledWith('p1');
    });

    it('should block non-author non-admin from deleting', async () => {
      PostRepository.findById.mockResolvedValue({ id: 'p1', user_id: 'u1' });
      await expect(PostService.deletePost('p1', { id: 'u2', role: 'user' }))
        .rejects.toThrow('Permission denied to delete this post');
    });

    it('should log media for deletion if post has cloudinary URLs', async () => {
      const url = 'http://cloudinary.com/cloud/image/upload/v123/p_id1.jpg';
      PostRepository.findById.mockResolvedValue({ id: 'p1', user_id: 'u1', media_urls: [url] });
      
      await PostService.deletePost('p1', { id: 'u1' });
      
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO logs.media_deletions'),
        ['p_id1', 'image']
      );
    });
  });

  describe('Pagination & Feed', () => {
    it('should generate nextCursor for feed', async () => {
      const mockPosts = [
        { id: '1', search_score: 100, created_epoch: 1000 },
        { id: '2', search_score: 90, created_epoch: 900 }
      ];
      PostRepository.getFeed.mockResolvedValueOnce(mockPosts);
      UserRepository.findById.mockResolvedValueOnce({ preferences: [] });

      const res = await PostService.getFeed('u1', 1, null);
      expect(res.posts.length).toBe(1);
      expect(res.nextCursor).not.toBeNull();
    });
  });
});
