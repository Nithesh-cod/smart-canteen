// ============================================================================
// STOCK RESERVATION SERVICE
// ============================================================================
// The live availability authority shared by all three clients (counter PC,
// hosted web app, Android APK). Adding an item to a cart HOLDS stock for a
// short window; the count everyone else sees drops immediately. Abandoning the
// cart returns it automatically.
//
// ── WHY THIS ISN'T IN FIRESTORE ─────────────────────────────────────────────
// Firestore sustains roughly ONE write per second per document. Holding stock
// on add-to-cart means writing the item's document on every cart tap — a
// popular dish during a lunch rush needs hundreds of writes/second against
// that limit, so the writes would be rejected or contend into multi-second
// latency. Redis does atomic integer counters at orders of magnitude more
// throughput, which is exactly the shape of this problem.
//
// Firestore stays the authority for ON-HAND stock (what the chef sets).
// Redis holds the DERIVED live figure: on-hand minus active holds.
//
// ── EXPIRY: WHY A SWEEPER AND NOT KEY TTLs ──────────────────────────────────
// The obvious design is one key per hold with a Redis TTL. It's wrong here:
// when a TTL key vanishes, Redis does not tell you what quantity it held, so
// there is nothing to give back to the availability counter, and stock would
// leak to zero permanently. Keyspace notifications are explicitly fire-and-
// forget — a disconnected subscriber silently loses events.
//
// Instead every hold is recorded in a global sorted set scored by its expiry
// timestamp. A sweeper (periodic + opportunistic before reads) pops whatever
// has aged out and INCRs the freed quantity back. Nothing is lost if a process
// dies: the next sweep on any instance picks it up.
//
// ── NO REDIS? ───────────────────────────────────────────────────────────────
// Without REDIS_URL this falls back to an in-process driver with identical
// semantics, so local dev and the test suite run with no extra service. That
// fallback is correct for ONE instance only and refuses to pretend otherwise
// in production (see assertProductionReady).
// ============================================================================

const logger = require('../utils/logger');

const HOLD_TTL_SECONDS = parseInt(process.env.CART_HOLD_TTL_SECONDS, 10) || 600; // 10 min
const UNLIMITED = -1;

// ============================================================================
// DRIVERS
// ============================================================================
// Both drivers expose the same tiny surface the logic below needs. Keeping the
// interface this small is what lets the in-memory version be a faithful stand-in
// rather than an approximation.

/**
 * In-process driver. Single-instance only — used for dev and tests.
 */
class MemoryDriver {
  constructor() {
    this.avail = new Map();   // itemId -> available count
    this.holds = new Map();   // holdKey -> { cartId, itemId, qty, expiresAt }
  }

  async getAvail(itemId) {
    const v = this.avail.get(String(itemId));
    return v === undefined ? null : v;
  }

  async setAvail(itemId, value) {
    this.avail.set(String(itemId), value);
  }

  /** Atomically take `qty` if available. Returns the new count, or null if short. */
  async take(itemId, qty) {
    const key = String(itemId);
    const cur = this.avail.get(key);
    if (cur === undefined) return null;
    if (cur === UNLIMITED) return UNLIMITED;
    if (cur < qty) return null;
    const next = cur - qty;
    this.avail.set(key, next);
    return next;
  }

  /** Give `qty` back. Returns the new count. */
  async give(itemId, qty) {
    const key = String(itemId);
    const cur = this.avail.get(key);
    if (cur === undefined) return null;
    if (cur === UNLIMITED) return UNLIMITED;
    const next = cur + qty;
    this.avail.set(key, next);
    return next;
  }

  async putHold(holdKey, hold) { this.holds.set(holdKey, hold); }
  async getHold(holdKey)       { return this.holds.get(holdKey) || null; }
  async dropHold(holdKey)      { return this.holds.delete(holdKey); }

  async holdsForCart(cartId) {
    return [...this.holds.entries()]
      .filter(([, h]) => h.cartId === cartId)
      .map(([key, h]) => ({ key, ...h }));
  }

  async expiredHolds(nowMs) {
    return [...this.holds.entries()]
      .filter(([, h]) => h.expiresAt <= nowMs)
      .map(([key, h]) => ({ key, ...h }));
  }

  async close() { /* nothing to close */ }
}

/**
 * Redis driver. Hold/release are Lua so the availability counter and the hold
 * record move together — a crash between the two would otherwise strand stock.
 */
class RedisDriver {
  constructor(client) {
    this.r = client;
    this.K_AVAIL = (id) => `sc:avail:${id}`;
    this.K_HOLD  = (k)  => `sc:hold:${k}`;
    this.Z_HOLDS = 'sc:holds:expiry';

    // KEYS[1]=avail KEYS[2]=hold KEYS[3]=zset
    // ARGV[1]=qty ARGV[2]=expiresAt ARGV[3]=holdKey ARGV[4]=cartId ARGV[5]=itemId
    this.LUA_TAKE = `
      local cur = redis.call('GET', KEYS[1])
      if cur == false then return {-2, 0} end
      cur = tonumber(cur)
      local qty = tonumber(ARGV[1])
      if cur ~= -1 then
        if cur < qty then return {-3, cur} end
        cur = cur - qty
        redis.call('SET', KEYS[1], cur)
      end
      redis.call('HSET', KEYS[2],
        'cartId', ARGV[4], 'itemId', ARGV[5],
        'qty', ARGV[1], 'expiresAt', ARGV[2])
      redis.call('ZADD', KEYS[3], ARGV[2], ARGV[3])
      return {1, cur}
    `;

    // KEYS[1]=avail KEYS[2]=hold KEYS[3]=zset  ARGV[1]=holdKey
    this.LUA_GIVE = `
      local h = redis.call('HGETALL', KEYS[2])
      if #h == 0 then return {-1, 0} end
      local qty = 0
      for i = 1, #h, 2 do if h[i] == 'qty' then qty = tonumber(h[i+1]) end end
      local cur = redis.call('GET', KEYS[1])
      if cur ~= false then
        cur = tonumber(cur)
        if cur ~= -1 then
          cur = cur + qty
          redis.call('SET', KEYS[1], cur)
        end
      else
        cur = 0
      end
      redis.call('DEL', KEYS[2])
      redis.call('ZREM', KEYS[3], ARGV[1])
      return {qty, cur}
    `;
  }

  async getAvail(itemId) {
    const v = await this.r.get(this.K_AVAIL(itemId));
    return v === null ? null : parseInt(v, 10);
  }

  async setAvail(itemId, value) {
    await this.r.set(this.K_AVAIL(itemId), String(value));
  }

  async takeAtomic(cartId, itemId, qty, expiresAt, holdKey) {
    const res = await this.r.eval(
      this.LUA_TAKE, 3,
      this.K_AVAIL(itemId), this.K_HOLD(holdKey), this.Z_HOLDS,
      String(qty), String(expiresAt), holdKey, cartId, String(itemId),
    );
    return { code: Number(res[0]), avail: Number(res[1]) };
  }

  async giveAtomic(itemId, holdKey) {
    const res = await this.r.eval(
      this.LUA_GIVE, 3,
      this.K_AVAIL(itemId), this.K_HOLD(holdKey), this.Z_HOLDS,
      holdKey,
    );
    return { qty: Number(res[0]), avail: Number(res[1]) };
  }

  async getHold(holdKey) {
    const h = await this.r.hgetall(this.K_HOLD(holdKey));
    if (!h || !h.qty) return null;
    return {
      cartId: h.cartId,
      itemId: h.itemId,
      qty: parseInt(h.qty, 10),
      expiresAt: parseInt(h.expiresAt, 10),
    };
  }

  async holdKeysForCart(cartId) {
    // Hold keys embed the cart id, so the expiry ZSET doubles as the index —
    // no extra per-cart set to keep consistent.
    const all = await this.r.zrange(this.Z_HOLDS, 0, -1);
    return all.filter((k) => k.startsWith(`${cartId}::`));
  }

  async expiredHoldKeys(nowMs, limit = 500) {
    return this.r.zrangebyscore(this.Z_HOLDS, '-inf', nowMs, 'LIMIT', 0, limit);
  }

  async close() { try { await this.r.quit(); } catch { /* already gone */ } }
}

// ============================================================================
// DRIVER SELECTION
// ============================================================================

let driver = null;
let isRedis = false;

const buildDriver = () => {
  if (driver) return driver;

  const url = process.env.REDIS_URL;
  if (url) {
    const Redis = require('ioredis');
    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      lazyConnect: false,
    });
    client.on('error', (e) => logger.error('[stock] Redis error:', e.message));
    client.on('connect', () => logger.success('[stock] Redis connected — stock authority is Redis'));
    driver = new RedisDriver(client);
    isRedis = true;
  } else {
    logger.warn(
      '[stock] REDIS_URL not set — using the in-process stock driver. ' +
      'Correct for a single instance only (dev/test).'
    );
    driver = new MemoryDriver();
    isRedis = false;
  }
  return driver;
};

/**
 * Refuse to run a multi-instance production deploy on the in-memory driver:
 * each instance would keep its own private idea of availability, so the same
 * last samosa could be sold once per instance. Called from app.js on boot.
 *
 * ALLOW_IN_MEMORY_STOCK=true opts out. That is legitimate for exactly one
 * shape of deployment — a SINGLE instance, e.g. a free host — where there is
 * no second process to disagree with, and the in-memory driver is genuinely
 * correct. It is not a way to skip provisioning Redis on a scaled deploy: the
 * moment a second instance starts, both hold private counts and the same last
 * item sells twice with nothing logged. Hence the deliberate, loud opt-in
 * rather than a silent fallback.
 */
const assertProductionReady = () => {
  if (process.env.NODE_ENV !== 'production' || process.env.REDIS_URL) return;

  if (process.env.ALLOW_IN_MEMORY_STOCK === 'true') {
    logger.warn(
      '[stock] Running WITHOUT Redis by explicit opt-in (ALLOW_IN_MEMORY_STOCK). ' +
      'Cart holds live in this process only. This is safe for ONE instance and ' +
      'ONLY one — scaling out without setting REDIS_URL will oversell stock ' +
      'silently. Holds are also lost on restart, so carts release early after ' +
      'a redeploy or a free-tier cold start.'
    );
    return;
  }

  throw new Error(
    'REDIS_URL is required in production. Cart stock holds are shared state; ' +
    'the in-process fallback would give every server instance its own stock ' +
    'count and oversell every tracked item.\n' +
    'Running a single instance on purpose (e.g. a free host)? Set ' +
    'ALLOW_IN_MEMORY_STOCK=true to acknowledge the limitation.'
  );
};

// ============================================================================
// PUBLIC API
// ============================================================================

const holdKeyFor = (cartId, itemId) => `${cartId}::${itemId}`;

/**
 * Seed/refresh the live availability for an item from its Firestore on-hand
 * value. Called when the chef edits stock and lazily on first touch.
 *
 * `-1` means untracked/unlimited and is stored verbatim so the hot path never
 * has to special-case a missing key.
 */
const syncItem = async (itemId, onHand) => {
  const d = buildDriver();
  await d.setAvail(itemId, Number(onHand));
  return Number(onHand);
};

/** Current live availability; null when the item was never synced. */
const getAvailable = async (itemId) => buildDriver().getAvail(itemId);

/**
 * Availability for many items at once, seeding any the cache hasn't seen from
 * the supplied on-hand values.
 * @param {Array<{id:number|string, stock_quantity:number}>} items
 * @returns {Promise<Map<string, number>>}
 */
const getAvailableMany = async (items) => {
  const d = buildDriver();
  const out = new Map();
  for (const it of items) {
    let v = await d.getAvail(it.id);
    if (v === null || v === undefined) {
      v = await syncItem(it.id, it.stock_quantity ?? UNLIMITED);
    }
    out.set(String(it.id), v);
  }
  return out;
};

/**
 * Hold `qty` of `itemId` for `cartId`, extending the window if a hold already
 * exists. Returns { ok, available, held, reason }.
 *
 * `qty` is the TOTAL the cart wants, not a delta — carts are edited by setting
 * quantities, and making this idempotent means a retried request (flaky mobile
 * network, double tap) can't silently double-hold.
 */
const hold = async (cartId, itemId, qty, onHandFallback = UNLIMITED) => {
  const d = buildDriver();
  await sweep(); // opportunistic — return anything that aged out first

  const key = holdKeyFor(cartId, itemId);
  const expiresAt = Date.now() + HOLD_TTL_SECONDS * 1000;

  // Seed availability on first touch of this item.
  if ((await d.getAvail(itemId)) === null) {
    await syncItem(itemId, onHandFallback);
  }

  // Idempotent: release whatever this cart already holds, then take the new
  // total. Releasing first means shrinking a cart returns stock immediately.
  const existing = await releaseOne(cartId, itemId, { silent: true });

  if (qty <= 0) {
    const available = await d.getAvail(itemId);
    return { ok: true, available, held: 0, released: existing };
  }

  if (isRedis) {
    const { code, avail } = await d.takeAtomic(cartId, itemId, qty, expiresAt, key);
    if (code === -2) return { ok: false, reason: 'unknown_item', available: null, held: 0 };
    if (code === -3) return { ok: false, reason: 'insufficient', available: avail, held: 0 };
    return { ok: true, available: avail, held: qty };
  }

  const next = await d.take(itemId, qty);
  if (next === null) {
    const available = await d.getAvail(itemId);
    return { ok: false, reason: 'insufficient', available, held: 0 };
  }
  await d.putHold(key, { cartId, itemId: String(itemId), qty, expiresAt });
  return { ok: true, available: next, held: qty };
};

/**
 * Release this cart's hold on one item. Internal — `silent` skips the
 * "nothing to release" bookkeeping the public path reports.
 */
const releaseOne = async (cartId, itemId, { silent = false } = {}) => {
  const d = buildDriver();
  const key = holdKeyFor(cartId, itemId);

  if (isRedis) {
    const { qty, avail } = await d.giveAtomic(itemId, key);
    if (qty <= 0) return silent ? 0 : { released: 0, available: avail };
    return silent ? qty : { released: qty, available: avail };
  }

  const h = await d.getHold(key);
  if (!h) return silent ? 0 : { released: 0, available: await d.getAvail(itemId) };
  const avail = await d.give(itemId, h.qty);
  await d.dropHold(key);
  return silent ? h.qty : { released: h.qty, available: avail };
};

/** Public single-item release. */
const release = async (cartId, itemId) => releaseOne(cartId, itemId, { silent: false });

/**
 * Release every hold a cart owns — used when the kiosk clears the cart, the
 * session ends, or an order fails after holds were taken.
 * @returns {Promise<Array<{itemId:string, released:number, available:number}>>}
 */
const releaseCart = async (cartId) => {
  const d = buildDriver();
  const out = [];

  if (isRedis) {
    const keys = await d.holdKeysForCart(cartId);
    for (const key of keys) {
      const itemId = key.split('::')[1];
      const { qty, avail } = await d.giveAtomic(itemId, key);
      if (qty > 0) out.push({ itemId, released: qty, available: avail });
    }
    return out;
  }

  for (const h of await d.holdsForCart(cartId)) {
    const avail = await d.give(h.itemId, h.qty);
    await d.dropHold(h.key);
    out.push({ itemId: String(h.itemId), released: h.qty, available: avail });
  }
  return out;
};

/**
 * Turn a cart's holds into a committed sale: the stock is already deducted
 * from availability, so committing just discards the hold records WITHOUT
 * giving anything back.
 *
 * This is the one place where dropping a hold must not increment the counter —
 * getting it wrong would hand the customer their food and put the stock back
 * on the menu.
 *
 * @returns {Promise<Map<string, number>>} itemId -> quantity committed
 */
const commitCart = async (cartId) => {
  const d = buildDriver();
  const committed = new Map();

  if (isRedis) {
    const keys = await d.holdKeysForCart(cartId);
    for (const key of keys) {
      const h = await d.getHold(key);
      if (!h) continue;
      committed.set(String(h.itemId), h.qty);
      // Drop the record and its expiry entry; availability stays deducted.
      await d.r.del(d.K_HOLD(key));
      await d.r.zrem(d.Z_HOLDS, key);
    }
    return committed;
  }

  for (const h of await d.holdsForCart(cartId)) {
    committed.set(String(h.itemId), h.qty);
    await d.dropHold(h.key);
  }
  return committed;
};

/**
 * Reconcile live availability after the chef edits an item's on-hand stock.
 *
 * This must NOT be a plain overwrite. Re-seeding availability to the new
 * on-hand figure silently discards every active hold: if three units are in
 * customers' carts and the chef restocks to 20, an absolute set publishes 20
 * as available while three are already spoken for — so the last three get sold
 * twice. Applying the DELTA keeps existing holds intact.
 *
 * The transitions to/from untracked (-1) are the exceptions and are set
 * absolutely, since an unlimited item has no meaningful held count.
 *
 * @param {number|string} itemId
 * @param {number} oldOnHand previous stock_quantity
 * @param {number} newOnHand new stock_quantity
 * @returns {Promise<number>} the new live availability
 */
const applyOnHandChange = async (itemId, oldOnHand, newOnHand) => {
  const d = buildDriver();
  const prev = Number(oldOnHand);
  const next = Number(newOnHand);

  if (next === UNLIMITED || prev === UNLIMITED) {
    await d.setAvail(itemId, next);
    return next;
  }

  const delta = next - prev;
  if (delta === 0) {
    const cur = await d.getAvail(itemId);
    return cur === null ? syncItem(itemId, next) : cur;
  }

  if ((await d.getAvail(itemId)) === null) return syncItem(itemId, next);

  if (isRedis) {
    return Number(await d.r.incrby(d.K_AVAIL(itemId), delta));
  }
  return delta > 0 ? d.give(itemId, delta) : d.take(itemId, -delta) ?? d.getAvail(itemId);
};

/**
 * Return stock for a cancelled/refunded order. Mirrors commitCart: the sale
 * deducted availability permanently, so a cancellation has to add it back.
 * @param {Array<{menu_item_id:number|string, quantity:number}>} items
 */
const restore = async (items) => {
  const d = buildDriver();
  const out = [];
  for (const it of items || []) {
    const id = String(it.menu_item_id);
    const cur = await d.getAvail(id);
    if (cur === null || cur === UNLIMITED) continue; // untracked
    const next = isRedis
      ? Number(await d.r.incrby(d.K_AVAIL(id), Number(it.quantity)))
      : await d.give(id, Number(it.quantity));
    out.push({ itemId: id, available: next });
  }
  return out;
};

/**
 * Return every hold that has aged out. Runs opportunistically before holds and
 * on a timer, so an abandoned cart's stock comes back without anyone acting.
 * @returns {Promise<Array<{itemId:string, released:number, available:number}>>}
 */
const sweep = async () => {
  const d = buildDriver();
  const now = Date.now();
  const freed = [];

  try {
    if (isRedis) {
      const keys = await d.expiredHoldKeys(now);
      for (const key of keys) {
        const itemId = key.split('::')[1];
        const { qty, avail } = await d.giveAtomic(itemId, key);
        if (qty > 0) freed.push({ itemId, released: qty, available: avail });
      }
    } else {
      for (const h of await d.expiredHolds(now)) {
        const avail = await d.give(h.itemId, h.qty);
        await d.dropHold(h.key);
        freed.push({ itemId: String(h.itemId), released: h.qty, available: avail });
      }
    }
  } catch (err) {
    logger.error('[stock] sweep failed', err.message);
  }
  return freed;
};

/**
 * Start the background sweeper.
 * @param {(freed:Array)=>void} onFreed called with released holds so the
 *        caller can broadcast the new availability to connected clients.
 * @returns {() => void} stop function
 */
let sweepTimer = null;
const startSweeper = (onFreed) => {
  if (sweepTimer) return () => clearInterval(sweepTimer);
  const everyMs = parseInt(process.env.CART_SWEEP_INTERVAL_MS, 10) || 15_000;
  sweepTimer = setInterval(async () => {
    const freed = await sweep();
    if (freed.length && typeof onFreed === 'function') onFreed(freed);
  }, everyMs);
  if (sweepTimer.unref) sweepTimer.unref(); // never hold the process open
  return () => { clearInterval(sweepTimer); sweepTimer = null; };
};

/** Test/shutdown helper. */
const _reset = async () => {
  if (driver) await driver.close();
  driver = null;
  isRedis = false;
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
};

module.exports = {
  HOLD_TTL_SECONDS,
  UNLIMITED,
  assertProductionReady,
  syncItem,
  applyOnHandChange,
  getAvailable,
  getAvailableMany,
  hold,
  release,
  releaseCart,
  commitCart,
  restore,
  sweep,
  startSweeper,
  _reset,
};
