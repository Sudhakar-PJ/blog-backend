const express = require('express');
const router = express.Router();
const PostController = require('../controllers/PostController');
const { authenticate } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const validate = require('../middlewares/validate');
const postValidation = require('../validations/postValidation');

router.use(authenticate);

/**
 * @swagger
 * /api/posts:
 *   post:
 *     summary: Create a new blog post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, content]
 *             properties:
 *               title: {type: string}
 *               content: {type: string}
 *               media: {type: array, items: {type: string, format: binary}, description: "Up to 4 image/video files"}
 *     responses:
 *       201:
 *         description: Post created successfully
 */
router.post('/', upload.array('media', 4), validate(postValidation.createPost), PostController.createPost);

/**
 * @swagger
 * /api/posts/{postId}:
 *   delete:
 *     summary: Delete a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema: {type: string}
 *     responses:
 *       200:
 *         description: Post deleted successfully
 */
router.delete('/:postId', validate(postValidation.deletePost), PostController.deletePost);

/**
 * @swagger
 * /api/posts/feed:
 *   get:
 *     summary: Get personalized discovery feed
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: {type: integer, default: 1}
 *     responses:
 *       200:
 *         description: List of posts
 */
router.get('/feed', validate(postValidation.getFeed), PostController.getFeed);

/**
 * @swagger
 * /api/posts/me:
 *   get:
 *     summary: Get user's own authored posts
 *     tags: [Posts]
 *     responses:
 *       200:
 *         description: List of posts
 */
router.get('/me', validate(postValidation.genericPagination), PostController.getMyPosts);

/**
 * @swagger
 * /api/posts/user/{userId}:
 *   get:
 *     summary: Get authored posts by target user ID
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: {type: string}
 *     responses:
 *       200:
 *         description: List of posts
 */
router.get('/user/:userId', validate(postValidation.userPosts), PostController.getUserPosts);

/**
 * @swagger
 * /api/posts/liked:
 *   get:
 *     summary: Get user's liked content
 *     tags: [Posts]
 *     responses:
 *       200:
 *         description: List of posts
 */
router.get('/liked', validate(postValidation.genericPagination), PostController.getLikedPosts);

/**
 * @swagger
 * /api/posts/bookmarked:
 *   get:
 *     summary: Get user's bookmarked content
 *     tags: [Posts]
 *     responses:
 *       200:
 *         description: List of posts
 */
router.get('/bookmarked', validate(postValidation.genericPagination), PostController.getBookmarkedPosts);

/**
 * @swagger
 * /api/posts/search:
 *   get:
 *     summary: Search for posts
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: {type: string}
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', validate(postValidation.searchQuery), PostController.search);

module.exports = router;
