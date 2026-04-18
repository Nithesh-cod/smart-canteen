// ============================================================================
// ADMIN ROUTES
// ============================================================================
// Owner/Admin dashboard endpoints: /api/admin/*
// ============================================================================

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

// ============================================================================
// ALL ROUTES REQUIRE ADMIN AUTHENTICATION
// ============================================================================

// Apply authentication and admin check to all routes
router.use(verifyToken);
router.use(isAdmin);

// ============================================================================
// DASHBOARD ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get dashboard overview statistics
 * @access  Private (Admin only)
 * @returns {
 *   today: { revenue, order_count },
 *   week: { revenue, order_count },
 *   month: { revenue, order_count },
 *   status_breakdown: [{ status, count }],
 *   top_items: [...],
 *   recent_orders: [...]
 * }
 */
router.get('/dashboard', adminController.getDashboard);

// ============================================================================
// SALES & REVENUE ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/sales
 * @desc    Get detailed sales report
 * @access  Private (Admin only)
 * @query   from_date? - Start date (YYYY-MM-DD)
 * @query   to_date? - End date (YYYY-MM-DD)
 * @query   group_by? - daily|weekly|monthly (default: daily)
 */
router.get('/sales', adminController.getSalesReport);

/**
 * @route   GET /api/admin/revenue
 * @desc    Get revenue analytics
 * @access  Private (Admin only)
 * @query   period? - today|week|month|year|custom
 * @query   from_date? - For custom period
 * @query   to_date? - For custom period
 */
router.get('/revenue', adminController.getRevenue);

// ============================================================================
// STUDENT MANAGEMENT ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/students
 * @desc    Get all students with statistics
 * @access  Private (Admin only)
 * @query   limit? (default: 50)
 * @query   offset? - Pagination offset
 * @query   tier? - Filter by tier (Bronze|Silver|Gold|Platinum)
 * @query   sort_by? - points|total_spent|total_orders (default: created_at)
 */
router.get('/students', adminController.getStudents);

/**
 * @route   GET /api/admin/students/:studentId
 * @desc    Get detailed student information
 * @access  Private (Admin only)
 * @param   studentId - Student UUID
 */
router.get('/students/:studentId', adminController.getStudentDetail);

/**
 * @route   PATCH /api/admin/students/:studentId/status
 * @desc    Activate/Deactivate student account
 * @access  Private (Admin only)
 * @param   studentId - Student UUID
 * @body    { is_active } (boolean)
 */
router.patch('/students/:studentId/status', adminController.toggleStudentStatus);

// ============================================================================
// ORDER MANAGEMENT ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/orders
 * @desc    Get all orders with filters (admin view)
 * @access  Private (Admin only)
 * @query   status?
 * @query   payment_status?
 * @query   student_id?
 * @query   from_date?
 * @query   to_date?
 * @query   limit?
 */
router.get('/orders', adminController.getOrders);

/**
 * @route   GET /api/admin/orders/pending
 * @desc    Get pending orders count
 * @access  Private (Admin only)
 */
router.get('/orders/pending', adminController.getPendingOrders);

// ============================================================================
// MENU MANAGEMENT ROUTES (Additional admin operations)
// ============================================================================

/**
 * @route   POST /api/admin/menu/bulk-availability
 * @desc    Bulk update menu item availability
 * @access  Private (Admin only)
 * @body    { item_ids: [], is_available: boolean }
 */
router.post('/menu/bulk-availability', adminController.bulkUpdateMenuAvailability);

// ============================================================================
// ANALYTICS ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/analytics/overview
 * @desc    Get comprehensive analytics overview
 * @access  Private (Admin only)
 */
router.get('/analytics/overview', adminController.getAnalyticsOverview);

/**
 * @route   GET /api/admin/analytics/trends
 * @desc    Get sales trends and predictions
 * @access  Private (Admin only)
 * @query   period? - 7days|30days|90days
 */
router.get('/analytics/trends', adminController.getTrends);

/**
 * @route   GET /api/admin/analytics/peak-hours
 * @desc    Get peak ordering hours
 * @access  Private (Admin only)
 */
router.get('/analytics/peak-hours', adminController.getPeakHours);

// ============================================================================
// REPORTS ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/reports/daily
 * @desc    Generate daily sales report
 * @access  Private (Admin only)
 * @query   date? - Specific date (default: today)
 */
router.get('/reports/daily', adminController.getDailyReport);

/**
 * @route   GET /api/admin/reports/monthly
 * @desc    Generate monthly sales report
 * @access  Private (Admin only)
 * @query   month? - Month number (1-12)
 * @query   year? - Year (default: current year)
 */
router.get('/reports/monthly', adminController.getMonthlyReport);

/**
 * @route   GET /api/admin/reports/export
 * @desc    Export reports as CSV/PDF
 * @access  Private (Admin only)
 * @query   type - daily|weekly|monthly
 * @query   format - csv|pdf
 * @query   from_date?
 * @query   to_date?
 */
router.get('/reports/export', adminController.exportReport);

// ============================================================================
// OFFERS ROUTES
// ============================================================================

router.get('/offers',                adminController.getOffers);
router.post('/offers',               adminController.createOffer);
router.put('/offers/:id',            adminController.updateOffer);
router.delete('/offers/:id',         adminController.deleteOffer);
router.patch('/offers/:id/toggle',   adminController.toggleOffer);

// ============================================================================
// SYSTEM HEALTH ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/system/health
 * @desc    Get system health status
 * @access  Private (Admin only)
 */
router.get('/system/health', adminController.getSystemHealth);

/**
 * @route   GET /api/admin/system/logs
 * @desc    Get system logs
 * @access  Private (Admin only)
 * @query   level? - error|warn|info
 * @query   limit? (default: 100)
 */
router.get('/system/logs', adminController.getLogs);

// ============================================================================
// EXPORT
// ============================================================================

module.exports = router;