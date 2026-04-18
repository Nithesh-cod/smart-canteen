// ============================================================================
// STUDENT CONTROLLER
// ============================================================================
// Profile management, points, order history, favorites, and stats
// ============================================================================

const Student = require('../models/Student');
const Order = require('../models/Order');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/error.middleware');

// ============================================================================
// GET PROFILE
// ============================================================================

/**
 * GET /api/students/profile
 * Return the authenticated student's profile with favorites count.
 */
const getProfile = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.user.id);

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  // Fetch favorites to include count
  const favorites = await Student.getFavorites(req.user.id);

  return res.status(200).json({
    success: true,
    data: {
      student: {
        id: student.id,
        name: student.name,
        roll_number: student.roll_number,
        phone: student.phone,
        email: student.email,
        department: student.department,
        profile_image_url: student.profile_image_url || null,
        points: student.points,
        tier: student.tier,
        total_orders: student.total_orders || 0,
        total_spent: student.total_spent || 0,
        favorites_count: favorites.length,
        created_at: student.created_at,
        last_login: student.last_login
      }
    }
  });
});

// ============================================================================
// UPDATE PROFILE
// ============================================================================

/**
 * PUT /api/students/profile
 * Update name, email, department, and/or profile_image_url.
 * Body: { name?, email?, department?, profile_image_url? }
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, email, department, profile_image_url } = req.body;

  // Ensure at least one updatable field was supplied
  if (!name && !email && !department && !profile_image_url) {
    return res.status(400).json({
      success: false,
      message: 'Provide at least one field to update: name, email, department, or profile_image_url'
    });
  }

  const updateData = {};
  if (name) updateData.name = name.trim();
  if (email) updateData.email = email.trim();
  if (department) updateData.department = department.trim();
  if (profile_image_url) updateData.profile_image_url = profile_image_url.trim();

  const updated = await Student.updateProfile(req.user.id, updateData);

  if (!updated) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  logger.info('Student profile updated', { id: req.user.id });

  return res.status(200).json({
    success: true,
    data: {
      student: {
        id: updated.id,
        name: updated.name,
        roll_number: updated.roll_number,
        phone: updated.phone,
        email: updated.email,
        department: updated.department,
        profile_image_url: updated.profile_image_url || null,
        points: updated.points,
        tier: updated.tier
      }
    }
  });
});

// ============================================================================
// GET POINTS
// ============================================================================

/**
 * GET /api/students/points
 * Return the current loyalty points balance and tier.
 */
const getPoints = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.user.id);

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      points: student.points,
      tier: student.tier
    }
  });
});

// ============================================================================
// GET ORDER HISTORY
// ============================================================================

/**
 * GET /api/students/orders
 * Return paginated order history for the authenticated student.
 * Query params: page (default 1), limit (default 10)
 */
const getOrderHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;

  // Order model's getByStudent fetches up to `limit` rows; we pass limit + offset
  // by using getAll with student filter for proper pagination support.
  const orders = await Order.getAll({
    student_id: req.user.id,
    limit,
    offset
  });

  return res.status(200).json({
    success: true,
    data: {
      orders,
      pagination: {
        page,
        limit,
        has_next: orders.length === limit
      }
    }
  });
});

// ============================================================================
// GET FAVORITES
// ============================================================================

/**
 * GET /api/students/favorites
 * Return all favorited menu items for the authenticated student.
 */
const getFavorites = asyncHandler(async (req, res) => {
  const favorites = await Student.getFavorites(req.user.id);

  return res.status(200).json({
    success: true,
    data: {
      favorites
    }
  });
});

// ============================================================================
// ADD FAVORITE
// ============================================================================

/**
 * POST /api/students/favorites
 * Add a menu item to favorites.
 * Body: { menu_item_id }
 */
const addFavorite = asyncHandler(async (req, res) => {
  const { menu_item_id } = req.body;

  if (!menu_item_id) {
    return res.status(400).json({
      success: false,
      message: 'menu_item_id is required'
    });
  }

  const favorite = await Student.addToFavorites(req.user.id, menu_item_id);

  // addToFavorites uses ON CONFLICT DO NOTHING — returns undefined if already exists
  if (!favorite) {
    return res.status(200).json({
      success: true,
      message: 'Item is already in your favorites'
    });
  }

  logger.info('Favorite added', { student_id: req.user.id, menu_item_id });

  return res.status(201).json({
    success: true,
    message: 'Item added to favorites',
    data: {
      favorite
    }
  });
});

// ============================================================================
// REMOVE FAVORITE
// ============================================================================

/**
 * DELETE /api/students/favorites/:menuItemId
 * Remove a menu item from favorites.
 */
const removeFavorite = asyncHandler(async (req, res) => {
  const { menuItemId } = req.params;

  if (!menuItemId) {
    return res.status(400).json({
      success: false,
      message: 'menuItemId param is required'
    });
  }

  const removed = await Student.removeFromFavorites(req.user.id, menuItemId);

  if (!removed) {
    return res.status(404).json({
      success: false,
      message: 'Favorite not found'
    });
  }

  logger.info('Favorite removed', { student_id: req.user.id, menu_item_id: menuItemId });

  return res.status(200).json({
    success: true,
    message: 'Item removed from favorites'
  });
});

// ============================================================================
// GET STATS
// ============================================================================

/**
 * GET /api/students/stats
 * Return aggregated statistics for the authenticated student.
 */
const getStats = asyncHandler(async (req, res) => {
  const stats = await Student.getStats(req.user.id);

  if (!stats) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      total_orders: parseInt(stats.order_count, 10) || 0,
      total_spent: parseFloat(stats.lifetime_spent) || 0,
      points: stats.points || 0,
      tier: stats.tier,
      favorites_count: parseInt(stats.favorites_count, 10) || 0
    }
  });
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  getProfile,
  updateProfile,
  getPoints,
  getOrderHistory,
  getFavorites,
  addFavorite,
  removeFavorite,
  getStats
};
