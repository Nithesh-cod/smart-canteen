// ============================================================================
// AUTH ROUTES
// ============================================================================
// Authentication endpoints: /api/auth/*
// ============================================================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// ============================================================================
// PUBLIC ROUTES (No authentication required)
// ============================================================================

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new student
 * @access  Public
 * @body    { name, roll_number, phone, email?, department? }
 */
router.post('/signup', authController.signup);

/**
 * @route   POST /api/auth/login
 * @desc    Login student using roll number or phone
 * @access  Public
 * @body    { identifier } // roll_number or phone
 */
router.post('/login', authController.login);

// ============================================================================
// PROTECTED ROUTES (Authentication required)
// ============================================================================

/**
 * @route   GET /api/auth/profile
 * @desc    Get current student profile with statistics
 * @access  Private (requires JWT token)
 */
router.get('/profile', verifyToken, authController.getProfile);

/**
 * @route   GET /api/auth/me
 * @desc    Server-authoritative identity + role check (for frontend route guards)
 * @access  Private (requires JWT token)
 */
router.get('/me', verifyToken, authController.getMe);

/**
 * @route   GET /api/auth/firebase-token
 * @desc    Mint a Firebase custom token (role claim) for authenticated
 *          client-side Firestore reads on the staff dashboards
 * @access  Private (requires JWT token)
 */
router.get('/firebase-token', verifyToken, authController.getFirebaseToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout student (client-side token removal)
 * @access  Private (requires JWT token)
 */
router.post('/logout', verifyToken, authController.logout);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT token
 * @access  Public
 * @body    { token } // Old/expired token
 */
router.post('/refresh', authController.refreshToken);

// ============================================================================
// EXPORT
// ============================================================================

module.exports = router;