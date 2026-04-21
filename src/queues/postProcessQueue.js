const { Queue, Worker } = require('bullmq');
const connection = require('../config/bullmq');
const { aiService: AIService } = require('../services/AIService');
const PostRepository = require('../repositories/PostRepository');
const FollowRepository = require('../repositories/FollowRepository');
const redisClient = require('../config/redis');
const { logger } = require('../config/logger');

const postProcessQueue = new Queue('postProcessing', { connection });

const worker = new Worker('postProcessing', async (job) => {
  const { type, data } = job.data;
  
  try {
    switch (type) {
      case 'AI_CATEGORIZATION':
        const { postId, title, contentText, postType } = data;
        const category = await AIService.categorizeContent(title, contentText, postType);
        await PostRepository.updateCategory(postId, category);
        logger.info(`AI Categorization complete for post ${postId}`, { category });
        break;

      case 'CACHE_INVALIDATION':
        const { authorId } = data;
        
        const deleteKeys = (matchPattern) => {
          return new Promise((resolve, reject) => {
            const stream = redisClient.scanStream({ match: matchPattern });
            const keys = [];
            stream.on('data', (resultKeys) => keys.push(...resultKeys));
            stream.on('end', async () => {
              if (keys.length > 0) await redisClient.del(keys);
              resolve();
            });
            stream.on('error', reject);
          });
        };

        // Invalidate author
        await deleteKeys(`feed:${authorId}:*`);
        
        // Invalidate followers
        const followers = await FollowRepository.getFollowers(authorId);
        for (const follower of followers) {
           await deleteKeys(`feed:${follower.id}:*`);
        }
        logger.info(`Feed cache invalidated for author ${authorId} and their followers`);
        break;

      default:
        logger.warn(`Unknown post process job type: ${type}`);
    }
  } catch (error) {
    logger.error(`Post Process Worker Error [${type}]`, { error: error.message, data });
    throw error;
  }
}, { connection });

module.exports = {
  postProcessQueue,
  worker,
  addPostProcessJob: (type, data) => postProcessQueue.add(type, { type, data }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  })
};
