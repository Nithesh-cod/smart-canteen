const request = require('supertest');
const app = require('../src/app');
const { seed, db } = require('./helpers');

// Fresh stock before every test.
beforeEach(async () => { await seed(); });

const placeGuestOrder = (items) =>
  request(app).post('/api/orders').send({ items, guest_name: 'Guest' });

describe('Orders + atomic stock reserve', () => {
  test('a guest order decrements tracked stock', async () => {
    const res = await placeGuestOrder([{ menu_item_id: 3, quantity: 2 }]); // Dosa, stock 5
    expect(res.status).toBe(201);
    const dosa = await db.collection('menu_items').doc('3').get();
    expect(dosa.data().stock_quantity).toBe(3);
  });

  test('ordering more than available stock → 400', async () => {
    const res = await placeGuestOrder([{ menu_item_id: 2, quantity: 5 }]); // Samosa, stock 1
    expect(res.status).toBe(400);
  });

  test('an unlimited item (stock -1) never blocks', async () => {
    const res = await placeGuestOrder([{ menu_item_id: 1, quantity: 99 }]); // Chai, unlimited
    expect(res.status).toBe(201);
    const chai = await db.collection('menu_items').doc('1').get();
    expect(chai.data().stock_quantity).toBe(-1); // untouched
  });

  test('stock reaching zero flips is_available to false', async () => {
    const res = await placeGuestOrder([{ menu_item_id: 2, quantity: 1 }]); // Samosa, stock 1 → 0
    expect(res.status).toBe(201);
    const samosa = await db.collection('menu_items').doc('2').get();
    expect(samosa.data().stock_quantity).toBe(0);
    expect(samosa.data().is_available).toBe(false);
  });

  // The headline test: the overselling race, driven through the full HTTP stack.
  test('THREE concurrent orders for stock=1 → exactly one succeeds, never oversold', async () => {
    const results = await Promise.all([
      placeGuestOrder([{ menu_item_id: 2, quantity: 1 }]),
      placeGuestOrder([{ menu_item_id: 2, quantity: 1 }]),
      placeGuestOrder([{ menu_item_id: 2, quantity: 1 }]),
    ]);
    const ok     = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status === 400);
    expect(ok.length).toBe(1);
    expect(failed.length).toBe(2);
    const samosa = await db.collection('menu_items').doc('2').get();
    expect(samosa.data().stock_quantity).toBe(0); // MUST NOT be negative
  });

  test('a missing menu item → 404', async () => {
    const res = await placeGuestOrder([{ menu_item_id: 999, quantity: 1 }]);
    expect(res.status).toBe(404);
  });
});
