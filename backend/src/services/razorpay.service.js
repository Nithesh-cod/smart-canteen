// ============================================================================
// RAZORPAY SERVICE
// ============================================================================
// Real Razorpay payment gateway integration
// Handles order creation, payment verification, and refunds
// ============================================================================

const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();

// ============================================================================
// INITIALIZE RAZORPAY INSTANCE
// ============================================================================

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Verify that keys are configured
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn('⚠️  WARNING: Razorpay keys not configured in .env file');
  console.warn('⚠️  Payment functionality will not work until keys are added');
}

// ============================================================================
// CREATE RAZORPAY ORDER
// ============================================================================
/**
 * Create a Razorpay order for payment
 * @param {number} amount - Amount in rupees (will be converted to paise)
 * @param {string} currency - Currency code (default: INR)
 * @param {object} notes - Additional metadata
 * @returns {Promise<Object>} Razorpay order object
 */
const createOrder = async (amount, currency = 'INR', notes = {}) => {
  try {
    // Validate amount
    if (!amount || amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Convert rupees to paise (Razorpay requires amount in smallest currency unit)
    const amountInPaise = Math.round(amount * 100);

    // Create order options
    const options = {
      amount: amountInPaise,
      currency: currency,
      receipt: `receipt_${Date.now()}`,
      notes: {
        ...notes,
        created_at: new Date().toISOString()
      }
    };

    // Create order via Razorpay API
    const order = await razorpay.orders.create(options);

    console.log('✅ Razorpay order created:', {
      id: order.id,
      amount: order.amount,
      currency: order.currency
    });

    return {
      orderId: order.id,
      amount: order.amount,
      amountInRupees: amount,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status
    };

  } catch (error) {
    console.error('❌ Razorpay order creation failed:', error);
    throw new Error(`Failed to create payment order: ${error.message}`);
  }
};

// ============================================================================
// VERIFY PAYMENT SIGNATURE
// ============================================================================
/**
 * Verify Razorpay payment signature using HMAC SHA256
 * @param {string} orderId - Razorpay order ID
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} signature - Razorpay signature
 * @returns {boolean} True if signature is valid
 */
const verifyPayment = (orderId, paymentId, signature) => {
  try {
    // Validate inputs
    if (!orderId || !paymentId || !signature) {
      console.error('❌ Missing required parameters for payment verification');
      return false;
    }

    // Create HMAC SHA256 hash
    const text = `${orderId}|${paymentId}`;
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    // Compare signatures
    const isValid = generatedSignature === signature;

    if (isValid) {
      console.log('✅ Payment signature verified successfully');
    } else {
      console.error('❌ Payment signature verification failed');
      console.error('Expected:', generatedSignature);
      console.error('Received:', signature);
    }

    return isValid;

  } catch (error) {
    console.error('❌ Error verifying payment signature:', error);
    return false;
  }
};

// ============================================================================
// GET PAYMENT DETAILS
// ============================================================================
/**
 * Fetch payment details from Razorpay
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<Object>} Payment details
 */
const getPaymentDetails = async (paymentId) => {
  try {
    if (!paymentId) {
      throw new Error('Payment ID is required');
    }

    const payment = await razorpay.payments.fetch(paymentId);

    console.log('✅ Payment details fetched:', {
      id: payment.id,
      amount: payment.amount,
      status: payment.status,
      method: payment.method
    });

    return {
      id: payment.id,
      amount: payment.amount,
      amountInRupees: payment.amount / 100,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      email: payment.email,
      contact: payment.contact,
      created_at: new Date(payment.created_at * 1000).toISOString(),
      captured: payment.captured,
      description: payment.description,
      card: payment.card ? {
        last4: payment.card.last4,
        network: payment.card.network,
        type: payment.card.type
      } : null,
      upi: payment.vpa || null
    };

  } catch (error) {
    console.error('❌ Failed to fetch payment details:', error);
    throw new Error(`Failed to get payment details: ${error.message}`);
  }
};

// ============================================================================
// PROCESS REFUND
// ============================================================================
/**
 * Process a full or partial refund
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Amount to refund in rupees (optional, full refund if not specified)
 * @param {object} notes - Additional metadata
 * @returns {Promise<Object>} Refund details
 */
const processRefund = async (paymentId, amount = null, notes = {}) => {
  try {
    if (!paymentId) {
      throw new Error('Payment ID is required');
    }

    // Build refund options
    const refundOptions = {
      notes: {
        ...notes,
        refund_initiated_at: new Date().toISOString()
      }
    };

    // Add amount if specified (partial refund)
    if (amount) {
      refundOptions.amount = Math.round(amount * 100); // Convert to paise
    }

    // Process refund via Razorpay API
    const refund = await razorpay.payments.refund(paymentId, refundOptions);

    console.log('✅ Refund processed:', {
      id: refund.id,
      payment_id: refund.payment_id,
      amount: refund.amount,
      status: refund.status
    });

    return {
      refundId: refund.id,
      paymentId: refund.payment_id,
      amount: refund.amount,
      amountInRupees: refund.amount / 100,
      currency: refund.currency,
      status: refund.status,
      created_at: new Date(refund.created_at * 1000).toISOString()
    };

  } catch (error) {
    console.error('❌ Refund processing failed:', error);
    throw new Error(`Failed to process refund: ${error.message}`);
  }
};

// ============================================================================
// VERIFY WEBHOOK SIGNATURE
// ============================================================================
/**
 * Verify Razorpay webhook signature
 * @param {string} webhookBody - Raw webhook body
 * @param {string} webhookSignature - Razorpay webhook signature from headers
 * @param {string} webhookSecret - Webhook secret from Razorpay dashboard
 * @returns {boolean} True if signature is valid
 */
const verifyWebhookSignature = (webhookBody, webhookSignature, webhookSecret) => {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookBody)
      .digest('hex');

    return expectedSignature === webhookSignature;

  } catch (error) {
    console.error('❌ Webhook signature verification failed:', error);
    return false;
  }
};

// ============================================================================
// CAPTURE PAYMENT (for authorized payments)
// ============================================================================
/**
 * Capture an authorized payment
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Amount to capture in rupees
 * @param {string} currency - Currency code (default: INR)
 * @returns {Promise<Object>} Captured payment details
 */
const capturePayment = async (paymentId, amount, currency = 'INR') => {
  try {
    if (!paymentId || !amount) {
      throw new Error('Payment ID and amount are required');
    }

    const amountInPaise = Math.round(amount * 100);

    const payment = await razorpay.payments.capture(
      paymentId,
      amountInPaise,
      currency
    );

    console.log('✅ Payment captured:', {
      id: payment.id,
      amount: payment.amount,
      status: payment.status
    });

    return {
      id: payment.id,
      amount: payment.amount,
      amountInRupees: payment.amount / 100,
      currency: payment.currency,
      status: payment.status
    };

  } catch (error) {
    console.error('❌ Payment capture failed:', error);
    throw new Error(`Failed to capture payment: ${error.message}`);
  }
};

// ============================================================================
// GET ALL PAYMENTS (for admin dashboard)
// ============================================================================
/**
 * Fetch all payments with filters
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of payments
 */
const getAllPayments = async (filters = {}) => {
  try {
    const options = {
      count: filters.count || 100,
      skip: filters.skip || 0
    };

    // Add date filters if provided
    if (filters.from) {
      options.from = Math.floor(new Date(filters.from).getTime() / 1000);
    }
    if (filters.to) {
      options.to = Math.floor(new Date(filters.to).getTime() / 1000);
    }

    const payments = await razorpay.payments.all(options);

    return payments.items.map(payment => ({
      id: payment.id,
      amount: payment.amount / 100,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      email: payment.email,
      contact: payment.contact,
      created_at: new Date(payment.created_at * 1000).toISOString()
    }));

  } catch (error) {
    console.error('❌ Failed to fetch payments:', error);
    throw new Error(`Failed to get payments: ${error.message}`);
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  razorpay, // Export instance for advanced use cases
  createOrder,
  verifyPayment,
  getPaymentDetails,
  processRefund,
  verifyWebhookSignature,
  capturePayment,
  getAllPayments
};