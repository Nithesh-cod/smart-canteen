// ============================================================================
// ORDER ROUTES
// ============================================================================
// Order management endpoints: /api/orders/*
// IMPORTANT: Static/specific routes MUST be registered before dynamic /:id
// ============================================================================

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { verifyToken, isChef, isAdmin, optionalAuth } = require('../middleware/auth.middleware');

// ============================================================================
// STATIC ROUTES (must come before /:id to avoid being swallowed)
// ============================================================================

/**
 * @route   GET /api/orders/stats/overview
 * @desc    Get order statistics (today, week, month)
 * @access  Private (Admin only)
 */
router.get('/stats/overview', verifyToken, isAdmin, orderController.getStats);

/**
 * @route   GET /api/orders/stats/revenue
 * @desc    Get revenue data for charts
 * @access  Private (Admin only)
 * @query   days? - Number of days (default: 30)
 */
router.get('/stats/revenue', verifyToken, isAdmin, orderController.getRevenueData);

/**
 * @route   GET /api/orders/track/:orderNumber
 * @desc    Track order by order number (public — no auth required)
 * @access  Public
 * @param   orderNumber - e.g. OZ12345
 */
router.get('/track/:orderNumber', orderController.track);

// ============================================================================
// STUDENT ROUTES (Create & View Orders)
// ============================================================================

/**
 * @route   POST /api/orders
 * @desc    Create a new order (guest or logged-in)
 * @access  Public — token optional; guest_name/guest_phone/guest_roll in body for guests
 * @body    { items: [{ menu_item_id, quantity }], points_to_redeem?, guest_name?, guest_phone?, guest_roll? }
 */
router.post('/', optionalAuth, orderController.create);

/**
 * @route   GET /api/orders
 * @desc    Get orders (filtered)
 *   Students → their own orders only
 *   Chef/Admin → all orders with optional filters
 * @access  Private
 * @query   status?, page?, limit?
 */
router.get('/', verifyToken, orderController.getAll);

/**
 * @route   GET /api/orders/:id
 * @desc    Get order details by numeric ID
 * @access  Private (owner, chef, or admin)
 * @param   id - Order numeric ID
 */
router.get('/:id', verifyToken, orderController.getById);

// ============================================================================
// CHEF/ADMIN ROUTES (Modify Orders)
// ============================================================================

/**
 * @route   PATCH /api/orders/:id/status
 * @desc    Update order status
 * @access  Private (Chef or Admin)
 * @body    { status } - preparing|ready|completed
 */
router.patch('/:id/status', verifyToken, isChef, orderController.updateStatus);

/**
 * @route   POST /api/orders/:id/cancel
 * @desc    Cancel order
 * @access  Private (Student who created it, or Admin)
 */
router.post('/:id/cancel', verifyToken, orderController.cancel);

// ============================================================================
// EXPORT
// ============================================================================

module.exports = router;
