// ============================================================================
// CART ROUTES  —  /api/cart/*
// ============================================================================
// Live stock holds. Deliberately NOT behind verifyToken: guests order at the
// kiosk without an account, so cart identity comes from the signed cart token
// (or a student JWT when one is present). See middleware/cart.middleware.js.
// ============================================================================

const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart.controller');
const { resolveCart } = require('../middleware/cart.middleware');

router.use(resolveCart);

/**
 * @route   POST /api/cart/session
 * @desc    Mint a signed cart token for a guest cart
 * @access  Public
 */
router.post('/session', cartController.createSession);

/**
 * @route   GET /api/cart/availability
 * @desc    Live availability for the whole menu (on-hand minus active holds)
 * @access  Public
 */
router.get('/availability', cartController.getAvailability);

/**
 * @route   PUT /api/cart/items
 * @desc    Set this cart's held quantity for one item (0 releases it)
 * @access  Public (cart token or student JWT)
 * @body    { menu_item_id, quantity }
 */
router.put('/items', cartController.setItem);

/**
 * @route   DELETE /api/cart
 * @desc    Release every hold this cart owns
 * @access  Public (cart token or student JWT)
 */
router.delete('/', cartController.clearCart);

module.exports = router;
