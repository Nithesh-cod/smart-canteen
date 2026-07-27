const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');
const { seed } = require('./helpers');
const Order = require('../src/models/Order');

beforeEach(async () => { await seed(); });

const signBody = (body) =>
  crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');

const captureBody = (razorpayOrderId) =>
  JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_TEST', order_id: razorpayOrderId, method: 'upi' } } },
  });

const sendWebhook = (body, signature) =>
  request(app)
    .post('/api/payments/webhook')
    .set('X-Razorpay-Signature', signature)
    .set('Content-Type', 'application/json')
    .send(body); // `body` is a pre-serialized string; superagent sends it verbatim
                 // so express.raw() sees the exact bytes we signed.

describe('Razorpay webhook', () => {
  test('an invalid signature → 400 (never confirms payment)', async () => {
    const body = captureBody('order_ANY');
    const res = await sendWebhook(body, 'deadbeef');
    expect(res.status).toBe(400);
  });

  test('a valid signature marks the order paid, and redelivery is idempotent', async () => {
    // pending order with a known razorpay_order_id
    const order = await Order.create(
      { student_id: null, total_amount: 20, guest_name: 'G' },
      [{ menu_item_id: 1, item_name: 'Chai', quantity: 1, price: 20 }]
    );
    await Order.updatePayment(order.id, { payment_status: 'pending', razorpay_order_id: 'order_ABC' });

    const body = captureBody('order_ABC');
    const sig = signBody(body);

    const first = await sendWebhook(body, sig);
    expect(first.status).toBe(200);
    expect((await Order.getById(order.id)).payment_status).toBe('paid');

    // Razorpay redelivers for ~72h — a second identical delivery must not error
    // or double-apply. The order stays paid.
    const second = await sendWebhook(body, sig);
    expect(second.status).toBe(200);
    expect((await Order.getById(order.id)).payment_status).toBe('paid');
  });

  test('a webhook for an unknown razorpay_order_id is acknowledged (200) but changes nothing', async () => {
    const body = captureBody('order_NONEXISTENT');
    const res = await sendWebhook(body, signBody(body));
    expect(res.status).toBe(200);
  });
});
