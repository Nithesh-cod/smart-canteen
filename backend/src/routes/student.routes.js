// ============================================================================
// STUDENT ROUTES
// ============================================================================
// Student-related endpoints: /api/students/*
// ============================================================================

const express = require('express');
const router = express.Router();
const studentController = require('../controllers/student.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// ============================================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// ============================================================================

// Apply authentication middleware to all routes
router.use(verifyToken);

// ============================================================================
// PROFILE ROUTES
// ============================================================================

/**
 * @route   GET /api/students/profile
 * @desc    Get student profile with statistics
 * @access  Private
 */
router.get('/profile', studentController.getProfile);

/**
 * @route   PUT /api/students/profile
 * @desc    Update student profile
 * @access  Private
 * @body    { name?, email?, department?, profile_image_url? }
 */
router.put('/profile', studentController.updateProfile);

// ============================================================================
// POINTS ROUTES
// ============================================================================

/**
 * @route   GET /api/students/points
 * @desc    Get student points balance and tier
 * @access  Private
 */
router.get('/points', studentController.getPoints);

// ============================================================================
// ORDER HISTORY ROUTES
// ============================================================================

/**
 * @route   GET /api/students/orders
 * @desc    Get student's order history
 * @access  Private
 * @query   limit? (default: 50)
 */
router.get('/orders', studentController.getOrderHistory);

// ============================================================================
// FAVORITES ROUTES
// ============================================================================

/**
 * @route   GET /api/students/favorites
 * @desc    Get student's favorite menu items
 * @access  Private
 */
router.get('/favorites', studentController.getFavorites);

/**
 * @route   POST /api/students/favorites
 * @desc    Add menu item to favorites
 * @access  Private
 * @body    { menu_item_id }
 */
router.post('/favorites', studentController.addFavorite);

/**
 * @route   DELETE /api/students/favorites/:menuItemId
 * @desc    Remove menu item from favorites
 * @access  Private
 * @param   menuItemId - Menu item ID
 */
router.delete('/favorites/:menuItemId', studentController.removeFavorite);

// ============================================================================
// STATISTICS ROUTES
// ============================================================================

/**
 * @route   GET /api/students/stats
 * @desc    Get detailed student statistics
 * @access  Private
 */
router.get('/stats', studentController.getStats);

// ============================================================================
// EXPORT
// ============================================================================

module.exports = router;