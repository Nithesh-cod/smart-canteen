// ============================================================================
// PAYMENT CONTROLLER
// ============================================================================
// Handles Razorpay payment lifecycle:
// createPaymentOrder, verifyPayment, getHistory, processRefund, handleWebhook
// ============================================================================

const Order          = require('../models/Order');
const Student        = require('../models/Student');
const razorpayService = require('../services/razorpay.service');
const printerService  = require('../services/printer.service');
const logger          = require('../utils/logger');
const { asyncHandler }         = require('../middleware/error.middleware');
const { rupeesToPaise }        = require('../utils/helpers');

// ============================================================================
// CREATE RAZORPAY PAYMENT ORDER
// ============================================================================
/**
 * POST /api/payments/create-order
 * Body: { order_id }
 * Auth: student
 *
 * Creates a Razorpay order for the given canteen order and saves the
 * razorpay_order_id back to the orders table.
 */
const createPaymentOrder = asyncHandler(async (req, res) => {
  const { order_id } = req.body;
  const studentId    = req.user ? req.user.id : null;

  if (!order_id) {
    return res.status(400).json({ success: false, message: 'order_id is required' });
  }

  const order = await Order.getById(order_id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  // For logged-in students verify ownership; guest orders have null student_id
  if (studentId && order.student_id && order.student_id !== studentId) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  // Prevent double-payment
  if (order.payment_status === 'paid') {
    return res.status(400).json({ success: false, message: 'Order is already paid' });
  }

  if (order.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'Cannot pay for a cancelled order' });
  }

  // Create a Razorpay order (amount in rupees; service converts to paise internally)
  const razorpayOrder = await razorpayService.createOrder(
    parseFloat(order.total_amount),
    'INR',
    {
      canteen_order_id:     order.id,
      canteen_order_number: order.order_number,
      student_id:           studentId,
      student_name:         order.student_name
    }
  );

  // Persist the Razorpay order ID so we can verify later
  await Order.updatePayment(order.id, {
    payment_status:   'pending',
    payment_method:   'Razorpay',
    razorpay_order_id: razorpayOrder.orderId
  });

  logger.info(`Razorpay order created for canteen order #${order.order_number}: ${razorpayOrder.orderId}`);

  return res.status(201).json({
    success: true,
    data: {
      razorpay_order_id: razorpayOrder.orderId,
      amount:            razorpayOrder.amount,          // in paise
      amount_in_rupees:  razorpayOrder.amountInRupees,
      currency:          razorpayOrder.currency,
      key_id:            process.env.RAZORPAY_KEY_ID,
      order: {
        id:           order.id,
        order_number: order.order_number,
        total_amount: order.total_amount
      }
    }
  });
});

// ============================================================================
// VERIFY PAYMENT
// ============================================================================
/**
 * POST /api/payments/verify
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id }
 * Auth: student
 *
 * Verifies the Razorpay HMAC signature, marks the order paid, awards/deducts
 * loyalty points, updates the student tier, and attempts bill printing.
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    order_id
  } = req.body;

  const studentId = req.user ? req.user.id : null;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_id) {
    return res.status(400).json({
      success: false,
      message: 'razorpay_order_id, razorpay_payment_id, razorpay_signature, and order_id are all required'
    });
  }

  // 1. Verify Razorpay HMAC signature
  const isValid = razorpayService.verifyPayment(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  );

  if (!isValid) {
    logger.error(`Payment signature verification failed for order_id=${order_id}`);
    return res.status(400).json({ success: false, message: 'Invalid payment signature' });
  }

  // 2. Fetch the canteen order
  const order = await Order.getById(order_id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  // For logged-in students verify ownership; guest orders have null student_id
  if (studentId && order.student_id && order.student_id !== studentId) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  if (order.payment_status === 'paid') {
    return res.status(400).json({ success: false, message: 'Order is already paid' });
  }

  // 3. Mark the order as paid
  const updatedOrder = await Order.updatePayment(order.id, {
    payment_status:      'paid',
    payment_method:      'Razorpay',
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  });

  // Also move order status from 'pending' to 'preparing' if it was still pending
  if (order.status === 'pending') {
    await Order.updateStatus(order.id, 'preparing');
  }

  // 4. Update student loyalty points and spending stats — only for logged-in students
  let updatedStudent = null;
  if (studentId && order.student_id) {
    try {
      if (order.points_used > 0) {
        await Student.deductPoints(studentId, order.points_used);
      }
      if (order.points_earned > 0) {
        await Student.addPoints(studentId, order.points_earned);
      }
      updatedStudent = await Student.updateStats(studentId, parseFloat(order.total_amount));
      updatedStudent = await Student.updateTier(studentId);
    } catch (pointsErr) {
      logger.error('Failed to update student points/stats after payment', pointsErr);
    }
  }

  // 5. Emit payment:success socket event
  const io = req.app.get('io');
  if (io) {
    const socketRoom = studentId ? `student:${studentId}` : `order:${order.id}`;
    io.to(socketRoom).emit('payment:confirmed', {
      orderId:       order.id,
      orderNumber:   order.order_number,
      amount:        order.total_amount,
      points_earned: order.points_earned,
      message:       'Payment successful! Your order is being prepared.',
      timestamp:     new Date().toISOString()
    });

    io.to('kitchen').emit('order:updated', {
      orderId:     order.id,
      orderNumber: order.order_number,
      status:      'preparing',
      timestamp:   new Date().toISOString()
    });

    io.to('admin').emit('payment:success', {
      orderId:      order.id,
      orderNumber:  order.order_number,
      studentId,
      amount:       order.total_amount,
      timestamp:    new Date().toISOString()
    });
  }

  // 6. Print the bill.
  //    • Windows GDI (PRINTER_TYPE=windows):
  //        Fire-and-forget in the background so the HTTP response is instant.
  //        Return bill_printed:true optimistically — the spooler takes it from here.
  //    • ESC/POS (bluetooth/usb/network):
  //        Try synchronously (fast, <1 s).  If it fails, fall back to a base64 PDF.
  //    • none:
  //        Always generate a PDF for the browser to download.
  const printerType     = (process.env.PRINTER_TYPE || 'none').toLowerCase();
  let   billPrinted     = false;
  let   billPdfBase64   = null;

  const completeOrder = await Order.getById(order.id);

  if (printerType === 'windows') {
    // Background print — don't block the response
    billPrinted = true; // optimistic
    setImmediate(async () => {
      try {
        await printerService.printBill(completeOrder);
      } catch (printErr) {
        logger.warn(`Background print error for order #${order.order_number}:`, printErr.message);
      }
    });
  } else {
    // ESC/POS: synchronous (fast) or PDF fallback
    try {
      const printResult = await printerService.printBill(completeOrder);
      billPrinted = printResult.printed;
    } catch (printErr) {
      logger.warn('Bill print error (printer may be offline):', printErr.message);
    }
    if (!billPrinted) {
      try {
        const pdfBuffer = await printerService.generateBillPDF(completeOrder);
        billPdfBase64   = pdfBuffer.toString('base64');
        logger.info(`PDF bill generated for order #${order.order_number}`);
      } catch (pdfErr) {
        logger.warn('PDF generation also failed:', pdfErr.message);
      }
    }
  }

  logger.success(`Payment verified for order #${order.order_number} — ₹${order.total_amount}`);

  return res.json({
    success: true,
    data: {
      order:          updatedOrder,
      points_earned:  order.points_earned,
      points_used:    order.points_used,
      student_tier:   updatedStudent ? updatedStudent.tier   : undefined,
      student_points: updatedStudent ? updatedStudent.points : undefined,
      bill_printed:   billPrinted,
      // base64 PDF — present only when printer is offline
      ...(billPdfBase64 && { bill_pdf: billPdfBase64 }),
    }
  });
});

// ============================================================================
// GET PAYMENT HISTORY
// ============================================================================
/**
 * GET /api/payments/history
 * Auth: student
 *
 * Returns all paid orders for the requesting student.
 */
const getHistory = asyncHandler(async (req, res) => {
  const studentId = req.user.id;
  const limit     = parseInt(req.query.limit) || 20;

  const orders = await Order.getByStudent(studentId, limit);
  const paidOrders = orders.filter(o => o.payment_status === 'paid');

  return res.json({
    success: true,
    data: {
      payments: paidOrders,
      total:    paidOrders.length
    }
  });
});

// ============================================================================
// PROCESS REFUND (ADMIN)
// ============================================================================
/**
 * POST /api/payments/refund
 * Body: { order_id, reason }
 * Auth: admin
 *
 * Initiates a Razorpay refund and marks the order as refunded.
 * Points earned from the original payment are deducted.
 */
const processRefund = asyncHandler(async (req, res) => {
  const { order_id, reason } = req.body;

  if (!order_id) {
    return res.status(400).json({ success: false, message: 'order_id is required' });
  }

  const order = await Order.getById(order_id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  if (order.payment_status !== 'paid') {
    return res.status(400).json({
      success: false,
      message: `Cannot refund an order with payment_status="${order.payment_status}". Only paid orders can be refunded.`
    });
  }

  if (!order.razorpay_payment_id) {
    return res.status(400).json({
      success: false,
      message: 'No Razorpay payment ID found for this order'
    });
  }

  // Issue the refund via Razorpay
  const refund = await razorpayService.processRefund(
    order.razorpay_payment_id,
    null, // full refund
    { reason: reason || 'Refund requested by admin', canteen_order_id: order.id }
  );

  // Mark the order as refunded
  const updatedOrder = await Order.updatePayment(order.id, {
    payment_status:      'refunded',
    payment_method:      order.payment_method,
    razorpay_order_id:   order.razorpay_order_id,
    razorpay_payment_id: order.razorpay_payment_id,
    razorpay_signature:  order.razorpay_signature
  });

  // Cancel the order too so it no longer appears in kitchen queue
  if (!['completed', 'cancelled'].includes(order.status)) {
    await Order.cancel(order.id);
  }

  // Deduct points that were earned from this order
  if (order.points_earned > 0) {
    try {
      await Student.deductPoints(order.student_id, order.points_earned);
    } catch (pointsErr) {
      logger.error('Failed to deduct refunded order points', pointsErr);
    }
  }

  // Notify the student
  const io = req.app.get('io');
  if (io) {
    io.to(`student:${order.student_id}`).emit('payment:refunded', {
      orderId:     order.id,
      orderNumber: order.order_number,
      amount:      order.total_amount,
      reason:      reason || 'Refund processed',
      message:     'Your payment has been refunded',
      timestamp:   new Date().toISOString()
    });
  }

  logger.success(`Refund processed for order #${order.order_number} — Razorpay refund ${refund.refundId}`);

  return res.json({
    success: true,
    data: {
      order:  updatedOrder,
      refund: {
        refund_id:       refund.refundId,
        amount:          refund.amountInRupees,
        currency:        refund.currency,
        status:          refund.status,
        razorpay_refund: refund
      }
    }
  });
});

// ============================================================================
// HANDLE RAZORPAY WEBHOOK
// ============================================================================
/**
 * POST /api/payments/webhook
 * No auth middleware — verified by Razorpay signature
 *
 * Handles the payment.captured event emitted by Razorpay.
 * Raw body must be available on req.body (configure express.raw for this route).
 */
const handleWebhook = asyncHandler(async (req, res) => {
  const webhookSignature = req.headers['x-razorpay-signature'];
  const webhookSecret    = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.warn('RAZORPAY_WEBHOOK_SECRET is not set — skipping webhook verification');
    return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
  }

  // req.body is the raw Buffer when express.raw() is used on this route
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : JSON.stringify(req.body);

  const isValid = razorpayService.verifyWebhookSignature(
    rawBody,
    webhookSignature,
    webhookSecret
  );

  if (!isValid) {
    logger.error('Invalid Razorpay webhook signature');
    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
  }

  // Parse the payload (handle both Buffer and already-parsed object)
  let payload;
  try {
    payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
  }

  const event = payload.event;

  logger.info(`Razorpay webhook received: ${event}`);

  if (event === 'payment.captured') {
    const razorpayPayment = payload.payload.payment.entity;
    const razorpayOrderId = razorpayPayment.order_id;

    if (razorpayOrderId) {
      // Locate the canteen order by razorpay_order_id using getAll with a filter
      // (Order model does not have getByRazorpayOrderId, so we use getAll)
      const orders = await Order.getAll({ payment_status: 'pending', limit: 200, offset: 0 });
      const order  = orders.find(o => o.razorpay_order_id === razorpayOrderId);

      if (order && order.payment_status !== 'paid') {
        await Order.updatePayment(order.id, {
          payment_status:      'paid',
          payment_method:      razorpayPayment.method || 'Razorpay',
          razorpay_order_id:   razorpayOrderId,
          razorpay_payment_id: razorpayPayment.id,
          razorpay_signature:  null // not available in webhook
        });

        logger.success(`Webhook: order #${order.order_number} marked as paid via payment.captured`);

        // Notify via socket
        const io = req.app.get('io');
        if (io) {
          io.to(`student:${order.student_id}`).emit('payment:confirmed', {
            orderId:     order.id,
            orderNumber: order.order_number,
            amount:      order.total_amount,
            message:     'Payment confirmed!',
            timestamp:   new Date().toISOString()
          });
        }
      }
    }
  }

  // Always acknowledge Razorpay webhooks with 200
  return res.status(200).json({ success: true, message: 'Webhook received' });
});

// ============================================================================
// GET ALL PAYMENTS (Admin)
// ============================================================================
/**
 * GET /api/payments/all
 * Auth: admin
 *
 * Returns all paid orders, optionally filtered by date range.
 */
const getAllPayments = asyncHandler(async (req, res) => {
  const limit  = parseInt(req.query.limit)  || 50;
  const offset = parseInt(req.query.offset) || 0;

  const filters = { payment_status: 'paid', limit, offset };
  const orders  = await Order.getAll(filters);

  return res.json({
    success: true,
    data: {
      payments: orders,
      total:    orders.length
    }
  });
});

// ============================================================================
// GET PAYMENT DETAILS (Admin)
// ============================================================================
/**
 * GET /api/payments/:paymentId
 * Auth: admin
 *
 * Fetches payment details from Razorpay for the given payment ID.
 */
const getPaymentDetails = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;

  if (!paymentId) {
    return res.status(400).json({ success: false, message: 'paymentId is required' });
  }

  try {
    const payment = await razorpayService.getPaymentDetails(paymentId);
    return res.json({ success: true, data: payment });
  } catch (err) {
    logger.error('Failed to fetch payment from Razorpay:', err.message);
    return res.status(404).json({ success: false, message: 'Payment not found in Razorpay' });
  }
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  createPaymentOrder,
  verifyPayment,
  getHistory,
  processRefund,
  handleWebhook,
  getAllPayments,
  getPaymentDetails
};
