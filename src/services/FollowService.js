const { withTransaction } = require('../config/db');
const FollowRepository = require('../repositories/FollowRepository');
const NotificationService = require('./NotificationService');

class FollowService {
  async toggleFollow(followerId, followingId) {
    if (followerId === followingId) {
      const error = new Error('You cannot follow yourself');
      error.status = 400;
      throw error;
    }

    return await withTransaction(async (tx) => {
      const isFollowing = await FollowRepository.isFollowing(followerId, followingId, tx);
      
      if (isFollowing) {
        await FollowRepository.unfollow(followerId, followingId, tx);
        return { following: false };
      } else {
        await FollowRepository.follow(followerId, followingId, tx);
        // Create notification
        await NotificationService.createNotification({
          userId: followingId,
          actorId: followerId,
          type: 'follow'
        }, tx);
        return { following: true };
      }
    });
  }

  async getFollowers(userId) {
    return await FollowRepository.getFollowers(userId);
  }

  async getFollowing(userId) {
    return await FollowRepository.getFollowing(userId);
  }

  async getFollowCounts(userId, currentUserId = null) {
    const followers = await FollowRepository.getFollowers(userId);
    const following = await FollowRepository.getFollowing(userId);
    let isFollowing = false;
    
    if (currentUserId) {
      isFollowing = followers.some(f => f.id === currentUserId);
    }
    
    return {
      followersCount: followers.length,
      followingCount: following.length,
      isFollowing: isFollowing
    };
  }
}

module.exports = new FollowService();
