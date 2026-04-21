const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { authLimiter } = require('../middlewares/rateLimit');
const { honeypot } = require('../middlewares/botProtection');
const validate = require('../middlewares/validate');
const authValidation = require('../validations/authValidation');

const passport = require('passport');

// Direct local auth
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username: {type: string}
 *               email: {type: string, format: email}
 *               password: {type: string, minLength: 8}
 *               website: {type: string, description: "Honeypot field - leave empty"}
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error or Email already exists
 */
router.post('/register', authLimiter, honeypot, validate(authValidation.register), AuthController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and receive JWT cookies
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: {type: string, format: email}
 *               password: {type: string}
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials or account suspended
 */
router.post('/login', authLimiter, validate(authValidation.login), AuthController.login);

/**
 * @swagger
 * /api/auth/login/2fa:
 *   post:
 *     summary: Verify 2FA code during login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: {type: string, example: "123456"}
 *     responses:
 *       200:
 *         description: 2FA successful
 */
router.post('/login/2fa', authLimiter, validate(authValidation.verify2FA), AuthController.verify2FALogin);

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify email using 6-digit code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: {type: string, example: "123456"}
 *     responses:
 *       200:
 *         description: Email verified successfully
 */
router.post('/verify-email', validate(authValidation.verifyEmail), AuthController.verifyEmail);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Send password reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: {type: string, format: email}
 *     responses:
 *       200:
 *         description: Reset email sent
 */
router.post('/forgot-password', authLimiter, validate(authValidation.forgotPassword), AuthController.forgotPassword);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh Access Token using Refresh Cookie
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Token refreshed
 *       401:
 *         description: Refresh token invalid or expired
 */
router.post('/refresh', AuthController.refresh);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Clear session cookies
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout', AuthController.logout);

// Google OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Internal Google OAuth callback handler
 *     tags: [Auth]
 *     responses:
 *       200: { description: OAuth successful, sets cookies }
 */
router.get('/google/callback', passport.authenticate('google', { session: false }), AuthController.googleCallback);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current authenticated user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 */
const { authenticate } = require('../middlewares/authMiddleware');
router.get('/me', authenticate, AuthController.me);

module.exports = router;
