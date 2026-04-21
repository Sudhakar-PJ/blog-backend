const express = require('express');
const router = express.Router();
const MediaController = require('../controllers/MediaController');
const { authenticate } = require('../middlewares/authMiddleware');
const { uploadLimiter } = require('../middlewares/rateLimit');

/**
 * @swagger
 * /api/media/sign-upload:
 *   get:
 *     summary: Get a signed URL for secure direct-to-cloud media upload
 *     tags: [Media]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Signature and upload parameters }
 */
router.get('/sign-upload', authenticate, uploadLimiter, MediaController.getSignedUrl);

module.exports = router;
