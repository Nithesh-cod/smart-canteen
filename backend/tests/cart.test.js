// ============================================================================
// CART HOLDS — end-to-end through the HTTP API
// ============================================================================
// Proves the cross-app rule over real requests: what one client holds, every
// other client immediately sees as unavailable, and checkout keeps it deducted
// while abandonment gives it back.
// ============================================================================

process.env.CART_HOLD_TTL_SECONDS = '1';
process.env.CART_SWEEP_INTERVAL_MS = '100000'; // sweep manually
delete process.env.REDIS_URL;

const request = require('supertest');
const app = require('../src/app');
const { seed } = require('./helpers');
const stock = require('../src/services/stock.service');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Seed fixture (tests/helpers.js):
//   1 = Chai   → stock -1 (unlimited)
//   2 = Samosa → stock 1
//   3 = Dosa   → stock 5   ← the tracked item these tests hold against
const DOSA = 3;
const DOSA_STOCK = 5;
const CHAI = 1; // unlimited

/** A fresh anonymous cart, as the kiosk/web/APK clients each obtain one. */
const newCart = async () => {
  const res = await request(app).post('/api/cart/session').expect(201);
  return res.body.data.cart_token;
};

const setItem = (token, menu_item_id, quantity) =>
  request(app)
    .put('/api/cart/items')
    .set('X-Cart-Token', token)
    .send({ menu_item_id, quantity });

const availabilityOf = async (id) => {
  const res = await request(app).get('/api/cart/availability').expect(200);
  return res.body.data.items.find((i) => i.id === id)?.available;
};

beforeEach(async () => {
  await seed();
  await stock._reset(); // drop holds AND cached counts between tests
});
afterAll(async () => { await stock._reset(); });

describe('cart session', () => {
  test('mints an unforgeable cart token', async () => {
    const res = await request(app).post('/api/cart/session').expect(201);
    expect(res.body.data.cart_token).toEqual(expect.any(String));
    expect(res.body.data.cart_id).toMatch(/^g:/);
  });

  test('a cart id supplied in the body is ignored — identity comes from the token', async () => {
    const victim = await newCart();
    await setItem(victim, DOSA, 2).expect(200);

    // An attacker naming the victim's cart cannot release its holds.
    const before = await availabilityOf(DOSA);
    await request(app)
      .delete('/api/cart')
      .send({ cart_id: 'g:whatever', cartId: 'g:whatever' })
      .expect(200);

    expect(await availabilityOf(DOSA)).toBe(before);
  });
});

describe('holding stock', () => {
  test("one client's hold is visible to every other client", async () => {
    expect(await availabilityOf(DOSA)).toBe(DOSA_STOCK);

    const kiosk = await newCart();
    const res = await setItem(kiosk, DOSA, 3).expect(200);

    expect(res.body.data.held).toBe(3);
    // A completely separate client reads the reduced figure.
    expect(await availabilityOf(DOSA)).toBe(DOSA_STOCK - 3);
  });

  test('removing from the cart puts stock back for everyone', async () => {
    const kiosk = await newCart();

    await setItem(kiosk, DOSA, 3).expect(200);
    await setItem(kiosk, DOSA, 0).expect(200); // removed

    expect(await availabilityOf(DOSA)).toBe(DOSA_STOCK);
  });

  test('lowering the quantity returns only the difference', async () => {
    const kiosk = await newCart();

    await setItem(kiosk, DOSA, 4).expect(200);
    await setItem(kiosk, DOSA, 1).expect(200);

    expect(await availabilityOf(DOSA)).toBe(DOSA_STOCK - 1);
  });

  test('clearing the cart releases everything it held', async () => {
    const kiosk = await newCart();
    await setItem(kiosk, DOSA, 2).expect(200);

    await request(app).delete('/api/cart').set('X-Cart-Token', kiosk).expect(200);

    expect(await availabilityOf(DOSA)).toBe(DOSA_STOCK);
  });

  test('a second cart cannot take stock the first is holding', async () => {
    const a = await newCart();
    const b = await newCart();

    await setItem(a, DOSA, DOSA_STOCK).expect(200); // A holds the lot

    const res = await setItem(b, DOSA, 1).expect(409);
    expect(res.body.message).toMatch(/Only 0 left/);
    expect(await availabilityOf(DOSA)).toBe(0);
  });

  test('unlimited items are never held down', async () => {
    const kiosk = await newCart();

    await setItem(kiosk, CHAI, 99).expect(200);

    expect(await availabilityOf(CHAI)).toBe(-1);
  });

  test('a request without a cart session is rejected', async () => {
    const res = await request(app)
      .put('/api/cart/items')
      .send({ menu_item_id: DOSA, quantity: 1 })
      .expect(400);
    expect(res.body.message).toMatch(/No cart session/);
  });
});

describe('abandoned carts', () => {
  test('stock comes back on its own once the hold expires', async () => {
    const ghost = await newCart();
    await setItem(ghost, DOSA, 3).expect(200);
    expect(await availabilityOf(DOSA)).toBe(DOSA_STOCK - 3);

    await sleep(1100);
    await stock.sweep();

    expect(await availabilityOf(DOSA)).toBe(DOSA_STOCK);
  });
});

describe('checkout', () => {
  test('placing an order keeps the stock deducted, not returned', async () => {
    const kiosk = await newCart();
    await setItem(kiosk, DOSA, 2).expect(200);

    await request(app)
      .post('/api/orders')
      .set('X-Cart-Token', kiosk)
      .send({ items: [{ menu_item_id: DOSA, quantity: 2 }], guest_name: 'Test Guest' })
      .expect(201);

    expect(await availabilityOf(DOSA)).toBe(DOSA_STOCK - 2);
  });

  test('a paid order is not swept back into stock after the TTL', async () => {
    const kiosk = await newCart();
    await setItem(kiosk, DOSA, 2).expect(200);

    await request(app)
      .post('/api/orders')
      .set('X-Cart-Token', kiosk)
      .send({ items: [{ menu_item_id: DOSA, quantity: 2 }], guest_name: 'Test Guest' })
      .expect(201);

    await sleep(1100);
    await stock.sweep();

    // The sale must survive the sweeper — this is the bug that would put sold
    // food back on the menu ten minutes after every checkout.
    expect(await availabilityOf(DOSA)).toBe(DOSA_STOCK - 2);
  });
});
