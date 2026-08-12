// ============================================================================
// CART CONTROLLER — live stock holds
// ============================================================================
// Backs the "adding to a cart drops the count for everyone" behaviour that
// keeps the counter PC, the hosted web app and the Android app agreeing.
//
// Every mutation broadcasts the new availability on the socket bus, so the
// other two clients repaint without polling.
// ============================================================================

const MenuItem = require('../models/MenuItem');
const stock    = require('../services/stock.service');
const logger   = require('../utils/logger');
const { asyncHandler }   = require('../middleware/error.middleware');
const { issueCartToken } = require('../middleware/cart.middleware');

/**
 * Push availability changes to every connected client.
 * @param {object} io
 * @param {Array<{itemId:string, available:number}>} changes
 */
const broadcastAvailability = (io, changes) => {
  if (!io || !changes || !changes.length) return;
  for (const c of changes) {
    io.emit('stock:availability', {
      id: Number(c.itemId),
      available: c.available,
      // -1 means untracked; anything else at 0 is sold out for now.
      sold_out: c.available === 0,
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// POST /api/cart/session
// ============================================================================
/** Mint a signed cart token for an anonymous (guest) cart. */
const createSession = asyncHandler(async (req, res) => {
  // A logged-in student already has a durable cart id derived from their JWT;
  // handing them a second anonymous one would split their cart across devices.
  if (req.cartId && req.cartId.startsWith('s:')) {
    return res.json({
      success: true,
      data: { cart_id: req.cartId, cart_token: null, source: 'account' },
    });
  }
  const { cartId, token } = issueCartToken();
  return res.status(201).json({
    success: true,
    data: { cart_id: cartId, cart_token: token, source: 'guest' },
  });
});

// ============================================================================
// GET /api/cart/availability
// ============================================================================
/**
 * Live availability for the whole menu — what each client should render as
 * "N left", rather than the raw Firestore stock_quantity which ignores holds.
 */
const getAvailability = asyncHandler(async (req, res) => {
  const items = await MenuItem.getAll();
  const map = await stock.getAvailableMany(items);

  return res.json({
    success: true,
    data: {
      items: items.map((i) => ({
        id: i.id,
        available: map.get(String(i.id)) ?? i.stock_quantity ?? stock.UNLIMITED,
      })),
      hold_ttl_seconds: stock.HOLD_TTL_SECONDS,
    },
  });
});

// ============================================================================
// PUT /api/cart/items
// ============================================================================
/**
 * Set the quantity this cart holds of one item.
 *
 * Deliberately a SET, not an increment: carts are edited by choosing a
 * quantity, and an idempotent set means a retried request over a flaky mobile
 * connection cannot double-hold. Sending 0 releases the item.
 */
const setItem = asyncHandler(async (req, res) => {
  const { menu_item_id, quantity } = req.body;

  if (!req.cartId) {
    return res.status(400).json({
      success: false,
      message: 'No cart session. Call POST /api/cart/session first, or sign in.',
    });
  }
  if (!menu_item_id || quantity === undefined || quantity === null) {
    return res.status(400).json({
      success: false,
      message: 'menu_item_id and quantity are required',
    });
  }

  const qty = parseInt(quantity, 10);
  if (Number.isNaN(qty) || qty < 0) {
    return res.status(400).json({ success: false, message: 'quantity must be 0 or more' });
  }

  const item = await MenuItem.getById(menu_item_id);
  if (!item) {
    return res.status(404).json({ success: false, message: 'Menu item not found' });
  }
  if (!item.is_available && qty > 0) {
    return res.status(400).json({ success: false, message: `"${item.name}" is not available` });
  }

  const result = await stock.hold(req.cartId, item.id, qty, item.stock_quantity);

  if (!result.ok) {
    return res.status(409).json({
      success: false,
      message:
        result.reason === 'insufficient'
          ? `Only ${Math.max(0, result.available)} left of "${item.name}".`
          : `Could not reserve "${item.name}".`,
      data: { id: item.id, available: result.available, held: 0 },
    });
  }

  broadcastAvailability(req.app.get('io'), [
    { itemId: String(item.id), available: result.available },
  ]);

  return res.json({
    success: true,
    data: {
      id: item.id,
      held: result.held,
      available: result.available,
      expires_in_seconds: stock.HOLD_TTL_SECONDS,
    },
  });
});

// ============================================================================
// DELETE /api/cart
// ============================================================================
/** Release every hold this cart owns (cart cleared / session ended). */
const clearCart = asyncHandler(async (req, res) => {
  if (!req.cartId) {
    return res.json({ success: true, data: { released: [] } });
  }

  const freed = await stock.releaseCart(req.cartId);
  broadcastAvailability(req.app.get('io'), freed);

  if (freed.length) {
    logger.info(`Cart ${req.cartId} released ${freed.length} held item(s)`);
  }

  return res.json({
    success: true,
    data: { released: freed.map((f) => ({ id: Number(f.itemId), available: f.available })) },
  });
});

module.exports = {
  createSession,
  getAvailability,
  setItem,
  clearCart,
  broadcastAvailability,
};
