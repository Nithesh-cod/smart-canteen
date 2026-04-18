// ============================================================================
// MENU ROUTES
// ============================================================================
// Menu management endpoints: /api/menu/*
// IMPORTANT: Static/specific routes MUST be registered before dynamic /:id
// ============================================================================

const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menu.controller');
const { verifyToken, isAdmin, isChef } = require('../middleware/auth.middleware');

// ============================================================================
// STATIC PUBLIC ROUTES (before /:id)
// ============================================================================

/**
 * @route   GET /api/menu/available
 * @desc    Get only available menu items (student kiosk)
 * @access  Public
 */
router.get('/available', menuController.getAvailable);

/**
 * @route   GET /api/menu/offers
 * @desc    Get currently active offers (student kiosk banner)
 * @access  Public
 */
router.get('/offers', menuController.getActiveOffers);

/**
 * @route   GET /api/menu/search
 * @desc    Search menu items by name
 * @access  Public
 * @query   q - Search term
 */
router.get('/search', menuController.search);

/**
 * @route   GET /api/menu/category/:category
 * @desc    Get menu items by category
 * @access  Public
 * @param   category - starters|mains|desserts|beverages
 */
router.get('/category/:category', menuController.getByCategory);

// ============================================================================
// STATISTICS ROUTES (Admin only — before /:id to avoid route conflict)
// ============================================================================

/**
 * @route   GET /api/menu/stats/top-selling
 * @desc    Get top-selling menu items
 * @access  Private (Admin only)
 * @query   limit? (default: 10)
 */
router.get('/stats/top-selling', verifyToken, isAdmin, menuController.getTopSelling);

/**
 * @route   GET /api/menu/stats/category
 * @desc    Get menu statistics by category
 * @access  Private (Admin only)
 */
router.get('/stats/category', verifyToken, isAdmin, menuController.getCategoryStats);

/**
 * @route   GET /api/menu/stats
 * @desc    Get combined menu stats (top-selling + per-category)
 * @access  Private (Admin only)
 */
router.get('/stats', verifyToken, isAdmin, menuController.getStats);

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

/**
 * @route   GET /api/menu
 * @desc    Get all menu items (admin/owner view — includes unavailable)
 * @access  Public
 */
router.get('/', menuController.getAll);

/**
 * @route   GET /api/menu/:id
 * @desc    Get single menu item by ID
 * @access  Public
 */
router.get('/:id', menuController.getById);

// ============================================================================
// ADMIN ROUTES (Create, Update, Delete)
// ============================================================================

/**
 * @route   POST /api/menu
 * @desc    Create a new menu item
 * @access  Private (Admin only)
 */
router.post('/', verifyToken, isAdmin, menuController.create);

/**
 * @route   PUT /api/menu/:id
 * @desc    Update menu item
 * @access  Private (Admin only)
 */
router.put('/:id', verifyToken, isAdmin, menuController.update);

/**
 * @route   DELETE /api/menu/:id
 * @desc    Delete menu item
 * @access  Private (Admin only)
 */
router.delete('/:id', verifyToken, isAdmin, menuController.deleteItem);

// ============================================================================
// CHEF/ADMIN ROUTES (Availability Toggle)
// ============================================================================

/**
 * @route   PATCH /api/menu/:id/availability
 * @desc    Toggle menu item availability (auto-flip on backend)
 * @access  Private (Chef or Admin)
 */
router.patch('/:id/availability', verifyToken, isChef, menuController.toggleAvailability);

// ============================================================================
// EXPORT
// ============================================================================

module.exports = router;
