// ============================================================================
// ORDER CONTROLLER
// ============================================================================
// Handles all order-related HTTP requests:
// create, getById, getAll, updateStatus, cancel, track, getStats
// ============================================================================

const Order    = require('../models/Order');
const Student  = require('../models/Student');
const MenuItem = require('../models/MenuItem');
const logger   = require('../utils/logger');
const { asyncHandler }                  = require('../middleware/error.middleware');
const { calculatePoints, generateOrderNumber } = require('../utils/helpers');

// Valid status transition map
const VALID_TRANSITIONS = {
  pending:   ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready:     ['completed'],
  completed: [],
  cancelled: []
};

// ============================================================================
// CREATE ORDER
// ============================================================================
/**
 * POST /api/orders
 * Body: { items: [{ menu_item_id, quantity }], points_to_redeem: 0 }
 * Auth: student
 */
const create = asyncHandler(async (req, res) => {
  const { items, points_to_redeem = 0 } = req.body;
  const studentId = req.user.id;

  // Basic validation
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Order must contain at least one item'
    });
  }

  // Validate each item and build the server-authoritative item list
  const orderItems    = [];
  let   originalAmount = 0;

  for (const requestedItem of items) {
    const { menu_item_id, quantity } = requestedItem;

    if (!menu_item_id || !quantity || parseInt(quantity) < 1) {
      return res.status(400).json({
        success: false,
        message: 'Each item must have a valid menu_item_id and quantity >= 1'
      });
    }

    const menuItem = await MenuItem.getById(menu_item_id);

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: `Menu item with ID ${menu_item_id} not found`
      });
    }

    if (!menuItem.is_available) {
      return res.status(400).json({
        success: false,
        message: `"${menuItem.name}" is currently not available`
      });
    }

    // Stock check: stock_quantity of -1 means unlimited; 0 or above is tracked
    const stock = menuItem.stock_quantity;
    if (stock !== null && stock !== undefined && stock !== -1) {
      if (stock < parseInt(quantity)) {
        return res.status(400).json({
          success: false,
          message: stock === 0
            ? `"${menuItem.name}" is out of stock`
            : `"${menuItem.name}" only has ${stock} left in stock`
        });
      }
    }

    const lineTotal  = parseFloat(menuItem.price) * parseInt(quantity);
    originalAmount  += lineTotal;

    orderItems.push({
      menu_item_id: menuItem.id,
      item_name:    menuItem.name,
      quantity:     parseInt(quantity),
      price:        parseFloat(menuItem.price)
    });
  }

  // Points discount (1 point = ₹0.10; max 50% of original amount)
  let pointsUsed  = 0;
  let totalAmount = originalAmount;

  if (points_to_redeem > 0) {
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (student.points < points_to_redeem) {
      return res.status(400).json({
        success: false,
        message: `Insufficient points. You have ${student.points} points but requested ${points_to_redeem}`
      });
    }

    const maxDiscountAmount = originalAmount * 0.5;
    const requestedDiscount = points_to_redeem * 0.10;
    const actualDiscount    = Math.min(requestedDiscount, maxDiscountAmount);

    pointsUsed  = Math.floor(actualDiscount / 0.10); // actual points consumed
    totalAmount = originalAmount - actualDiscount;
  }

  // Points earned = 10% of the final (discounted) amount
  const pointsEarned = calculatePoints(totalAmount);
  const orderNumber  = generateOrderNumber();

  const orderData = {
    student_id:      studentId,
    order_number:    orderNumber,
    total_amount:    parseFloat(totalAmount.toFixed(2)),
    original_amount: parseFloat(originalAmount.toFixed(2)),
    points_used:     pointsUsed,
    points_earned:   pointsEarned,
    payment_status:  'pending',
    payment_method:  null
  };

  const newOrder = await Order.create(orderData, orderItems);

  // Decrement stock for each ordered item (items with tracked stock only)
  const io = req.app.get('io');
  for (const item of orderItems) {
    try {
      const updated = await MenuItem.decrementStock(item.menu_item_id, item.quantity);
      if (updated) {
        // Auto-mark unavailable when stock reaches 0
        if (updated.stock_quantity === 0) {
          await MenuItem.toggleAvailability(updated.id, false);
          if (io) {
            io.emit('menu:availability-changed', { ...updated, is_available: false });
          }
        }
        if (io) {
          io.emit('menu:stock-updated', {
            id: updated.id,
            stock_quantity: updated.stock_quantity,
            is_available: updated.stock_quantity === 0 ? false : updated.is_available
          });
        }
      }
    } catch (e) {
      console.warn('⚠️  Stock decrement warning for item', item.menu_item_id, ':', e.message);
    }
  }

  // Emit real-time event to kitchen / admin
  if (io) {
    io.emit('order:created', {
      id:           newOrder.id,
      order_number: newOrder.order_number,
      student_id:   studentId,
      student_name: newOrder.student_name,
      items:        newOrder.items,
      total_amount: newOrder.total_amount,
      status:       newOrder.status,
      created_at:   newOrder.created_at
    });
  }

  logger.success(`Order created: #${newOrder.order_number} for student ${studentId}`);

  return res.status(201).json({
    success: true,
    data: {
      order:            newOrder,
      points_earned:    pointsEarned,
      points_used:      pointsUsed,
      discount_applied: parseFloat((originalAmount - totalAmount).toFixed(2))
    }
  });
});

// ============================================================================
// GET ORDER BY ID
// ============================================================================
/**
 * GET /api/orders/:id
 * Auth: student (own only) | chef | admin
 */
const getById = asyncHandler(async (req, res) => {
  const orderId         = parseInt(req.params.id);
  const { id: userId, role } = req.user;

  if (isNaN(orderId)) {
    return res.status(400).json({ success: false, message: 'Invalid order ID' });
  }

  const order = await Order.getById(orderId);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  // Students may only access their own orders
  if (role === 'student' && order.student_id !== userId) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  return res.json({ success: true, data: { order } });
});

// ============================================================================
// GET ALL ORDERS (role-filtered)
// ============================================================================
/**
 * GET /api/orders
 * Auth: student | chef | admin
 * Query (admin): status, payment_status, from_date, to_date, limit, page
 */
const getAll = asyncHandler(async (req, res) => {
  const { id: userId, role } = req.user;

  // --- Student: own orders only ---
  if (role === 'student') {
    const limit  = parseInt(req.query.limit) || 50;
    const orders = await Order.getByStudent(userId, limit);
    return res.json({ success: true, data: { orders, total: orders.length } });
  }

  // --- Chef: kitchen-relevant statuses (pending / preparing / ready) ---
  if (role === 'chef') {
    const statusFilter = req.query.status;
    const allOrders    = await Order.getAll({ limit: 200, offset: 0 });

    const kitchenOrders = statusFilter
      ? allOrders.filter(o => o.status === statusFilter)
      : allOrders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status));

    return res.json({
      success: true,
      data: { orders: kitchenOrders, total: kitchenOrders.length }
    });
  }

  // --- Admin: full filter support ---
  const {
    status,
    payment_status,
    from_date,
    to_date,
    limit = 50,
    page  = 1
  } = req.query;

  const parsedLimit  = parseInt(limit);
  const parsedOffset = (parseInt(page) - 1) * parsedLimit;

  const filters = {
    status:         status         || undefined,
    payment_status: payment_status || undefined,
    from_date:      from_date      || undefined,
    to_date:        to_date        || undefined,
    limit:          parsedLimit,
    offset:         parsedOffset
  };

  const orders = await Order.getAll(filters);

  return res.json({
    success: true,
    data: {
      orders,
      total: orders.length,
      page:  parseInt(page),
      limit: parsedLimit
    }
  });
});

// ============================================================================
// UPDATE ORDER STATUS
// ============================================================================
/**
 * PATCH /api/orders/:id/status
 * Body: { status }
 * Auth: chef | admin
 */
const updateStatus = asyncHandler(async (req, res) => {
  const orderId    = parseInt(req.params.id);
  const { status } = req.body;

  if (isNaN(orderId)) {
    return res.status(400).json({ success: false, message: 'Invalid order ID' });
  }

  if (!status) {
    return res.status(400).json({ success: false, message: 'New status is required' });
  }

  const order = await Order.getById(orderId);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const allowedTransitions = VALID_TRANSITIONS[order.status] || [];
  if (!allowedTransitions.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot transition from "${order.status}" to "${status}". Allowed transitions: [${allowedTransitions.join(', ')}]`
    });
  }

  const updatedOrder = await Order.updateStatus(orderId, status);

  // Socket notifications
  const io = req.app.get('io');
  if (io) {
    const statusPayload = {
      orderId:     order.id,
      orderNumber: order.order_number,
      status,
      studentId:   order.student_id,
      message:     getStatusMessage(status),
      timestamp:   new Date().toISOString()
    };

    // Notify the student in their personal room
    io.to(`student:${order.student_id}`).emit('order:status-change', statusPayload);

    // Notify kitchen and admin rooms
    io.to('kitchen').emit('order:updated', statusPayload);
    io.to('admin').emit('order:updated', statusPayload);

    // Sound alert when order is ready for pickup
    if (status === 'ready') {
      io.to(`student:${order.student_id}`).emit('order:ready-alert', {
        orderId:     order.id,
        orderNumber: order.order_number,
        message:     'Your order is ready for pickup!',
        sound:       true,
        timestamp:   new Date().toISOString()
      });
    }
  }

  logger.success(`Order #${order.order_number} status changed to "${status}"`);

  return res.json({ success: true, data: { order: updatedOrder } });
});

// ============================================================================
// CANCEL ORDER
// ============================================================================
/**
 * POST /api/orders/:id/cancel
 * Body: { reason? }
 * Auth: student (pending only) | admin (any non-completed/cancelled)
 */
const cancel = asyncHandler(async (req, res) => {
  const orderId              = parseInt(req.params.id);
  const { id: userId, role } = req.user;
  const reason               = req.body.reason || 'Cancelled by user';

  if (isNaN(orderId)) {
    return res.status(400).json({ success: false, message: 'Invalid order ID' });
  }

  const order = await Order.getById(orderId);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  if (role === 'student') {
    if (order.student_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'You can only cancel orders that are still pending'
      });
    }
  } else if (role === 'admin') {
    if (['completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel an order that is already "${order.status}"`
      });
    }
  } else {
    // chefs are not allowed to cancel
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  const cancelledOrder = await Order.cancel(orderId);

  // Socket notifications
  const io = req.app.get('io');
  if (io) {
    const cancelPayload = {
      orderId:     order.id,
      orderNumber: order.order_number,
      studentId:   order.student_id,
      reason,
      message:     'Your order has been cancelled',
      timestamp:   new Date().toISOString()
    };

    io.to(`student:${order.student_id}`).emit('order:cancelled', cancelPayload);
    io.to('kitchen').emit('order:cancelled', cancelPayload);
    io.to('admin').emit('order:cancelled', cancelPayload);
  }

  logger.warn(`Order #${order.order_number} cancelled — reason: ${reason}`);

  return res.json({ success: true, data: { order: cancelledOrder } });
});

// ============================================================================
// TRACK ORDER (PUBLIC)
// ============================================================================
/**
 * GET /api/orders/track/:orderNumber
 * Public — no auth required; sensitive payment fields are stripped
 */
const track = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;

  if (!orderNumber) {
    return res.status(400).json({ success: false, message: 'Order number is required' });
  }

  const order = await Order.getByOrderNumber(orderNumber);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  // Remove sensitive fields before responding
  const {
    razorpay_order_id,    // eslint-disable-line no-unused-vars
    razorpay_payment_id,  // eslint-disable-line no-unused-vars
    razorpay_signature,   // eslint-disable-line no-unused-vars
    student_phone,        // eslint-disable-line no-unused-vars
    student_points,       // eslint-disable-line no-unused-vars
    ...safeOrder
  } = order;

  // Return order directly as data (consistent with all other order endpoints)
  return res.json({ success: true, data: safeOrder });
});

// ============================================================================
// ORDER STATISTICS (ADMIN)
// ============================================================================
/**
 * GET /api/orders/stats
 * Auth: admin
 */
const getStats = asyncHandler(async (req, res) => {
  const stats        = await Order.getStats();
  const topItems     = await MenuItem.getTopSelling(5);
  const recentOrders = await Order.getAll({ limit: 10, offset: 0 });

  return res.json({
    success: true,
    data: {
      today: {
        revenue:     parseFloat(stats.today.revenue),
        order_count: parseInt(stats.today.order_count)
      },
      week: {
        revenue:     parseFloat(stats.week.revenue),
        order_count: parseInt(stats.week.order_count)
      },
      month: {
        revenue:     parseFloat(stats.month.revenue),
        order_count: parseInt(stats.month.order_count)
      },
      status_breakdown: stats.status_breakdown,
      top_items:        topItems,
      recent_orders:    recentOrders
    }
  });
});

// ============================================================================
// INTERNAL HELPER
// ============================================================================
const getStatusMessage = (status) => {
  const messages = {
    pending:   'Your order has been received',
    preparing: 'Your order is being prepared',
    ready:     'Your order is ready for pickup!',
    completed: 'Order completed. Thank you!',
    cancelled: 'Your order has been cancelled'
  };
  return messages[status] || 'Order status updated';
};

// ============================================================================
// EXPORTS
// ============================================================================
// ============================================================================
// GET REVENUE DATA
// ============================================================================
/**
 * GET /api/orders/stats/revenue
 * Admin only — revenue aggregated by day for the last N days.
 */
const getRevenueData = asyncHandler(async (req, res) => {
  const days   = parseInt(req.query.days) || 30;
  const orders = await Order.getAll({ payment_status: 'paid', limit: 1000, offset: 0 });

  // Group revenue by date
  const revenueByDate = {};
  const now = Date.now();
  for (const o of orders) {
    const created = new Date(o.created_at);
    if ((now - created.getTime()) / 86400000 > days) continue;
    const dateKey = created.toISOString().split('T')[0];
    if (!revenueByDate[dateKey]) revenueByDate[dateKey] = { date: dateKey, revenue: 0, orders: 0 };
    revenueByDate[dateKey].revenue += parseFloat(o.total_amount || 0);
    revenueByDate[dateKey].orders  += 1;
  }

  const data = Object.values(revenueByDate).sort((a, b) => a.date.localeCompare(b.date));

  return res.json({ success: true, data });
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  create,
  getById,
  getAll,
  updateStatus,
  cancel,
  track,
  getStats,
  getRevenueData
};
