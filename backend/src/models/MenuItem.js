// ============================================================================
// MENU ITEM MODEL
// ============================================================================
// Database operations for menu_items table
// ============================================================================

const { query } = require('../config/database');

// ============================================================================
// FIND OPERATIONS
// ============================================================================

/**
 * Get all menu items
 * @returns {Promise<Array>} Array of all menu items
 */
const getAll = async () => {
  const result = await query(
    'SELECT * FROM menu_items ORDER BY category, name'
  );
  return result.rows;
};

/**
 * Get only available menu items
 * @returns {Promise<Array>} Array of available menu items
 */
const getAvailable = async () => {
  const result = await query(
    'SELECT * FROM menu_items WHERE is_available = true ORDER BY category, name'
  );
  return result.rows;
};

/**
 * Get menu items by category
 * @param {string} category - Category name (starters, mains, desserts, beverages)
 * @returns {Promise<Array>} Array of menu items
 */
const getByCategory = async (category) => {
  const result = await query(
    'SELECT * FROM menu_items WHERE category = $1 AND is_available = true ORDER BY name',
    [category]
  );
  return result.rows;
};

/**
 * Get single menu item by ID
 * @param {number} id - Menu item ID
 * @returns {Promise<Object|null>} Menu item or null
 */
const getById = async (id) => {
  const result = await query(
    'SELECT * FROM menu_items WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Search menu items by name
 * @param {string} searchTerm - Search term
 * @returns {Promise<Array>} Array of matching menu items
 */
const search = async (searchTerm) => {
  const result = await query(
    `SELECT * FROM menu_items 
     WHERE LOWER(name) LIKE LOWER($1) 
     AND is_available = true 
     ORDER BY rating DESC`,
    [`%${searchTerm}%`]
  );
  return result.rows;
};

// ============================================================================
// CREATE OPERATION
// ============================================================================

/**
 * Create a new menu item (Admin only)
 * @param {Object} itemData - Menu item data
 * @returns {Promise<Object>} Created menu item
 */
const create = async ({
  name,
  description,
  category,
  price,
  image_url,
  is_vegetarian,
  preparation_time,
  stock_quantity
}) => {
  const result = await query(
    `INSERT INTO menu_items
     (name, description, category, price, image_url, is_vegetarian, preparation_time, stock_quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [name, description || null, category, price, image_url || null, is_vegetarian || true, preparation_time || 10, stock_quantity !== undefined ? stock_quantity : -1]
  );
  return result.rows[0];
};

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update menu item (Admin only)
 * @param {number} id - Menu item ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated menu item
 */
const update = async (id, data) => {
  const fields = [];
  const values = [];
  let paramCount = 1;

  // Build dynamic UPDATE query
  if (data.name !== undefined) {
    fields.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push(`description = $${paramCount++}`);
    values.push(data.description);
  }
  if (data.category !== undefined) {
    fields.push(`category = $${paramCount++}`);
    values.push(data.category);
  }
  if (data.price !== undefined) {
    fields.push(`price = $${paramCount++}`);
    values.push(data.price);
  }
  if (data.image_url !== undefined) {
    fields.push(`image_url = $${paramCount++}`);
    values.push(data.image_url);
  }
  if (data.is_vegetarian !== undefined) {
    fields.push(`is_vegetarian = $${paramCount++}`);
    values.push(data.is_vegetarian);
  }
  if (data.preparation_time !== undefined) {
    fields.push(`preparation_time = $${paramCount++}`);
    values.push(data.preparation_time);
  }
  if (data.rating !== undefined) {
    fields.push(`rating = $${paramCount++}`);
    values.push(data.rating);
  }
  if (data.stock_quantity !== undefined) {
    fields.push(`stock_quantity = $${paramCount++}`);
    values.push(data.stock_quantity);
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(id);
  const result = await query(
    `UPDATE menu_items SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
};

/**
 * Toggle item availability (Chef/Admin)
 * @param {number} id - Menu item ID
 * @param {boolean} isAvailable - Availability status
 * @returns {Promise<Object>} Updated menu item
 */
const toggleAvailability = async (id, isAvailable) => {
  const result = await query(
    'UPDATE menu_items SET is_available = $1 WHERE id = $2 RETURNING *',
    [isAvailable, id]
  );
  return result.rows[0];
};

// ============================================================================
// DELETE OPERATION
// ============================================================================

/**
 * Delete menu item (Admin only)
 * @param {number} id - Menu item ID
 * @returns {Promise<boolean>} Success status
 */
const deleteItem = async (id) => {
  const result = await query(
    'DELETE FROM menu_items WHERE id = $1',
    [id]
  );
  return result.rowCount > 0;
};

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get top-selling items
 * @param {number} limit - Number of items to return
 * @returns {Promise<Array>} Top selling items
 */
const getTopSelling = async (limit = 10) => {
  const result = await query(
    `SELECT 
       m.id,
       m.name,
       m.category,
       m.price,
       m.image_url,
       COUNT(oi.id) as order_count,
       SUM(oi.quantity) as total_quantity,
       SUM(oi.price * oi.quantity) as total_revenue
     FROM menu_items m
     INNER JOIN order_items oi ON m.id = oi.menu_item_id
     INNER JOIN orders o ON oi.order_id = o.id
     WHERE o.payment_status = 'paid'
     AND o.created_at >= NOW() - INTERVAL '30 days'
     GROUP BY m.id, m.name, m.category, m.price, m.image_url
     ORDER BY order_count DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

/**
 * Get menu statistics by category
 * @returns {Promise<Array>} Category statistics
 */
const getCategoryStats = async () => {
  const result = await query(
    `SELECT 
       category,
       COUNT(*) as item_count,
       AVG(price) as avg_price,
       MIN(price) as min_price,
       MAX(price) as max_price
     FROM menu_items
     WHERE is_available = true
     GROUP BY category
     ORDER BY category`
  );
  return result.rows;
};

// ============================================================================
// BULK OPERATIONS
// ============================================================================

// ============================================================================
// STOCK OPERATIONS
// ============================================================================

/**
 * Decrement stock quantity for an item after order placement.
 * Only decrements if stock is tracked (stock_quantity >= 0, not -1 = unlimited).
 * Uses GREATEST(0, ...) so it never goes negative.
 * @param {number} id - Menu item ID
 * @param {number} quantity - Amount to decrement
 * @returns {Promise<Object|null>} Updated menu item, or null if not tracked / not found
 */
const decrementStock = async (id, quantity) => {
  const result = await query(
    `UPDATE menu_items
     SET stock_quantity = GREATEST(0, stock_quantity - $1)
     WHERE id = $2 AND stock_quantity IS NOT NULL AND stock_quantity <> -1
     RETURNING *`,
    [quantity, id]
  );
  return result.rows[0] || null;
};

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk update availability (e.g., mark all items unavailable)
 * @param {Array<number>} ids - Array of menu item IDs
 * @param {boolean} isAvailable - Availability status
 * @returns {Promise<number>} Number of items updated
 */
const bulkUpdateAvailability = async (ids, isAvailable) => {
  const result = await query(
    'UPDATE menu_items SET is_available = $1 WHERE id = ANY($2::int[])',
    [isAvailable, ids]
  );
  return result.rowCount;
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  getAll,
  getAvailable,
  getByCategory,
  getById,
  search,
  create,
  update,
  toggleAvailability,
  deleteItem,
  decrementStock,
  getTopSelling,
  getCategoryStats,
  bulkUpdateAvailability
};