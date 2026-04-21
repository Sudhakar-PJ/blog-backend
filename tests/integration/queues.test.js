const { worker: mediaWorker } = require('../../src/queues/mediaCleanupQueue');
const { worker: notifyWorker } = require('../../src/queues/notificationQueue');
const { worker: postWorker } = require('../../src/queues/postProcessQueue');
const NotificationService = require('../../src/services/NotificationService');
const AIService = require('../../src/services/AIService');
const PostRepository = require('../../src/repositories/PostRepository');
const FollowRepository = require('../../src/repositories/FollowRepository');
const { pool } = require('../../src/config/db');
const redisClient = require('../../src/config/redis');

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    api: {
      delete_resources: jest.fn().mockResolvedValue({ deleted: {} })
    }
  }
}));

describe('Background Queues and Workers', () => {

  afterAll(async () => {
    // Workers are closed globally by setup.js, no need to touch here.
  });

  describe('Notification Worker', () => {
    it('should correctly process a SINGLE notification job', async () => {
      jest.spyOn(NotificationService, 'createNotification').mockResolvedValue(true);
      
      const job = { data: { type: 'SINGLE', data: { userId: 'u1', type: 'like' } } };
      await notifyWorker.processFn(job);
      
      expect(NotificationService.createNotification).toHaveBeenCalledWith(job.data.data);
      NotificationService.createNotification.mockRestore();
    });

    it('should ignore unknown notification job types gracefully', async () => {
      // should not throw
      const job = { data: { type: 'UNKNOWN_TRIGGER' } };
      await expect(notifyWorker.processFn(job)).resolves.toBeUndefined();
    });
  });

  describe('Post Processing Worker', () => {
    it('should execute AI Categorization and update post', async () => {
      jest.spyOn(AIService.aiService, 'categorizeContent').mockResolvedValue('Technology');
      jest.spyOn(PostRepository, 'updateCategory').mockResolvedValue(true);

      const job = { data: { type: 'AI_CATEGORIZATION', data: { postId: 'p1', title: 'Test', contentText: 'Data', postType: 'text' } } };
      await postWorker.processFn(job);

      expect(AIService.aiService.categorizeContent).toHaveBeenCalledWith('Test', 'Data', 'text');
      expect(PostRepository.updateCategory).toHaveBeenCalledWith('p1', 'Technology');

      AIService.aiService.categorizeContent.mockRestore();
      PostRepository.updateCategory.mockRestore();
    });

    it('should invalidate cache for authors and followers', async () => {
      jest.spyOn(FollowRepository, 'getFollowers').mockResolvedValue([{ id: 'follower1' }]);
      // Seed some redis data
      await redisClient.set('feed:author1:p1', 'data');
      await redisClient.set('feed:follower1:p1', 'data');

      const job = { data: { type: 'CACHE_INVALIDATION', data: { authorId: 'author1' } } };
      await postWorker.processFn(job);

      const authorFeed = await redisClient.get('feed:author1:p1');
      const followerFeed = await redisClient.get('feed:follower1:p1');
      
      expect(authorFeed).toBeNull();
      expect(followerFeed).toBeNull();
      
      FollowRepository.getFollowers.mockRestore();
    });
  });

  describe('Media Cleanup Worker', () => {
    it('should query Postgres logs and invoke Cloudinary deletions', async () => {
      const cloudinary = require('cloudinary').v2;
      cloudinary.api.delete_resources.mockClear();

      // Seed a test deletion row
      await pool.query('DELETE FROM logs.media_deletions');
      const { rows } = await pool.query(`
        INSERT INTO logs.media_deletions (public_id, resource_type)
        VALUES ('test_img_123', 'image'), ('test_vid_xyz', 'video')
        RETURNING id
      `);

      const job = {}; 
      await mediaWorker.processFn(job);

      // Verify cloudinary SDK was invoked properly
      expect(cloudinary.api.delete_resources).toHaveBeenCalledWith(['test_img_123'], { resource_type: 'image' });
      expect(cloudinary.api.delete_resources).toHaveBeenCalledWith(['test_vid_xyz'], { resource_type: 'video' });

      // Verify the ledgers were deleted from database
      const checkRecords = await pool.query('SELECT * FROM logs.media_deletions WHERE id = ANY($1::uuid[])', [rows.map(r => r.id)]);
      expect(checkRecords.rowCount).toBe(0);
    });
  });

});
