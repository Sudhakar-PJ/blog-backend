const express = require('express');
const router = express.Router();
const InteractionController = require('../controllers/InteractionController');
const { authenticate } = require('../middlewares/authMiddleware');

router.use(authenticate);

// Comments
/**
 * @swagger
 * /api/interactions/posts/{postId}/comments:
 *   get:
 *     summary: Get comments for a post
 *     tags: [Interactions]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of comments }
 *   post:
 *     summary: Add a comment
 *     tags: [Interactions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [content], properties: { content: { type: string } } }
 *     responses:
 *       201: { description: Comment added }
 */
router.get('/posts/:postId/comments', InteractionController.getComments);
router.post('/posts/:postId/comments', InteractionController.addComment);

/**
 * @swagger
 * /api/interactions/comments/{commentId}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [Interactions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Comment deleted }
 */
router.delete('/comments/:commentId', InteractionController.deleteComment);

/**
 * @swagger
 * /api/interactions/{targetType}/{targetId}/react:
 *   post:
 *     summary: Add or toggle a Like/Dislike reaction
 *     tags: [Interactions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: targetType
 *         required: true
 *         schema: { type: string, enum: [posts, comments] }
 *       - in: path
 *         name: targetId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [type], properties: { type: { type: string, enum: [like, dislike] } } }
 *     responses:
 *       200: { description: Reaction updated }
 */
router.post('/:targetType/:targetId/react', InteractionController.react);

/**
 * @swagger
 * /api/interactions/posts/{postId}/bookmark:
 *   post:
 *     summary: Toggle post bookmark
 *     tags: [Interactions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Bookmark toggled }
 */
router.post('/posts/:postId/bookmark', InteractionController.bookmark);

/**
 * @swagger
 * /api/interactions/{targetType}/{targetId}/view:
 *   post:
 *     summary: Record a view for a post or comment
 *     tags: [Interactions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: targetType
 *         required: true
 *         schema: { type: string, enum: [posts] }
 *       - in: path
 *         name: targetId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: View recorded }
 */
router.post('/:targetType/:targetId/view', InteractionController.markViewed);

module.exports = router;
