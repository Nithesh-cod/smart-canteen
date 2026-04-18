// ============================================================================
// ORDER MODEL
// ============================================================================
// Database operations for orders and order_items tables
// ============================================================================

const { query, transaction } = require('../config/database');

// ============================================================================
// CREATE OPERATION
// ============================================================================

/**
 * Create a new order with items (Transaction)
 * @param {Object} orderData - Order data
 * @param {Array} items - Array of order items
 * @returns {Promise<Object>} Created order with items
 */
const create = async (orderData, items) => {
  return await transaction(async (client) => {
    // 1. Insert order — student_id is null for guest (no-login) checkouts
    const orderResult = await client.query(
      `INSERT INTO orders
       (student_id, order_number, total_amount, original_amount, points_used, points_earned,
        payment_status, payment_method, guest_name, guest_phone, guest_roll)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        orderData.student_id || null,
        orderData.order_number,
        orderData.total_amount,
        orderData.original_amount || orderData.total_amount,
        orderData.points_used || 0,
        orderData.points_earned || 0,
        orderData.payment_status || 'pending',
        orderData.payment_method || null,
        orderData.guest_name  || null,
        orderData.guest_phone || null,
        orderData.guest_roll  || null,
      ]
    );

    const order = orderResult.rows[0];

    // 2. Insert order items
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.menu_item_id, item.item_name, item.quantity, item.price]
      );
    }

    // 3. Get complete order with items using the SAME transaction client
    // (getById uses a separate pool connection and can't see uncommitted rows)
    const completeResult = await client.query(
      `SELECT
         o.*,
         COALESCE(s.name,        o.guest_name)  as student_name,
         COALESCE(s.roll_number, o.guest_roll)  as student_roll,
         COALESCE(s.phone,       o.guest_phone) as student_phone,
         s.points     as student_points,
         s.department as student_dept,
         COALESCE(
           json_agg(
             json_build_object(
               'id',           oi.id,
               'menu_item_id', oi.menu_item_id,
               'item_name',    oi.item_name,
               'quantity',     oi.quantity,
               'price',        oi.price
             ) ORDER BY oi.id
           ) FILTER (WHERE oi.id IS NOT NULL),
           '[]'::json
         ) as items
       FROM orders o
       LEFT JOIN students s ON o.student_id = s.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1
       GROUP BY o.id, s.name, s.roll_number, s.phone, s.points, s.department`,
      [order.id]
    );
    return completeResult.rows[0] || order;
  });
};

// ============================================================================
// FIND OPERATIONS
// ============================================================================

/**
 * Get order by ID with items and student info
 * @param {number} id - Order ID
 * @returns {Promise<Object|null>} Complete order object
 */
const getById = async (id) => {
  const result = await query(
    `SELECT
       o.*,
       COALESCE(s.name,        o.guest_name)  as student_name,
       COALESCE(s.roll_number, o.guest_roll)  as student_roll,
       COALESCE(s.phone,       o.guest_phone) as student_phone,
       s.points     as student_points,
       s.department as student_dept,
       COALESCE(
         json_agg(
           json_build_object(
             'id',          oi.id,
             'menu_item_id',oi.menu_item_id,
             'item_name',   oi.item_name,
             'quantity',    oi.quantity,
             'price',       oi.price
           ) ORDER BY oi.id
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) as items
     FROM orders o
     LEFT JOIN students s ON o.student_id = s.id
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.id = $1
     GROUP BY o.id, s.name, s.roll_number, s.phone, s.points, s.department`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Get order by order number
 * @param {string} orderNumber - Order number
 * @returns {Promise<Object|null>} Complete order object
 */
const getByOrderNumber = async (orderNumber) => {
  const result = await query(
    `SELECT
       o.*,
       COALESCE(s.name,        o.guest_name) as student_name,
       COALESCE(s.roll_number, o.guest_roll) as student_roll,
       COALESCE(
         json_agg(
           json_build_object(
             'item_name', oi.item_name,
             'quantity',  oi.quantity,
             'price',     oi.price
           ) ORDER BY oi.id
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) as items
     FROM orders o
     LEFT JOIN students s ON o.student_id = s.id
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.order_number = $1
     GROUP BY o.id, s.name, s.roll_number`,
    [orderNumber]
  );
  return result.rows[0] || null;
};

/**
 * Get orders by student ID
 * @param {string} studentId - Student UUID
 * @param {number} limit - Number of orders to return
 * @returns {Promise<Array>} Array of orders
 */
const getByStudent = async (studentId, limit = 50) => {
  const result = await query(
    `SELECT 
       o.*,
       json_agg(
         json_build_object(
           'item_name', oi.item_name,
           'quantity', oi.quantity,
           'price', oi.price
         )
       ) as items
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.student_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT $2`,
    [studentId, limit]
  );
  return result.rows;
};

/**
 * Get all orders with filters
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of orders
 */
const getAll = async (filters = {}) => {
  let queryText = `
    SELECT
      o.*,
      COALESCE(s.name,        o.guest_name) as student_name,
      COALESCE(s.roll_number, o.guest_roll) as student_roll,
      COALESCE(
        json_agg(
          json_build_object(
            'item_name', oi.item_name,
            'quantity',  oi.quantity,
            'price',     oi.price
          ) ORDER BY oi.id
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) as items
    FROM orders o
    LEFT JOIN students s ON o.student_id = s.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE 1=1
  `;
  
  const params = [];
  let paramCount = 1;

  // Apply filters
  if (filters.status) {
    queryText += ` AND o.status = $${paramCount++}`;
    params.push(filters.status);
  }
  
  if (filters.payment_status) {
    queryText += ` AND o.payment_status = $${paramCount++}`;
    params.push(filters.payment_status);
  }
  
  if (filters.from_date) {
    queryText += ` AND o.created_at >= $${paramCount++}`;
    params.push(filters.from_date);
  }
  
  if (filters.to_date) {
    queryText += ` AND o.created_at <= $${paramCount++}`;
    params.push(filters.to_date);
  }

  queryText += ` GROUP BY o.id, s.name, s.roll_number`;
  
  // Sorting
  if (filters.status && (filters.status === 'pending' || filters.status === 'preparing')) {
    queryText += ` ORDER BY o.created_at ASC`; // Oldest first for kitchen
  } else {
    queryText += ` ORDER BY o.created_at DESC`; // Newest first
  }
  
  // Pagination
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;
  queryText += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
  params.push(limit, offset);

  const result = await query(queryText, params);
  return result.rows;
};

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update order status
 * @param {number} id - Order ID
 * @param {string} status - New status
 * @returns {Promise<Object>} Updated order
 */
const updateStatus = async (id, status) => {
  let queryText = 'UPDATE orders SET status = $1';
  const params = [status, id];
  
  // Set completed_at timestamp if status is completed
  if (status === 'completed') {
    queryText += ', completed_at = NOW()';
  }
  
  queryText += ' WHERE id = $2 RETURNING *';
  
  const result = await query(queryText, params);
  return result.rows[0];
};

/**
 * Update payment information after successful payment
 * @param {number} id - Order ID
 * @param {Object} paymentData - Payment details
 * @returns {Promise<Object>} Updated order
 */
const updatePayment = async (id, paymentData) => {
  const result = await query(
    `UPDATE orders 
     SET payment_status = $1,
         payment_method = $2,
         razorpay_order_id = $3,
         razorpay_payment_id = $4,
         razorpay_signature = $5
     WHERE id = $6
     RETURNING *`,
    [
      paymentData.payment_status || 'paid',
      paymentData.payment_method || 'Razorpay',
      paymentData.razorpay_order_id,
      paymentData.razorpay_payment_id,
      paymentData.razorpay_signature,
      id
    ]
  );
  return result.rows[0];
};

/**
 * Cancel order
 * @param {number} id - Order ID
 * @returns {Promise<Object>} Updated order
 */
const cancel = async (id) => {
  const result = await query(
    `UPDATE orders 
     SET status = 'cancelled', 
         payment_status = CASE 
           WHEN payment_status = 'paid' THEN 'refunded' 
           ELSE payment_status 
         END
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return result.rows[0];
};

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get order statistics for dashboard
 * @param {Object} filters - Date filters
 * @returns {Promise<Object>} Statistics object
 */
const getStats = async (filters = {}) => {
  // Today's stats
  const todayResult = await query(
    `SELECT 
       COUNT(*) as order_count,
       COALESCE(SUM(total_amount), 0) as revenue
     FROM orders
     WHERE DATE(created_at) = CURRENT_DATE
     AND payment_status = 'paid'`
  );

  // This week's stats
  const weekResult = await query(
    `SELECT 
       COUNT(*) as order_count,
       COALESCE(SUM(total_amount), 0) as revenue
     FROM orders
     WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)
     AND payment_status = 'paid'`
  );

  // This month's stats
  const monthResult = await query(
    `SELECT 
       COUNT(*) as order_count,
       COALESCE(SUM(total_amount), 0) as revenue
     FROM orders
     WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
     AND payment_status = 'paid'`
  );

  // Status breakdown
  const statusResult = await query(
    `SELECT 
       status,
       COUNT(*) as count
     FROM orders
     WHERE DATE(created_at) = CURRENT_DATE
     GROUP BY status`
  );

  return {
    today: todayResult.rows[0],
    week: weekResult.rows[0],
    month: monthResult.rows[0],
    status_breakdown: statusResult.rows
  };
};

/**
 * Get revenue data for charts
 * @param {number} days - Number of days to include
 * @returns {Promise<Array>} Daily revenue data
 */
const getRevenueData = async (days = 30) => {
  const result = await query(
    `SELECT 
       DATE(created_at) as date,
       COUNT(*) as order_count,
       COALESCE(SUM(total_amount), 0) as revenue
     FROM orders
     WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
     AND payment_status = 'paid'
     GROUP BY DATE(created_at)
     ORDER BY date ASC`
  );
  return result.rows;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique order number
 * @returns {Promise<string>} Unique order number
 */
const generateOrderNumber = async () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `OZ${timestamp}${random}`;
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  create,
  getById,
  getByOrderNumber,
  getByStudent,
  getAll,
  updateStatus,
  updatePayment,
  cancel,
  getStats,
  getRevenueData,
  generateOrderNumber
};