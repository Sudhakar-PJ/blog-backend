const MediaService = require('../services/MediaService');
const ApiResponse = require('../utils/apiResponse');

class MediaController {
  async getSignedUrl(req, res, next) {
    try {
      const { folder } = req.query;
      const params = MediaService.getSignedUploadParams(folder);
      
      const { logger } = require('../config/logger');
      const UserRepository = require('../repositories/UserRepository');
      const user = await UserRepository.findById(req.user.id);
      logger.info(`Media Signature Issued: '${user ? user.username : req.user.id}' requested an upload signature for folder [${params.folder}]`, { 
        action: 'signMedia', 
        userId: req.user.id 
      });

      return ApiResponse.success(res, params);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MediaController();
