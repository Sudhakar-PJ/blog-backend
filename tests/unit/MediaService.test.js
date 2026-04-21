const MediaService = require('../../src/services/MediaService');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const { logger } = require('../../src/config/logger');

jest.mock('cloudinary');
jest.mock('fs');

describe('MediaService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadMedia', () => {
    it('should skip upload and return mock URL in test mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      
      const res = await MediaService.uploadMedia('/path/to/img.jpg', 'image');
      expect(res).toContain('https://res.cloudinary.com/test-env/');
      expect(fs.unlink).toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should upload to cloudinary in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      cloudinary.uploader.upload.mockResolvedValueOnce({
        secure_url: 'https://cdn.com/new-img.jpg'
      });
      
      const res = await MediaService.uploadMedia('/path/to/img.jpg', 'image');
      expect(res).toBe('https://cdn.com/new-img.jpg');
      expect(cloudinary.uploader.upload).toHaveBeenCalled();
      expect(fs.unlink).toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle upload failures gracefully', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      cloudinary.uploader.upload.mockRejectedValueOnce(new Error('Cloudinary Down'));
      
      await expect(MediaService.uploadMedia('/path/to/img.jpg', 'image'))
        .rejects.toThrow('Media upload failed');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('deleteMedia', () => {
    it('should trigger cloudinary destroy in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await MediaService.deleteMedia('pid-123', 'image');
      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('pid-123', expect.anything());

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('getSignedUploadParams', () => {
    it('should return signed parameters', () => {
      cloudinary.utils.api_sign_request.mockReturnValueOnce('mocked-signature');
      process.env.CLOUDINARY_API_SECRET = 'secret';
      
      const params = MediaService.getSignedUploadParams();
      expect(params.signature).toBe('mocked-signature');
      expect(params).toHaveProperty('timestamp');
      expect(params).toHaveProperty('apiKey');
    });
  });
});
