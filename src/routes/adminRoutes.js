const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/AdminController');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

// Lock entirely behind admin tier
router.use(authenticate);
router.use(authorizeRoles('admin', 'superadmin'));

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all system users (Paginated & Searchable)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200: { description: List of users }
 */
router.get('/users', AdminController.getAllUsers);

/**
 * @swagger
 * /api/admin/posts:
 *   get:
 *     summary: Get all system posts for moderation
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200: { description: List of posts }
 */
router.get('/posts', AdminController.getAllPosts);

/**
 * @swagger
 * /api/admin/logs:
 *   get:
 *     summary: Get high-level system event logs
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of logs }
 */
router.get('/logs', AdminController.getSystemLogs);

/**
 * @swagger
 * /api/admin/server-errors:
 *   get:
 *     summary: Get critical server-side error logs (Terminal view)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of errors }
 */
router.get('/server-errors', AdminController.getServerErrors);

/**
 * @swagger
 * /api/admin/logs/hot:
 *   get:
 *     summary: Stream the 100 most recent system logs in real-time
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of recent logs }
 */
router.get('/logs/hot', AdminController.getHotLogs);

/**
 * @swagger
 * /api/admin/logs/search:
 *   get:
 *     summary: Deep-search logs by a specific Request ID
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Chain of events for the request }
 */
router.get('/logs/search', AdminController.searchLogsByRequestId);

/**
 * @swagger
 * /api/admin/users/{id}/promote:
 *   post:
 *     summary: Promote a user to Admin status
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: User UUID to promote
 *         schema: { type: string }
 *     responses:
 *       200: { description: User promoted }
 */
router.post('/users/:id/promote', AdminController.promoteToAdmin);

/**
 * @swagger
 * /api/admin/users/{id}/suspend:
 *   post:
 *     summary: Suspend a user (Prevents login)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { reason: { type: string } } }
 *     responses:
 *       200: { description: User suspended }
 */
router.post('/users/:id/suspend', AdminController.suspendUser);

/**
 * @swagger
 * /api/admin/users/{id}/unsuspend:
 *   post:
 *     summary: Restore a suspended user
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User unsuspended }
 */
router.post('/users/:id/unsuspend', AdminController.unsuspendUser);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     summary: Force-delete a user account (Admin only)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User deleted permanently }
 */
router.delete('/users/:id', AdminController.deleteUser);

module.exports = router;
