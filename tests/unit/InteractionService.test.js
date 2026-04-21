const InteractionService = require('../../src/services/InteractionService');
const InteractionRepository = require('../../src/repositories/InteractionRepository');
const PostRepository = require('../../src/repositories/PostRepository');
const { withTransaction } = require('../../src/config/db');

jest.mock('../../src/repositories/InteractionRepository');
jest.mock('../../src/repositories/PostRepository');
jest.mock('../../src/config/db', () => ({
  withTransaction: jest.fn(callback => callback('mock-tx'))
}));
jest.mock('../../src/config/websocket', () => ({
  getIO: jest.fn(() => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() }))
  }))
}));

describe('InteractionService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addComment', () => {
    it('should throw error if text is missing', async () => {
      await expect(InteractionService.addComment('post1', 'user1', ''))
        .rejects.toThrow('Comment text required');
    });

    it('should throw error if post is not found', async () => {
      PostRepository.findById.mockResolvedValueOnce(null);
      await expect(InteractionService.addComment('post1', 'user1', 'Nice post'))
        .rejects.toThrow('Post not found');
    });

    it('should block authors from top-level commenting on their own posts', async () => {
      PostRepository.findById.mockResolvedValueOnce({ user_id: 'user1', id: 'post1' });
      await expect(InteractionService.addComment('post1', 'user1', 'I am commenting on myself'))
        .rejects.toThrow('You cannot leave a top-level parent comment on your own post.');
    });

    it('should successfully add a comment and sync metrics', async () => {
      PostRepository.findById.mockResolvedValueOnce({ user_id: 'author1', id: 'post1', title: 'Test Title' });
      InteractionRepository.addComment.mockResolvedValueOnce({ id: 'comment1', text: 'Great!' });
      InteractionRepository.getPostMetrics.mockResolvedValueOnce({ likes: 5, comments: 1 });

      const comment = await InteractionService.addComment('post1', 'user1', 'Great!');
      expect(comment.id).toBe('comment1');
      expect(InteractionRepository.getPostMetrics).toHaveBeenCalledWith('post1', 'mock-tx');
    });
  });

  describe('react', () => {
    it('should throw error for invalid types', async () => {
      await expect(InteractionService.react('user1', 'invalid', 'target1', 'like'))
        .rejects.toThrow('Invalid target type or interaction type');
    });

    it('should block users from liking their own post', async () => {
      PostRepository.findById.mockResolvedValueOnce({ user_id: 'user1' });
      await expect(InteractionService.react('user1', 'post', 'post1', 'like'))
        .rejects.toThrow('You cannot like or dislike your own post.');
    });

    it('should successfully add a like', async () => {
      PostRepository.findById.mockResolvedValueOnce({ user_id: 'author1' });
      InteractionRepository.upsertLikeDislike.mockResolvedValueOnce({ action: 'added' });
      
      const res = await InteractionService.react('user1', 'post', 'post1', 'like');
      expect(res.action).toBe('added');
      expect(InteractionRepository.upsertLikeDislike).toHaveBeenCalled();
    });
  });

  describe('bookmark', () => {
    it('should block users from bookmarking their own post', async () => {
      PostRepository.findById.mockResolvedValueOnce({ user_id: 'user1' });
      await expect(InteractionService.bookmark('user1', 'post1'))
        .rejects.toThrow('You cannot bookmark your own post.');
    });

    it('should successfully toggle bookmark', async () => {
      PostRepository.findById.mockResolvedValueOnce({ user_id: 'author1' });
      InteractionRepository.toggleBookmark.mockResolvedValueOnce({ action: 'bookmarked' });
      
      const res = await InteractionService.bookmark('user1', 'post1');
      expect(res.action).toBe('bookmarked');
    });
  });
});
