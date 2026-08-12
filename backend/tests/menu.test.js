// ============================================================================
// MENU EDITING — restock, permissions, live-availability reconciliation
// ============================================================================
// Regression cover for canteen-floor bugs: a restocked dish staying invisible,
// a chef's Save being silently refused, and a stock edit handing out units
// that are already sitting in someone's cart.
// ============================================================================

process.env.CART_HOLD_TTL_SECONDS = '60';
process.env.CART_SWEEP_INTERVAL_MS = '100000';
delete process.env.REDIS_URL;

const request = require('supertest');
const app = require('../src/app');
const { seed, login } = require('./helpers');
const stock = require('../src/services/stock.service');

const DOSA = 3;       // seeded with stock 5
const DOSA_STOCK = 5;

let adminToken;
let chefToken;

beforeEach(async () => {
  await seed();
  await stock._reset();
  adminToken = await login(app, 'OWNER001');
  chefToken  = await login(app, 'CHEF001');
});
afterAll(async () => { await stock._reset(); });

const putMenu = (token, id, body) =>
  request(app).put(`/api/menu/${id}`).set('Authorization', `Bearer ${token}`).send(body);

const getItem = async (id) => {
  const res = await request(app).get('/api/menu').expect(200);
  return res.body.data.find((i) => i.id === id);
};

describe('restocking', () => {
  test('selling the last unit hides the item, and restocking brings it back', async () => {
    // Buy the whole tray.
    await request(app)
      .post('/api/orders')
      .send({ items: [{ menu_item_id: DOSA, quantity: DOSA_STOCK }], guest_name: 'G' })
      .expect(201);

    let item = await getItem(DOSA);
    expect(item.stock_quantity).toBe(0);
    expect(item.is_available).toBe(false); // auto-hidden when it ran out

    // The chef refills the tray and types the new count.
    await putMenu(adminToken, DOSA, { stock_quantity: 12 }).expect(200);

    item = await getItem(DOSA);
    expect(item.stock_quantity).toBe(12);
    // The bug: this stayed false, so the dish never came back on the kiosks.
    expect(item.is_available).toBe(true);
  });

  test('an explicit is_available=false in the same request still wins', async () => {
    await request(app)
      .post('/api/orders')
      .send({ items: [{ menu_item_id: DOSA, quantity: DOSA_STOCK }], guest_name: 'G' })
      .expect(201);

    await putMenu(adminToken, DOSA, { stock_quantity: 12, is_available: false }).expect(200);

    const item = await getItem(DOSA);
    expect(item.is_available).toBe(false); // deliberately kept off the menu
  });

  test('restocking does not resurrect an item the chef turned off by hand', async () => {
    // Still has stock, but was switched off deliberately.
    await request(app)
      .patch(`/api/menu/${DOSA}/availability`)
      .set('Authorization', `Bearer ${chefToken}`)
      .expect(200);
    expect((await getItem(DOSA)).is_available).toBe(false);

    await putMenu(adminToken, DOSA, { stock_quantity: 20 }).expect(200);

    // stock never hit zero, so this was not a sold-out hide — leave it off.
    expect((await getItem(DOSA)).is_available).toBe(false);
  });
});

describe('live availability reconciliation', () => {
  test('a stock edit preserves units already held in a cart', async () => {
    const session = await request(app).post('/api/cart/session').expect(201);
    const cartToken = session.body.data.cart_token;

    await request(app)
      .put('/api/cart/items')
      .set('X-Cart-Token', cartToken)
      .send({ menu_item_id: DOSA, quantity: 2 })
      .expect(200);

    expect(await stock.getAvailable(DOSA)).toBe(DOSA_STOCK - 2); // 3

    // Chef adds 5 more to the tray: 5 -> 10 on hand.
    await putMenu(adminToken, DOSA, { stock_quantity: 10 }).expect(200);

    // Must be 10 - 2 held = 8. An absolute overwrite would publish 10 and
    // sell the two units already in that cart a second time.
    expect(await stock.getAvailable(DOSA)).toBe(8);
  });
});

describe('menu permissions', () => {
  test('a chef can correct stock', async () => {
    await putMenu(chefToken, DOSA, { stock_quantity: 7 }).expect(200);
    expect((await getItem(DOSA)).stock_quantity).toBe(7);
  });

  test('a chef cannot reprice the menu', async () => {
    const res = await putMenu(chefToken, DOSA, { price: 1 }).expect(403);
    expect(res.body.message).toMatch(/only update stock and availability/i);
    expect((await getItem(DOSA)).price).toBe(50); // unchanged
  });

  test('an owner can change anything', async () => {
    await putMenu(adminToken, DOSA, { price: 60, name: 'Ghee Dosa' }).expect(200);
    const item = await getItem(DOSA);
    expect(item.price).toBe(60);
    expect(item.name).toBe('Ghee Dosa');
  });

  test('deleting stays owner-only', async () => {
    await request(app)
      .delete(`/api/menu/${DOSA}`)
      .set('Authorization', `Bearer ${chefToken}`)
      .expect(403);
  });
});
