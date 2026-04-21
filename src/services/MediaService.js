const cloudinary = require('cloudinary').v2;
const fs = require('fs');
require('dotenv').config();
const { logger } = require('../config/logger');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('☁️  Cloudinary Service Ready');

class MediaService {
  async uploadMedia(filePath, type) {
    if (process.env.NODE_ENV === 'test') {
      logger.info(`[TEST BYPASS] Simulated file upload for ${filePath}`);
      // Simulate file cleanup
      fs.unlink(filePath, (err) => {});
      return `https://res.cloudinary.com/test-env/image/upload/v1234567890/blog_media/test-mock-${Date.now()}.${type === 'video' ? 'mp4' : 'jpg'}`;
    }
    try {
      const resourceType = type === 'video' ? 'video' : 'image';
      const result = await cloudinary.uploader.upload(filePath, {
        resource_type: resourceType,
        folder: 'blog_media'
      });
      
      // Cleanup local file after upload
      fs.unlink(filePath, (err) => {
        if (err) logger.warn('Error cleaning up local file after media upload', { filePath, error: err.message });
      });

      return result.secure_url;
    } catch (error) {
      logger.error('Media upload failed', { error: error.message, stack: error.stack });
      throw new Error('Media upload failed');
    }
  }

  async deleteMedia(publicId, type) {
    if (process.env.NODE_ENV === 'test') {
      logger.info(`[TEST BYPASS] Simulated media deletion for ${publicId}`);
      return;
    }
    const resourceType = type === 'video' ? 'video' : 'image';
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }

  getSignedUploadParams(folder = 'blog_media') {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const paramsToSign = {
      timestamp: timestamp,
      folder: folder
    };
    
    const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);
    
    return {
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder
    };
  }
}

module.exports = new MediaService();
