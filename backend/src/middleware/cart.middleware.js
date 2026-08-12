// ============================================================================
// CART IDENTITY
// ============================================================================
// Every stock hold belongs to a cart, so the server has to know which cart is
// calling — and must not simply believe an id supplied in the request body.
//
// A cart id is a capability: whoever presents it can release that cart's holds.
// If clients could name any cart, one script could repeatedly release other
// people's holds (making sold-out items look available) or hold stock under a
// thousand invented cart ids until the menu read as empty. Both are trivial
// denial-of-service against a lunch rush.
//
// So ids are never accepted raw:
//   • Logged-in student → the id is DERIVED from their verified JWT
//     ("s:<studentId>"). It follows them across the kiosk, web and the APK,
//     which is what makes one cart visible on all three.
//   • Guest → the server mints a signed cart token; the client echoes it back
//     in X-Cart-Token. Unforgeable, and scoped to a single anonymous cart.
// ============================================================================

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const CART_TOKEN_TTL = process.env.CART_TOKEN_TTL || '4h';

/** Mint a signed token for a brand-new anonymous cart. */
const issueCartToken = () => {
  const cartId = `g:${crypto.randomUUID()}`;
  const token = jwt.sign({ cart: true, cart_id: cartId }, process.env.JWT_SECRET, {
    expiresIn: CART_TOKEN_TTL,
  });
  return { cartId, token };
};

/**
 * Resolve req.cartId from (in order):
 *   1. a valid student Authorization bearer token → "s:<id>"
 *   2. a valid X-Cart-Token → the cart id inside it
 *
 * Never rejects outright — routes that require a cart check `req.cartId`
 * themselves, so a read-only availability call still works anonymously.
 */
const resolveCart = (req, _res, next) => {
  req.cartId = null;

  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.substring(7), process.env.JWT_SECRET);
      // Guest ORDER tokens are scoped to one paid order and must not be
      // reusable as a cart identity.
      if (decoded && decoded.id && decoded.guest !== true) {
        req.cartId = `s:${decoded.id}`;
        return next();
      }
    } catch {
      /* fall through to the cart token */
    }
  }

  const cartToken = req.headers['x-cart-token'];
  if (cartToken) {
    try {
      const decoded = jwt.verify(cartToken, process.env.JWT_SECRET);
      if (decoded && decoded.cart === true && decoded.cart_id) {
        req.cartId = decoded.cart_id;
      }
    } catch {
      /* expired or forged — treated as no cart */
    }
  }

  return next();
};

module.exports = { issueCartToken, resolveCart, CART_TOKEN_TTL };
