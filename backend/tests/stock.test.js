// ============================================================================
// STOCK RESERVATION — semantics
// ============================================================================
// Exercises the in-process driver (no Redis needed). The Redis driver runs the
// same logic through Lua, so these assertions describe both.
//
// The behaviour under test is the cross-app sync rule: a cart hold drops the
// count everyone sees, abandoning gives it back, and paying does NOT.
// ============================================================================

// Must be set before the service is required — TTL is read at module load.
process.env.CART_HOLD_TTL_SECONDS = '1';
process.env.CART_SWEEP_INTERVAL_MS = '100000'; // sweep manually in tests
delete process.env.REDIS_URL;                  // force the in-process driver

const stock = require('../src/services/stock.service');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => { await stock._reset(); });
afterAll(async () => { await stock._reset(); });

describe('cart holds', () => {
  test('holding drops the availability everyone else sees', async () => {
    await stock.syncItem(1, 10);

    const res = await stock.hold('cart-A', 1, 3);

    expect(res.ok).toBe(true);
    expect(res.held).toBe(3);
    expect(res.available).toBe(7);
    // A different device asking now sees the reduced figure.
    expect(await stock.getAvailable(1)).toBe(7);
  });

  test('two carts compete for the same stock', async () => {
    await stock.syncItem(1, 5);

    expect((await stock.hold('cart-A', 1, 3)).available).toBe(2);
    expect((await stock.hold('cart-B', 1, 2)).available).toBe(0);

    // Nothing left — the third cart is refused rather than overselling.
    const third = await stock.hold('cart-C', 1, 1);
    expect(third.ok).toBe(false);
    expect(third.reason).toBe('insufficient');
    expect(await stock.getAvailable(1)).toBe(0);
  });

  test('hold sets the cart TOTAL, so a retry cannot double-count', async () => {
    await stock.syncItem(1, 10);

    await stock.hold('cart-A', 1, 2);
    await stock.hold('cart-A', 1, 2); // same request delivered twice

    expect(await stock.getAvailable(1)).toBe(8); // not 6
  });

  test('reducing the quantity in a cart returns the difference immediately', async () => {
    await stock.syncItem(1, 10);

    await stock.hold('cart-A', 1, 5);
    expect(await stock.getAvailable(1)).toBe(5);

    await stock.hold('cart-A', 1, 2); // user lowered it from 5 to 2
    expect(await stock.getAvailable(1)).toBe(8);
  });

  test('removing an item releases exactly what it held', async () => {
    await stock.syncItem(1, 10);
    await stock.hold('cart-A', 1, 4);

    const rel = await stock.release('cart-A', 1);

    expect(rel.released).toBe(4);
    expect(rel.available).toBe(10);
  });

  test('clearing a cart returns every item it held', async () => {
    await stock.syncItem(1, 10);
    await stock.syncItem(2, 10);
    await stock.hold('cart-A', 1, 3);
    await stock.hold('cart-A', 2, 6);

    const freed = await stock.releaseCart('cart-A');

    expect(freed).toHaveLength(2);
    expect(await stock.getAvailable(1)).toBe(10);
    expect(await stock.getAvailable(2)).toBe(10);
  });

  test('one cart clearing does not touch another cart\'s holds', async () => {
    await stock.syncItem(1, 10);
    await stock.hold('cart-A', 1, 3);
    await stock.hold('cart-B', 1, 2);

    await stock.releaseCart('cart-A');

    expect(await stock.getAvailable(1)).toBe(8); // B still holds its 2
  });

  test('items with unlimited stock (-1) are never decremented', async () => {
    await stock.syncItem(9, -1);

    const res = await stock.hold('cart-A', 9, 500);

    expect(res.ok).toBe(true);
    expect(await stock.getAvailable(9)).toBe(-1);
  });
});

describe('abandoned carts', () => {
  test('an expired hold is swept back into availability', async () => {
    await stock.syncItem(1, 10);
    await stock.hold('cart-ghost', 1, 4);
    expect(await stock.getAvailable(1)).toBe(6);

    await sleep(1100); // TTL is 1s in this file
    const freed = await stock.sweep();

    expect(freed).toHaveLength(1);
    expect(freed[0].released).toBe(4);
    expect(await stock.getAvailable(1)).toBe(10);
  });

  test('sweeping twice does not credit the same hold twice', async () => {
    await stock.syncItem(1, 10);
    await stock.hold('cart-ghost', 1, 4);

    await sleep(1100);
    await stock.sweep();
    await stock.sweep();

    expect(await stock.getAvailable(1)).toBe(10); // not 14
  });

  test('a live hold survives a sweep', async () => {
    await stock.syncItem(1, 10);
    await stock.hold('cart-live', 1, 4);

    await stock.sweep();

    expect(await stock.getAvailable(1)).toBe(6);
  });
});

describe('checkout', () => {
  test('committing keeps the stock deducted — it was sold, not returned', async () => {
    await stock.syncItem(1, 10);
    await stock.hold('cart-A', 1, 3);

    const committed = await stock.commitCart('cart-A');

    expect(committed.get('1')).toBe(3);
    // The critical assertion: paying must NOT put the food back on the menu.
    expect(await stock.getAvailable(1)).toBe(7);
  });

  test('a committed cart is no longer swept back after the TTL passes', async () => {
    await stock.syncItem(1, 10);
    await stock.hold('cart-A', 1, 3);
    await stock.commitCart('cart-A');

    await sleep(1100);
    await stock.sweep();

    expect(await stock.getAvailable(1)).toBe(7); // still sold
  });

  test('cancelling an order puts its stock back', async () => {
    await stock.syncItem(1, 10);
    await stock.hold('cart-A', 1, 3);
    await stock.commitCart('cart-A');

    await stock.restore([{ menu_item_id: 1, quantity: 3 }]);

    expect(await stock.getAvailable(1)).toBe(10);
  });

  test('restoring an unlimited item is a no-op', async () => {
    await stock.syncItem(9, -1);

    await stock.restore([{ menu_item_id: 9, quantity: 5 }]);

    expect(await stock.getAvailable(9)).toBe(-1);
  });
});

describe('production safety', () => {
  test('refuses to boot in production without Redis', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.REDIS_URL;
    try {
      expect(() => stock.assertProductionReady()).toThrow(/REDIS_URL is required/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
