// ============================================================================
// PAYMENT ROUTES
// ============================================================================
// Payment processing endpoints: /api/payments/*
// IMPORTANT: Static routes MUST be registered before dynamic /:paymentId
// ============================================================================

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { verifyToken, isAdmin, optionalAuth } = require('../middleware/auth.middleware');

// ============================================================================
// WEBHOOK ROUTE (must be before body-parsed routes if using raw body)
// ============================================================================

/**
 * @route   POST /api/payments/webhook
 * @desc    Razorpay webhook for payment notifications
 * @access  Public (Razorpay servers only — verified by HMAC signature)
 */
router.post('/webhook', paymentController.handleWebhook);

// ============================================================================
// STUDENT ROUTES
// ============================================================================

/**
 * @route   POST /api/payments/create
 * @desc    Create Razorpay order for a canteen order
 * @access  Private (Student)
 * @body    { order_id }
 */
router.post('/create', optionalAuth, paymentController.createPaymentOrder);

/**
 * @route   POST /api/payments/verify
 * @desc    Verify Razorpay payment signature, mark order paid, print bill
 * @access  Private (Student)
 * @body    { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
router.post('/verify', optionalAuth, paymentController.verifyPayment);

/**
 * @route   GET /api/payments/history
 * @desc    Get student's payment history
 * @access  Private (Student)
 * @query   limit? (default: 20)
 */
router.get('/history', verifyToken, paymentController.getHistory);

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * @route   GET /api/payments/all
 * @desc    Get all payments (admin view)
 * @access  Private (Admin only)
 * @query   limit?, offset?
 */
router.get('/all', verifyToken, isAdmin, paymentController.getAllPayments);

/**
 * @route   POST /api/payments/refund
 * @desc    Process payment refund via Razorpay
 * @access  Private (Admin only)
 * @body    { order_id, reason? }
 */
router.post('/refund', verifyToken, isAdmin, paymentController.processRefund);

/**
 * @route   GET /api/payments/:paymentId
 * @desc    Get Razorpay payment details by payment ID
 * @access  Private (Admin only)
 * @param   paymentId - Razorpay payment ID (pay_xxx)
 */
router.get('/:paymentId', verifyToken, isAdmin, paymentController.getPaymentDetails);

// ============================================================================
// EXPORT
// ============================================================================

module.exports = router;
