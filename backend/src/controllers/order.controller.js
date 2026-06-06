// ============================================================================
// ORDER CONTROLLER
// ============================================================================
// Handles all order-related HTTP requests:
// create, getById, getAll, updateStatus, cancel, track, getStats
// ============================================================================

const Order          = require('../models/Order');
const Student        = require('../models/Student');
const MenuItem       = require('../models/MenuItem');
const printerService = require('../services/printer.service');
const razorpayService = require('../services/razorpay.service');
const logger         = require('../utils/logger');
const { query, transaction } = require('../config/database');
const { asyncHandler }                  = require('../middleware/error.middleware');
const { issueGuestToken }               = require('../middleware/auth.middleware');
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
  const {
    items,
    points_to_redeem = 0,
    // Guest checkout fields — sent when student is not logged in
    guest_name,
    guest_phone,
    guest_roll
  } = req.body;

  // req.user is null for guest orders (optionalAuth middleware)
  const isGuest   = !req.user;
  const studentId = isGuest ? null : req.user.id;

  // Guest must supply at least a name
  if (isGuest && !guest_name) {
    return res.status(400).json({
      success: false,
      message: 'guest_name is required for guest checkout'
    });
  }

  // Basic validation
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Order must contain at least one item'
    });
  }

  // Validate each item and build the server-authoritative item list.
  // The transactional UPDATE inside Order.create is the authoritative stock
  // check (FIX H4), so the pre-flight only fast-fails on bad ids or items
  // marked unavailable. Menu rows are fetched in a single batched query —
  // the previous per-item MenuItem.getById was N+1.
  const ids = [];
  for (const requestedItem of items) {
    const { menu_item_id, quantity } = requestedItem;
    if (!menu_item_id || !quantity || parseInt(quantity) < 1) {
      return res.status(400).json({
        success: false,
        message: 'Each item must have a valid menu_item_id and quantity >= 1'
      });
    }
    ids.push(parseInt(menu_item_id));
  }

  const { rows: menuRows } = await query(
    'SELECT id, name, price, is_available FROM menu_items WHERE id = ANY($1::int[])',
    [ids]
  );
  const menuMap = new Map(menuRows.map(r => [r.id, r]));

  const orderItems    = [];
  let   originalAmount = 0;

  for (const requestedItem of items) {
    const menuItemId = parseInt(requestedItem.menu_item_id);
    const quantity   = parseInt(requestedItem.quantity);
    const menuItem   = menuMap.get(menuItemId);

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: `Menu item with ID ${menuItemId} not found`
      });
    }

    if (!menuItem.is_available) {
      return res.status(400).json({
        success: false,
        message: `"${menuItem.name}" is currently not available`
      });
    }

    const lineTotal  = parseFloat(menuItem.price) * quantity;
    originalAmount  += lineTotal;

    orderItems.push({
      menu_item_id: menuItem.id,
      item_name:    menuItem.name,
      quantity,
      price:        parseFloat(menuItem.price)
    });
  }

  // Points discount — only for logged-in students
  let pointsUsed  = 0;
  let totalAmount = originalAmount;

  if (!isGuest && points_to_redeem > 0) {
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

    // Work in paise (integers) — float math on 0.10 produces off-by-one
     // results because 0.1 is not exactly representable in IEEE-754.
    // 1 pt = 10 paise; cap discount at 50% of order total.
    const originalPaise     = Math.round(originalAmount * 100);
    const maxDiscountPaise  = Math.floor(originalPaise / 2);
    const requestedPaise    = points_to_redeem * 10;
    const actualDiscPaise   = Math.min(requestedPaise, maxDiscountPaise);

    pointsUsed  = Math.floor(actualDiscPaise / 10);
    totalAmount = (originalPaise - actualDiscPaise) / 100;
  }

  // Points earned — only for logged-in students
  const pointsEarned = isGuest ? 0 : calculatePoints(totalAmount);
  const orderNumber  = generateOrderNumber();

  const orderData = {
    student_id:      studentId,
    order_number:    orderNumber,
    total_amount:    parseFloat(totalAmount.toFixed(2)),
    original_amount: parseFloat(originalAmount.toFixed(2)),
    points_used:     pointsUsed,
    points_earned:   pointsEarned,
    payment_status:  'pending',
    payment_method:  null,
    // Guest fields (null for logged-in students)
    guest_name:  isGuest ? (guest_name  || null) : null,
    guest_phone: isGuest ? (guest_phone || null) : null,
    guest_roll:  isGuest ? (guest_roll  || null) : null
  };

  // Order.create now atomically decrements stock inside the transaction
  // (FIX H4). If any item is short, it throws with .status = 400 — let
  // asyncHandler propagate that to the global error middleware.
  const newOrder = await Order.create(orderData, orderItems);

  // Broadcast post-commit stock updates so kiosks/chef screens stay in sync.
  // _stockChanges is attached by Order.create() and only used here; it is
  // not persisted to the DB.
  const io = req.app.get('io');
  if (io && Array.isArray(newOrder._stockChanges)) {
    for (const row of newOrder._stockChanges) {
      if (row.stock_quantity === 0) {
        io.emit('menu:availability-changed', { ...row, is_available: false });
      }
      io.emit('menu:stock-updated', {
        id: row.id,
        stock_quantity: row.stock_quantity,
        is_available: row.is_available
      });
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

  logger.success(`Order created: #${newOrder.order_number} for ${isGuest ? `guest ${guest_name}` : `student ${studentId}`}`);

  // Guest checkout: hand the client a short-lived token scoped to this order
  // so /payments/create and /payments/verify can verify ownership without
  // requiring a student login (FIX C2 — IDOR on payment endpoints).
  const guestToken = isGuest ? issueGuestToken(newOrder.id) : null;

  return res.status(201).json({
    success: true,
    data: {
      order:            newOrder,
      points_earned:    pointsEarned,
      points_used:      pointsUsed,
      discount_applied: parseFloat((originalAmount - totalAmount).toFixed(2)),
      ...(guestToken ? { guest_token: guestToken } : {})
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
    const { orders: allOrders } = await Order.getAll({ limit: 200, offset: 0 });

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

  const { orders, total } = await Order.getAll(filters);

  return res.json({
    success: true,
    data: {
      orders,
      total,
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

    // Notify the student in their personal room (logged-in students)
    if (order.student_id) {
      io.to(`student:${order.student_id}`).emit('order:status-change', statusPayload);
    }
    // Always fan out on the per-order room so guests + tracking page get it.
    io.to(`order:${order.id}`).emit('order:status-change', statusPayload);

    // Notify kitchen and admin rooms
    io.to('kitchen').emit('order:updated', statusPayload);
    io.to('admin').emit('order:updated', statusPayload);

    // Sound alert when order is ready for pickup
    if (status === 'ready') {
      const readyPayload = {
        orderId:     order.id,
        orderNumber: order.order_number,
        message:     'Your order is ready for pickup!',
        sound:       true,
        timestamp:   new Date().toISOString()
      };
      if (order.student_id) {
        io.to(`student:${order.student_id}`).emit('order:ready-alert', readyPayload);
      }
      io.to(`order:${order.id}`).emit('order:ready-alert', readyPayload);
    }
  }

  // ── Print receipt when chef marks order as "ready" ────────────────────────
  // The physical receipt is handed to the student when they collect their food.
  if (status === 'ready') {
    setImmediate(async () => {
      try {
        const completeOrder = await Order.getById(orderId);
        const result = await printerService.printBill(completeOrder);
        if (result.printed) {
          logger.info(`Receipt printed at counter for order #${order.order_number}`);
        } else {
          logger.info(`Printer unavailable — no receipt for order #${order.order_number}`);
        }
      } catch (printErr) {
        logger.warn(`Receipt print error for order #${order.order_number}:`, printErr.message);
      }
    });
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

  // FIX T1 — money first, DB state second. If this order has already been
  // paid via Razorpay we must actually issue a refund through the gateway
  // before flipping payment_status; otherwise the DB silently lies about
  // money having been returned. On gateway failure we surface 502 and do
  // NOT cancel the order, keeping DB + Razorpay state in sync.
  let refund = null;
  if (order.payment_status === 'paid' && order.razorpay_payment_id) {
    try {
      refund = await razorpayService.processRefund(
        order.razorpay_payment_id,
        null, // full refund
        {
          reason: reason || `Cancelled by ${role}`,
          canteen_order_id: order.id,
        }
      );
    } catch (refundErr) {
      logger.error(`Razorpay refund failed on cancel of order #${order.order_number}`, refundErr);
      return res.status(502).json({
        success: false,
        message: 'Refund failed; order not cancelled. Please retry or process the refund via the Razorpay dashboard.'
      });
    }
  }

  // FIX T2 — restore inventory before flipping the order to cancelled, so
  // the stock returns are still visible if anyone looks at this order's
  // status mid-flight.
  const stockRestored = await Order.restoreStock(order.id);

  const cancelledOrder = await Order.cancel(orderId);

  // If we actually refunded above, record the gateway state on the order.
  let finalOrder = cancelledOrder;
  if (refund) {
    finalOrder = await Order.updatePayment(order.id, {
      payment_status:      'refunded',
      payment_method:      order.payment_method,
      razorpay_order_id:   order.razorpay_order_id,
      razorpay_payment_id: order.razorpay_payment_id,
      razorpay_signature:  order.razorpay_signature
    });
  }

  // FIX V3 — reverse points + spending stats + tier in a single transaction.
  // Mirrors processRefund(): without this, /orders/:id/cancel and
  // /payments/refund would land the order in the same state but leak the
  // student's points_earned / total_spent depending on which endpoint the
  // admin clicked. Skipped when no refund happened (order was pending) or
  // there's no student_id (guest).
  if (refund && order.student_id) {
    try {
      await transaction(async (client) => {
        if (order.points_earned > 0) {
          await Student.deductPoints(order.student_id, order.points_earned, client);
        }
        if (order.points_used > 0) {
          await Student.addPoints(order.student_id, order.points_used, client);
        }
        await Student.updateStats(
          order.student_id,
          -parseFloat(order.total_amount), // negative delta reverses
          client
        );
        await Student.updateTier(order.student_id, client);
      });
    } catch (pointsErr) {
      logger.error(
        `Failed to reconcile points/stats on cancel-refund of order #${order.order_number}`,
        pointsErr
      );
    }
  }

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

    if (order.student_id) {
      io.to(`student:${order.student_id}`).emit('order:cancelled', cancelPayload);
    }
    // Per-order room — guests on OrderTracking subscribe via order:join.
    io.to(`order:${order.id}`).emit('order:cancelled', cancelPayload);
    io.to('kitchen').emit('order:cancelled', cancelPayload);
    io.to('admin').emit('order:cancelled', cancelPayload);

    // Broadcast stock returns so menus refresh in real time.
    for (const row of stockRestored) {
      io.emit('menu:stock-updated', {
        id: row.id,
        stock_quantity: row.stock_quantity,
        is_available:   row.is_available
      });
      if (row.is_available) {
        io.emit('menu:availability-changed', row);
      }
    }
  }

  logger.warn(`Order #${order.order_number} cancelled — reason: ${reason}${refund ? ` (refund ${refund.refundId})` : ''}`);

  return res.json({ success: true, data: { order: finalOrder } });
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
  const { orders: recentOrders } = await Order.getAll({ limit: 10, offset: 0 });

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
  const days = parseInt(req.query.days) || 30;
  const rows = await Order.getRevenueData(days);

  // Order.getRevenueData returns { date, order_count, revenue }; reshape
  // to the chart-friendly { date, revenue, orders } shape callers expect.
  const data = rows.map(r => ({
    date:    r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date,
    revenue: parseFloat(r.revenue) || 0,
    orders:  parseInt(r.order_count, 10) || 0
  }));

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
