const express = require("express");
const router = express.Router();
const UserController = require("../controllers/UserController");
const {
  authenticate,
  authorizeRoles,
} = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");

// Superadmin only
/**
 * @swagger
 * /api/users/promote:
 *   post:
 *     summary: Promote a user to Admin (Superadmin only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [userId], properties: { userId: { type: string } } }
 *     responses:
 *       200: { description: User promoted }
 */
router.post(
  "/promote",
  authenticate,
  authorizeRoles("superadmin"),
  UserController.promoteToAdmin,
);

/**
 * @swagger
 * /api/users/demote:
 *   post:
 *     summary: Demote an Admin to User (Superadmin only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [userId], properties: { userId: { type: string } } }
 *     responses:
 *       200: { description: User demoted }
 */
router.post(
  "/demote",
  authenticate,
  authorizeRoles("superadmin"),
  UserController.demoteToUser,
);

router.delete("/:targetUserId", authenticate, UserController.deleteAccount);

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get own profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profile data }
 */
router.get("/profile", authenticate, UserController.getProfile);

/**
 * @swagger
 * /api/users/profile/{targetId}:
 *   get:
 *     summary: Get any user profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: targetId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Profile data }
 */
router.get("/profile/:targetId", authenticate, UserController.getProfile);

/**
 * @swagger
 * /api/users/profile/{targetId}/follow:
 *   post:
 *     summary: Toggle follow status
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: targetId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Follow toggled }
 */
router.post(
  "/profile/:targetId/follow",
  authenticate,
  UserController.toggleFollow,
);

/**
 * @swagger
 * /api/users/profile/{targetId}/followers:
 *   get:
 *     summary: Get followers list for a user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: targetId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of followers }
 */
router.get("/profile/:targetId/followers", authenticate, UserController.getFollowers);

/**
 * @swagger
 * /api/users/profile/{targetId}/following:
 *   get:
 *     summary: Get list of users specified person is following
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: targetId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of following users }
 */
router.get("/profile/:targetId/following", authenticate, UserController.getFollowing);

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update profile info
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { bio: { type: string }, displayName: { type: string } } }
 *     responses:
 *       200: { description: Profile updated }
 */
router.put("/profile", authenticate, UserController.updateProfile);

/**
 * @swagger
 * /api/users/profile/avatar:
 *   post:
 *     summary: Upload avatar
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema: { type: object, properties: { avatar: { type: string, format: binary } } }
 *     responses:
 *       200: { description: Avatar uploaded }
 */
router.post(
  "/profile/avatar",
  authenticate,
  upload.single("avatar"),
  UserController.uploadAvatar,
);

/**
 * @swagger
 * /api/users/preferences:
 *   put:
 *     summary: Update account preferences
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { theme: { type: string }, notifications: { type: boolean } } }
 *     responses:
 *       200: { description: Preferences updated }
 */
router.put("/preferences", authenticate, UserController.updatePreferences);

/**
 * @swagger
 * /api/users/profile/2fa:
 *   post:
 *     summary: Toggle 2FA setting
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 2FA toggled }
 */
router.post("/profile/2fa", authenticate, UserController.toggle2FA);

/**
 * @swagger
 * /api/users/profile/phone-verify/request:
 *   post:
 *     summary: Request a 6-digit SMS verification code
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: SMS sent }
 */
router.post(
  "/profile/phone-verify/request",
  authenticate,
  UserController.verifyPhoneRequest,
);

/**
 * @swagger
 * /api/users/profile/phone-verify/confirm:
 *   post:
 *     summary: Confirm SMS code to verify phone number
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [code], properties: { code: { type: string } } }
 *     responses:
 *       200: { description: Phone verified }
 */
router.post(
  "/profile/phone-verify/confirm",
  authenticate,
  UserController.verifyPhoneConfirm,
);

/**
 * @swagger
 * /api/users/profile/change-password:
 *   post:
 *     summary: Change password while logged in
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [oldPassword, newPassword], properties: { oldPassword: { type: string }, newPassword: { type: string } } }
 *     responses:
 *       200: { description: Password changed }
 */
router.post(
  "/profile/change-password",
  authenticate,
  UserController.changePassword,
);

/**
 * @swagger
 * /api/users/profile/deactivate:
 *   post:
 *     summary: Self-deactivate account (Immediate logout)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Account deactivated }
 */
router.post("/profile/deactivate", authenticate, UserController.deactivateSelf);

/**
 * @swagger
 * /api/users/{targetUserId}:
 *   delete:
 *     summary: Request account deletion (Requires reason)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: targetUserId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [reason], properties: { reason: { type: string } } }
 *     responses:
 *       200: { description: Deletion requested }
 */


/**
 * @swagger
 * /api/users/{targetUserId}/suspend:
 *   post:
 *     summary: Toggle user suspension (Admin/Superadmin only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: targetUserId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { reason: { type: string } } }
 *     responses:
 *       200: { description: Suspension toggled }
 */
router.post(
  "/:targetUserId/suspend",
  authenticate,
  authorizeRoles("admin", "superadmin"),
  UserController.toggleSuspension,
);

/**
 * @swagger
 * /api/users/search-bloggers:
 *   get:
 *     summary: Social-graph aware blogger search (Unicorn-lite)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1; }
 *     responses:
 *       200: { description: List of ranked bloggers }
 */
router.get("/search-bloggers", authenticate, UserController.searchBloggers);

/**
 * @swagger
 * /api/users/categories:
 *   get:
 *     summary: Get grouped categories for preferences selection
 *     tags: [Users]
 *     responses:
 *       200: { description: Grouped categories object }
 */
router.get("/categories", UserController.getCategories);

module.exports = router;
