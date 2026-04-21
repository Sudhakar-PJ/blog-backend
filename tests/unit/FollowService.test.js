const FollowService = require('../../src/services/FollowService');
const FollowRepository = require('../../src/repositories/FollowRepository');
const NotificationService = require('../../src/services/NotificationService');

jest.mock('../../src/repositories/FollowRepository');
jest.mock('../../src/services/NotificationService');
jest.mock('../../src/config/db', () => ({
  withTransaction: jest.fn(cb => cb('mock-tx'))
}));

describe('FollowService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('toggleFollow', () => {
    it('should block self-following', async () => {
      await expect(FollowService.toggleFollow('user1', 'user1'))
        .rejects.toThrow('You cannot follow yourself');
    });

    it('should toggle follow state successfully to followed', async () => {
      FollowRepository.isFollowing.mockResolvedValueOnce(false);
      FollowRepository.follow.mockResolvedValueOnce({});
      NotificationService.createNotification.mockResolvedValueOnce({});

      const res = await FollowService.toggleFollow('user1', 'user2');
      expect(res.following).toBe(true);
      expect(FollowRepository.follow).toHaveBeenCalledWith('user1', 'user2', 'mock-tx');
    });

    it('should toggle follow state successfully to unfollowed', async () => {
      FollowRepository.isFollowing.mockResolvedValueOnce(true);
      FollowRepository.unfollow.mockResolvedValueOnce({});

      const res = await FollowService.toggleFollow('user1', 'user2');
      expect(res.following).toBe(false);
      expect(FollowRepository.unfollow).toHaveBeenCalledWith('user1', 'user2', 'mock-tx');
    });
  });

  describe('getFollowCounts', () => {
    it('should fetch followers and following count', async () => {
      FollowRepository.getFollowers.mockResolvedValueOnce([{ id: 'u2' }, { id: 'u3' }]);
      FollowRepository.getFollowing.mockResolvedValueOnce([{ id: 'u4' }]);
      const stats = await FollowService.getFollowCounts('u1', 'u2');
      expect(stats.followersCount).toBe(2);
      expect(stats.followingCount).toBe(1);
      expect(stats.isFollowing).toBe(true);
    });
  });
});
