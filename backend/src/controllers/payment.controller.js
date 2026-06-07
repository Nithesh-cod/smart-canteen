// ============================================================================
// PAYMENT CONTROLLER
// ============================================================================
// Handles Razorpay payment lifecycle:
// createPaymentOrder, verifyPayment, getHistory, processRefund, handleWebhook
// ============================================================================

const Order          = require('../models/Order');
const Student        = require('../models/Student');
const { query, transaction } = require('../config/database');
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

  // Ownership: either a student JWT whose id matches, or a guest token whose
  // scoped order_id matches. verifyTokenOrGuest guarantees at least one set.
  if (req.user) {
    if (order.student_id && order.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
  } else if (req.guestOrderId) {
    if (order.id !== req.guestOrderId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
  } else {
    return res.status(401).json({ success: false, message: 'Authentication required' });
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

  // Ownership: either a student JWT whose id matches, or a guest token whose
  // scoped order_id matches. verifyTokenOrGuest guarantees at least one set.
  if (req.user) {
    if (order.student_id && order.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
  } else if (req.guestOrderId) {
    if (order.id !== req.guestOrderId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
  } else {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // Idempotent — webhook may have beaten us to it. Common mobile flow:
  // Razorpay redirects through a UPI app, the kiosk tab goes background,
  // payment.captured lands first, then the user foregrounds the tab and
  // the verify handler() finally fires. Don't error on what's actually a
  // success — finalisePayment already ran from the webhook path (FIX V4).
  //
  // Bill handling here is HONEST (FIX Y3): the webhook ran with skipBill:
  // true, so no bill was actually printed. Re-run the same print/PDF
  // fallback finalisePayment uses for non-windows printers, so the user
  // still walks away with a receipt or a downloadable PDF — not a lie.
  if (order.payment_status === 'paid') {
    const completeOrder = await Order.getById(order.id);

    // FIX Z3 — bill-print dedup. A kiosk refresh, network-blip retry, or
    // double-tapped CTA used to spool a fresh receipt on every verify
    // hit. Short-circuit when bill_issued_at is already set; only the
    // FIRST call actually prints/PDFs and stamps the column.
    if (completeOrder.bill_issued_at) {
      return res.json({
        success: true,
        data: {
          order:               completeOrder,
          points_earned:       completeOrder.points_earned,
          points_used:         completeOrder.points_used,
          bill_printed:        true,
          already_paid:        true,
          bill_already_issued: true,
        },
      });
    }

    const printerType   = (process.env.PRINTER_TYPE || 'none').toLowerCase();
    let   billPrinted   = false;
    let   billPdfBase64 = null;

    if (printerType === 'windows') {
      // The webhook path already kicked a setImmediate background print.
      // Treat as printed — there's no reliable status to wait for here.
      billPrinted = true;
    } else {
      try {
        const r = await printerService.printBill(completeOrder);
        billPrinted = r.printed;
      } catch (e) {
        logger.warn('idempotent verify: bill print failed', e.message);
      }
      if (!billPrinted) {
        try {
          const buf = await printerService.generateBillPDF(completeOrder);
          billPdfBase64 = buf.toString('base64');
        } catch (e) {
          logger.warn('idempotent verify: PDF fallback failed', e.message);
        }
      }
    }

    // Mark issued only when we actually produced something for the user
    // to walk away with. A double failure (print + PDF both threw) leaves
    // bill_issued_at null so the next verify retry can try again.
    if (billPrinted || billPdfBase64) {
      try { await Order.markBillIssued(order.id); } catch { /* logged via Order */ }
    }

    return res.json({
      success: true,
      data: {
        order:          completeOrder,
        points_earned:  completeOrder.points_earned,
        points_used:    completeOrder.points_used,
        bill_printed:   billPrinted,
        already_paid:   true,
        ...(billPdfBase64 && { bill_pdf: billPdfBase64 }),
      },
    });
  }

  // 3. Mark the order as paid
  await Order.updatePayment(order.id, {
    payment_status:      'paid',
    payment_method:      'Razorpay',
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  });

  // 4–6. Status advance, point/stat reconciliation, sockets, bill print.
  //      Shared with handleWebhook so a webhook-only completion (the
  //      browser closed before /verify ran) doesn't strand the order at
  //      status=pending with no points awarded and no receipt (FIX T3).
  const finalised = await finalisePayment(order, { io: req.app.get('io') });

  // FIX Y5 — re-fetch after finalisePayment so the response carries the
  // post-pipeline status ('preparing') and the COALESCEd razorpay fields,
  // not the stale snapshot updatePayment returned before finalisePayment ran.
  const freshOrder = await Order.getById(order.id);

  logger.success(`Payment verified for order #${order.order_number} — ₹${order.total_amount}`);

  return res.json({
    success: true,
    data: {
      order:          freshOrder,
      points_earned:  freshOrder.points_earned,
      points_used:    freshOrder.points_used,
      student_tier:   finalised.student?.tier,
      student_points: finalised.student?.points,
      bill_printed:   finalised.billPrinted,
      // base64 PDF — present only when printer is offline
      ...(finalised.billPdfBase64 && { bill_pdf: finalised.billPdfBase64 }),
    }
  });
});

// ============================================================================
// SHARED POST-PAYMENT PIPELINE  (FIX T3)
// ============================================================================
/**
 * Run every "after we know the payment landed" side-effect:
 *   1. pending → preparing transition
 *   2. points / stats / tier reconciliation (transactional)
 *   3. socket emits to student (or guest order room), kitchen, admin
 *   4. bill print (skipped on the webhook path — no res to return a PDF to)
 *
 * @param {Object}   order       - Order BEFORE payment_status was flipped
 * @param {Object}   opts
 * @param {Object}   opts.io     - socket.io instance (may be undefined)
 * @param {boolean} [opts.skipBill=false] - webhook path skips synchronous bill
 * @returns {Promise<{ student: object|null, billPrinted: boolean, billPdfBase64: string|null }>}
 */
async function finalisePayment(order, { io, skipBill = false } = {}) {
  // 1. Status advance. Track whether we actually moved pending → preparing
  // so the bill-print block (Section 4) can skip when a chef cancelled the
  // order in flight — printing a receipt for an already-cancelled order is
  // the worst kind of user-facing artefact (FIX Y4).
  let statusAdvanced = true;
  if (order.status === 'pending') {
    try {
      // Optimistic WHERE-guard: only advance if still 'pending'. A chef or
      // admin may have cancelled the order in the window between the
      // controller's getById and our updateStatus call; without the guard
      // we'd silently un-cancel it (FIX V5).
      const advanced = await Order.updateStatus(order.id, 'preparing', 'pending');
      if (!advanced) {
        statusAdvanced = false;
        logger.warn(
          `finalisePayment: status guard rejected — order #${order.order_number} ` +
          `was no longer 'pending' (likely cancelled in flight). Skipping bill print.`
        );
      }
    } catch (statusErr) {
      logger.error(`finalisePayment: status advance failed for order #${order.order_number}`, statusErr);
    }
  }

  // 2. Points / stats / tier — only for logged-in students. Transactional
  //    so a mid-sequence failure can't leave the row half-updated.
  let updatedStudent = null;
  if (order.student_id) {
    try {
      updatedStudent = await transaction(async (client) => {
        if (order.points_used > 0) {
          await Student.deductPoints(order.student_id, order.points_used, client);
        }
        if (order.points_earned > 0) {
          await Student.addPoints(order.student_id, order.points_earned, client);
        }
        await Student.updateStats(order.student_id, parseFloat(order.total_amount), client);
        return await Student.updateTier(order.student_id, client);
      });
    } catch (pointsErr) {
      logger.error('finalisePayment: points reconciliation failed', pointsErr);
      // FIX Z4 — best-effort read so the response still ships student_tier /
      // student_points (their last-known values) instead of undefined.
      // Frontend Checkout reads these to refresh the cached Redux state.
      try {
        updatedStudent = await Student.findById(order.student_id);
      } catch { /* swallow — already logged above */ }
    }
  }

  // 3. Sockets
  if (io) {
    const confirmedPayload = {
      orderId:       order.id,
      orderNumber:   order.order_number,
      amount:        order.total_amount,
      points_earned: order.points_earned,
      message:       'Payment successful! Your order is being prepared.',
      timestamp:     new Date().toISOString()
    };
    if (order.student_id) {
      io.to(`student:${order.student_id}`).emit('payment:confirmed', confirmedPayload);
    }
    io.to(`order:${order.id}`).emit('payment:confirmed', confirmedPayload);

    io.to('kitchen').emit('order:updated', {
      orderId:     order.id,
      orderNumber: order.order_number,
      status:      'preparing',
      timestamp:   new Date().toISOString()
    });

    io.to('admin').emit('payment:success', {
      orderId:     order.id,
      orderNumber: order.order_number,
      studentId:   order.student_id,
      amount:      order.total_amount,
      timestamp:   new Date().toISOString()
    });
  }

  // 4. Bill print. Webhook path always skips the synchronous/PDF branches —
  //    there's no response to return base64 against. Windows GDI still
  //    fires via setImmediate so the printer prints in the background.
  //    Also skipped entirely when the V5 status guard rejected the
  //    pending → preparing transition (the order got cancelled mid-flight
  //    and we don't want to print a receipt for a cancelled order — FIX Y4).
  const printerType   = (process.env.PRINTER_TYPE || 'none').toLowerCase();
  let   billPrinted   = false;
  let   billPdfBase64 = null;

  if (statusAdvanced) {
    const completeOrder = await Order.getById(order.id);

    if (printerType === 'windows') {
      // Optimistic + background — same as the verify path before the refactor.
      billPrinted = true;
      setImmediate(async () => {
        try {
          const printResult = await printerService.printBill(completeOrder);
          if (printResult?.printed) {
            logger.info(`🖨️  Receipt printed for order #${order.order_number}`);
          } else {
            logger.warn(`⚠️  Printer returned false for order #${order.order_number} — check PRINTER_NAME in .env`);
          }
        } catch (printErr) {
          logger.warn(`Background print error for order #${order.order_number}:`, printErr.message);
        }
      });
    } else if (!skipBill) {
      // ESC/POS sync attempt + base64 PDF fallback. Only the verify path
      // exercises this — the webhook has no response to attach the PDF to.
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

    // FIX Z3 — stamp bill_issued_at when we actually produced a receipt
    // (sync print, PDF, or optimistic Windows GDI background print) so a
    // follow-up idempotent verify call short-circuits instead of spooling
    // a duplicate. The webhook path explicitly passes skipBill: true and
    // doesn't reach a non-windows print here, so it intentionally leaves
    // the column NULL — its verify follow-up is free to produce the bill.
    if (billPrinted || billPdfBase64) {
      try { await Order.markBillIssued(order.id); } catch { /* logged via Order */ }
    }
  }

  return { student: updatedStudent, billPrinted, billPdfBase64 };
}

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

  if (!order.razorpay_payment_id) {
    return res.status(400).json({
      success: false,
      message: 'No Razorpay payment ID found for this order'
    });
  }

  // FIX Y6 — double-click guard via atomic transition into a transient
  // 'refunding' state. Two concurrent admin clicks both passed the
  // `payment_status === 'paid'` check before, then both fired Razorpay's
  // processRefund; the second got back a 502 ("already refunded") and the
  // admin saw a confusing error after a successful refund. The
  // UPDATE … WHERE payment_status='paid' is race-free: exactly one
  // request flips the row, the other sees rowCount === 0 and 400s out.
  const claim = await query(
    `UPDATE orders
        SET payment_status = 'refunding'
      WHERE id = $1 AND payment_status = 'paid'
      RETURNING *`,
    [order_id]
  );
  if (claim.rowCount === 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot refund an order with payment_status="${order.payment_status}". ` +
               `Only paid orders can be refunded (a concurrent refund may already be in progress).`
    });
  }

  // Issue the refund via Razorpay
  let refund;
  try {
    refund = await razorpayService.processRefund(
      order.razorpay_payment_id,
      null, // full refund
      { reason: reason || 'Refund requested by admin', canteen_order_id: order.id }
    );
  } catch (rzpErr) {
    // Gateway refused — roll the row back to 'paid' so the admin can retry.
    await query(
      `UPDATE orders SET payment_status = 'paid' WHERE id = $1 AND payment_status = 'refunding'`,
      [order_id]
    );
    logger.error(`Razorpay refund call failed for order #${order.order_number}`, rzpErr);
    return res.status(502).json({
      success: false,
      message: 'Razorpay refund failed. Please retry or check the Razorpay dashboard.',
    });
  }

  // FIX Y2 — the DB writes (updatePayment + restoreStock + cancel) run
  // inside ONE transaction so a mid-flow failure after a successful
  // Razorpay refund leaves the DB consistent (rolls back to the original
  // paid/preparing state) instead of half-applied. The points/stats
  // reconciliation below stays in its own transaction — it's loyalty
  // bookkeeping, not DB-integrity, and the order's books-of-record state
  // must commit before we touch the student record.
  let updatedOrder;
  let stockRestored;
  try {
    const result = await transaction(async (client) => {
      const updated = await Order.updatePayment(order.id, {
        payment_status:      'refunded',
        payment_method:      order.payment_method,
        razorpay_order_id:   order.razorpay_order_id,
        razorpay_payment_id: order.razorpay_payment_id,
        razorpay_signature:  order.razorpay_signature
      }, client);
      const restored = await Order.restoreStock(order.id, client);
      if (!['completed', 'cancelled'].includes(order.status)) {
        await Order.cancel(order.id, client);
      }
      return { updated, restored };
    });
    updatedOrder  = result.updated;
    stockRestored = result.restored;
  } catch (dbErr) {
    logger.error(
      `Refund DB transaction failed AFTER successful Razorpay refund ` +
      `for order #${order.order_number}. Forcing payment_status=refunded ` +
      `to match gateway state. Stock and order status NOT reconciled — ` +
      `manual cleanup required (refund id: ${refund.refundId})`,
      dbErr
    );

    // FIX Z2 — best-effort unstuck. The Round-5 Y6 atomic transition
    // committed payment_status='refunding' OUTSIDE the transaction, so
    // the rollback above doesn't revert it. Without this fallback the
    // row sits at 'refunding' forever and the next refund attempt's Y6
    // guard (WHERE payment_status='paid') rejects every retry — the
    // order becomes a brick. Force it to 'refunded' so the books at
    // least mirror the gateway; stock + status are documented above for
    // human follow-up.
    try {
      await query(
        `UPDATE orders SET payment_status = 'refunded' ` +
        `WHERE id = $1 AND payment_status = 'refunding'`,
        [order_id]
      );
    } catch (rollbackErr) {
      logger.error(
        `Even the fallback payment_status update failed. ` +
        `Order #${order.order_number} is stuck in 'refunding'. ` +
        `Razorpay refund id: ${refund.refundId}`,
        rollbackErr
      );
    }

    return res.status(500).json({
      success: false,
      message:
        'Refund partially failed. Razorpay refund landed, payment_status ' +
        'corrected to refunded, but stock restore and order cancel did NOT ' +
        'commit. Please contact support — refund id logged.',
    });
  }

  // Reconcile loyalty points AND spending stats in a single transaction,
  // then re-evaluate tier (FIX T5). updateStats clamps both columns at 0
  // so a refund issued before stats ever incremented (or partial edge
  // cases) won't push them below zero. Skip entirely for guest orders.
  if (order.student_id) {
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
      logger.error('Failed to reconcile points/stats on refund', pointsErr);
    }
  }

  // Notify the student and any guest tracker (FIX T4).
  const io = req.app.get('io');
  if (io) {
    const refundPayload = {
      orderId:     order.id,
      orderNumber: order.order_number,
      amount:      order.total_amount,
      reason:      reason || 'Refund processed',
      message:     'Your payment has been refunded',
      timestamp:   new Date().toISOString()
    };
    if (order.student_id) {
      io.to(`student:${order.student_id}`).emit('payment:refunded', refundPayload);
    }
    io.to(`order:${order.id}`).emit('payment:refunded', refundPayload);

    // Stock returns (FIX T2)
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
    // Production boot in app.js refuses to start without the secret, so
    // this branch only fires in dev / staging. Razorpay treats 5xx as
    // retryable — returning 200 here makes a "Test webhook" click from
    // the dashboard terminal instead of triggering retry storms (FIX V6).
    logger.warn(
      'RAZORPAY_WEBHOOK_SECRET not set — acknowledging without verification ' +
      '(set the secret to enable signature checks).'
    );
    return res.status(200).json({
      success: false,
      message: 'Webhook secret not configured; acknowledged without verification',
    });
  }

  // This route is mounted with express.raw() in app.js, so req.body is always
  // a Buffer containing the byte-exact request body — required for HMAC.
  if (!Buffer.isBuffer(req.body)) {
    logger.error('Webhook body is not a Buffer — express.raw() not mounted for this route');
    return res.status(500).json({ success: false, message: 'Webhook body parser misconfigured' });
  }
  const rawBody = req.body.toString('utf8');

  const isValid = razorpayService.verifyWebhookSignature(
    rawBody,
    webhookSignature,
    webhookSecret
  );

  if (!isValid) {
    logger.error('Invalid Razorpay webhook signature');
    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
  }

  const event = payload.event;

  logger.info(`Razorpay webhook received: ${event}`);

  if (event === 'payment.captured') {
    const razorpayPayment = payload.payload.payment.entity;
    const razorpayOrderId = razorpayPayment.order_id;

    if (razorpayOrderId) {
      const order = await Order.findByRazorpayOrderId(razorpayOrderId);

      // FIX Z1 — act ONLY when the order is still in its initial 'pending'
      // state. 'pending' is the only payment_status createPaymentOrder
      // leaves the row in, so the webhook should never advance anything
      // else. The previous `!== 'paid'` guard let a late or duplicate
      // payment.captured during a refund flow see 'refunding' (Round-5 Y6
      // transient) and re-mark the row 'paid', then re-run the full
      // finalisePayment pipeline (double points, double stats, second
      // bill, re-emitted sockets). Razorpay redelivers for ~72h, so the
      // same hazard applies to 'refunded' after a real refund.
      if (order && order.payment_status === 'pending') {
        await Order.updatePayment(order.id, {
          payment_status:      'paid',
          payment_method:      razorpayPayment.method || 'Razorpay',
          razorpay_order_id:   razorpayOrderId,
          razorpay_payment_id: razorpayPayment.id,
          razorpay_signature:  null // not available in webhook
        });

        logger.success(`Webhook: order #${order.order_number} marked as paid via payment.captured`);

        // finalisePayment runs the post-payment side-effects (status, points,
        // stats, sockets, bill). The webhook context can't return a base64
        // PDF, so we pass skipBill: true; Windows GDI background print still
        // fires. It is the single source of socket fanout — do not emit
        // payment:confirmed again here (was a leftover Round-2 block that
        // fired every event twice per webhook delivery).
        try {
          await finalisePayment(order, { io: req.app.get('io'), skipBill: true });
        } catch (finErr) {
          logger.error('finalisePayment from webhook failed', finErr);
        }
      } else if (order) {
        logger.info(
          `Webhook skipped for order #${order.order_number}: ` +
          `payment_status=${order.payment_status} (not 'pending').`
        );
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
  const { orders, total } = await Order.getAll(filters);

  return res.json({
    success: true,
    data: {
      payments: orders,
      total
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
