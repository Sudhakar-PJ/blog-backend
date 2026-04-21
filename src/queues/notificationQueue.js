const { Queue, Worker } = require('bullmq');
const connection = require('../config/bullmq');
const NotificationService = require('../services/NotificationService');
const FollowRepository = require('../repositories/FollowRepository');
const { logger } = require('../config/logger');

const notificationQueue = new Queue('notificationTasks', { connection });

const worker = new Worker('notificationTasks', async (job) => {
  const { type, data } = job.data;
  
  try {
    switch (type) {
      case 'BULK_NEW_POST':
        const { authorId, postId } = data;
        const followers = await FollowRepository.getFollowers(authorId);
        const followerIds = followers.map(f => f.id);
        if (followerIds.length > 0) {
          await NotificationService.createBulkNotifications(followerIds, authorId, 'new_post', postId);
        }
        break;

      case 'SINGLE':
        await NotificationService.createNotification(data);
        break;

      default:
        logger.warn(`Unknown notification job type: ${type}`);
    }
  } catch (error) {
    logger.error(`Notification Worker Error [${type}]`, { error: error.message, data });
    throw error; // Let BullMQ handle retries
  }
}, { 
  connection,
  settings: {
    backoffStrategies: {
      exponential: (attempts) => Math.pow(2, attempts) * 1000
    }
  }
});

module.exports = {
  notificationQueue,
  worker,
  addNotificationJob: (type, data) => notificationQueue.add(type, { type, data }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  })
};
