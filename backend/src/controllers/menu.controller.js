// ============================================================================
// MENU CONTROLLER
// ============================================================================
// Menu item retrieval (public), creation, updates, availability toggling,
// deletion, and statistics (admin/chef).
// ============================================================================

const MenuItem = require('../models/MenuItem');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/error.middleware');

// ============================================================================
// GET ALL
// ============================================================================

/**
 * GET /api/menu
 * Public endpoint — returns every menu item regardless of availability.
 */
const getAll = asyncHandler(async (req, res) => {
  const items = await MenuItem.getAll();

  return res.status(200).json({
    success: true,
    data: items
  });
});

// ============================================================================
// GET AVAILABLE
// ============================================================================

/**
 * GET /api/menu/available
 * Public endpoint — returns only items where is_available = true.
 */
const getAvailable = asyncHandler(async (req, res) => {
  const items = await MenuItem.getAvailable();

  return res.status(200).json({
    success: true,
    data: items
  });
});

// ============================================================================
// GET BY CATEGORY
// ============================================================================

/**
 * GET /api/menu/category/:category
 * Public endpoint — returns available items filtered by category.
 * Param: category  (e.g. starters, mains, desserts, beverages)
 */
const getByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params;

  if (!category) {
    return res.status(400).json({
      success: false,
      message: 'category param is required'
    });
  }

  const items = await MenuItem.getByCategory(category.toLowerCase());

  return res.status(200).json({
    success: true,
    data: items
  });
});

// ============================================================================
// SEARCH
// ============================================================================

/**
 * GET /api/menu/search?q=<term>
 * Public endpoint — searches available items by name (case-insensitive LIKE).
 */
const search = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Query param q is required'
    });
  }

  const items = await MenuItem.search(q.trim());

  return res.status(200).json({
    success: true,
    data: items
  });
});

// ============================================================================
// GET BY ID
// ============================================================================

/**
 * GET /api/menu/:id
 * Public endpoint — returns a single menu item.
 */
const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const item = await MenuItem.getById(id);

  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'Menu item not found'
    });
  }

  return res.status(200).json({
    success: true,
    data: item
  });
});

// ============================================================================
// CREATE
// ============================================================================

/**
 * POST /api/menu
 * Admin only — create a new menu item.
 * Body: { name, category, price, description?, image_url?, is_vegetarian?, preparation_time? }
 */
const create = asyncHandler(async (req, res) => {
  const { name, category, price, description, image_url, is_vegetarian, preparation_time, stock_quantity } = req.body;

  // Required field validation
  if (!name || !category || price === undefined || price === null) {
    return res.status(400).json({
      success: false,
      message: 'name, category, and price are required'
    });
  }

  if (isNaN(parseFloat(price)) || parseFloat(price) < 0) {
    return res.status(400).json({
      success: false,
      message: 'price must be a non-negative number'
    });
  }

  const item = await MenuItem.create({
    name: name.trim(),
    category: category.trim().toLowerCase(),
    price: parseFloat(price),
    description: description ? description.trim() : null,
    image_url: image_url ? image_url.trim() : null,
    is_vegetarian: is_vegetarian !== undefined ? Boolean(is_vegetarian) : true,
    preparation_time: preparation_time ? parseInt(preparation_time, 10) : 10,
    stock_quantity: stock_quantity !== undefined ? parseInt(stock_quantity, 10) : -1
  });

  logger.success('Menu item created', { id: item.id, name: item.name });

  return res.status(201).json({
    success: true,
    data: item
  });
});

// ============================================================================
// UPDATE
// ============================================================================

/**
 * PUT /api/menu/:id
 * Admin only — update any fields on a menu item.
 * Body: any subset of { name, description, category, price, image_url, is_vegetarian, preparation_time, rating }
 */
const update = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Confirm item exists
  const existing = await MenuItem.getById(id);
  if (!existing) {
    return res.status(404).json({
      success: false,
      message: 'Menu item not found'
    });
  }

  // Pass the whole body; the model only picks known fields
  const { name, description, category, price, image_url, is_vegetarian, preparation_time, rating, stock_quantity } = req.body;

  const updateData = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description;
  if (category !== undefined) updateData.category = category.trim().toLowerCase();
  if (price !== undefined) updateData.price = parseFloat(price);
  if (image_url !== undefined) updateData.image_url = image_url;
  if (is_vegetarian !== undefined) updateData.is_vegetarian = Boolean(is_vegetarian);
  if (preparation_time !== undefined) updateData.preparation_time = parseInt(preparation_time, 10);
  if (rating !== undefined) updateData.rating = parseFloat(rating);
  if (stock_quantity !== undefined) updateData.stock_quantity = parseInt(stock_quantity, 10);

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No updatable fields provided'
    });
  }

  const updated = await MenuItem.update(id, updateData);

  // Broadcast changes so all connected panels (chef, owner, kiosk) update live
  const io = req.app.get('io');
  if (io) {
    // Full item update — used by chef display and owner panel
    io.emit('menu:item-updated', updated);

    // Dedicated stock event — used by student kiosk
    if (updateData.stock_quantity !== undefined) {
      io.emit('menu:stock-updated', {
        id:             updated.id,
        stock_quantity: updated.stock_quantity,
        is_available:   updated.is_available,
      });
    }
  }

  logger.info('Menu item updated', { id });

  return res.status(200).json({
    success: true,
    data: updated
  });
});

// ============================================================================
// TOGGLE AVAILABILITY
// ============================================================================

/**
 * PATCH /api/menu/:id/availability
 * Chef or Admin — flip the is_available flag on a menu item.
 * Broadcasts the change via Socket.IO so connected clients update in real time.
 */
const toggleAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Fetch current state
  const existing = await MenuItem.getById(id);
  if (!existing) {
    return res.status(404).json({
      success: false,
      message: 'Menu item not found'
    });
  }

  // Flip the flag
  const newAvailability = !existing.is_available;
  const updated = await MenuItem.toggleAvailability(id, newAvailability);

  // Emit real-time event to all connected clients
  const io = req.app.get('io');
  if (io) {
    io.emit('menu:availability-changed', {
      id: updated.id,
      name: updated.name,
      is_available: updated.is_available
    });
  }

  logger.info('Menu item availability toggled', {
    id,
    name: updated.name,
    is_available: updated.is_available
  });

  return res.status(200).json({
    success: true,
    data: updated
  });
});

// ============================================================================
// DELETE
// ============================================================================

/**
 * DELETE /api/menu/:id
 * Admin only — permanently remove a menu item.
 */
const deleteItem = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Confirm item exists before attempting delete
  const existing = await MenuItem.getById(id);
  if (!existing) {
    return res.status(404).json({
      success: false,
      message: 'Menu item not found'
    });
  }

  const deleted = await MenuItem.deleteItem(id);

  if (!deleted) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete menu item'
    });
  }

  logger.info('Menu item deleted', { id, name: existing.name });

  return res.status(204).send();
});

// ============================================================================
// GET STATS
// ============================================================================

/**
 * GET /api/menu/stats
 * Admin only — return top-selling items (last 30 days) and per-category stats.
 */
const getStats = asyncHandler(async (req, res) => {
  const [topSelling, categoryStats] = await Promise.all([
    MenuItem.getTopSelling(10),
    MenuItem.getCategoryStats()
  ]);

  return res.status(200).json({
    success: true,
    data: {
      top_selling: topSelling,
      category_stats: categoryStats
    }
  });
});

// ============================================================================
// GET TOP SELLING  (used by /api/menu/stats/top-selling route)
// ============================================================================

/**
 * GET /api/menu/stats/top-selling
 * Admin only — return top-selling items.
 */
const getTopSelling = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const topSelling = await MenuItem.getTopSelling(limit);
  return res.status(200).json({
    success: true,
    data: { top_selling: topSelling }
  });
});

// ============================================================================
// GET CATEGORY STATS  (used by /api/menu/stats/category route)
// ============================================================================

/**
 * GET /api/menu/stats/category
 * Admin only — return per-category statistics.
 */
const getCategoryStats = asyncHandler(async (req, res) => {
  const categoryStats = await MenuItem.getCategoryStats();
  return res.status(200).json({
    success: true,
    data: { category_stats: categoryStats }
  });
});

// ============================================================================
// GET ACTIVE OFFERS (public — student kiosk)
// ============================================================================

const { query: dbQuery } = require('../config/database');

/**
 * GET /api/menu/offers
 * Public — returns offers that are currently active and within their validity window.
 */
const getActiveOffers = asyncHandler(async (req, res) => {
  const result = await dbQuery(
    `SELECT * FROM offers
     WHERE is_active = true
       AND valid_from  <= NOW()
       AND valid_until >= NOW()
     ORDER BY created_at DESC`
  );
  return res.json({ success: true, data: result.rows });
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  getAll,
  getAvailable,
  getByCategory,
  search,
  getById,
  create,
  update,
  toggleAvailability,
  deleteItem,
  getStats,
  getTopSelling,
  getCategoryStats,
  getActiveOffers,
};
