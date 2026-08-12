// ============================================================================
// ORDER NUMBER ALLOCATION
// ============================================================================
// Hands out the human-facing receipt numbers (OZ000001, OZ000002, …).
//
// ── THE PROBLEM THIS REPLACES ───────────────────────────────────────────────
// Order.create used to read-modify-write a SINGLE Firestore document
// (counters/order_number) inside the order transaction, once per order.
// Firestore sustains roughly one write per second to any one document, so that
// counter was a hard ceiling on the entire system: no amount of extra server
// instances could push past ~1 order/second, and every order above that rate
// piled into transaction contention and retries. It also dragged the counter
// doc into the order transaction, so unrelated orders contended with each
// other even when they shared no menu items.
//
// ── BLOCK ALLOCATION ────────────────────────────────────────────────────────
// Instead of one write per order, an instance claims a BLOCK of numbers in a
// single transaction and then serves them from memory. With the default block
// of 1000 that is one Firestore write per thousand orders — a ~1000x increase
// in headroom — and the order transaction no longer touches the counter at all.
//
// ── ON GAPS ─────────────────────────────────────────────────────────────────
// A restart abandons whatever is left of the current block, so the sequence
// skips (…OZ000412, then OZ001001). That is deliberate and safe: these are
// receipt numbers for identifying an order at the counter, not a gapless
// accounting series. The guarantee that matters is UNIQUENESS — two orders
// must never share a number — and block allocation gives that absolutely,
// including across many concurrent instances, because each block is claimed by
// exactly one transaction.
// ============================================================================

const { runTransaction, collections } = require('../config/firebase');
const logger = require('../utils/logger');

const BLOCK_SIZE = parseInt(process.env.ORDER_NUMBER_BLOCK_SIZE, 10) || 1000;
const PREFIX = process.env.ORDER_NUMBER_PREFIX || 'OZ';
const PAD = 6;

// The block this process currently owns. `next` is the number to hand out.
let next = 0;
let blockEnd = -1;      // inclusive; next > blockEnd means the block is spent
let claiming = null;    // in-flight claim, shared by concurrent callers

/**
 * Claim the next block from Firestore.
 *
 * Concurrent callers share one in-flight promise. Without that, twenty
 * simultaneous checkouts arriving on a spent block would each fire their own
 * transaction and burn twenty blocks — correct, but it would chew through the
 * sequence and reintroduce the contention this service exists to avoid.
 */
const claimBlock = async () => {
  if (claiming) return claiming;

  claiming = (async () => {
    const ref = collections.counters().doc('order_number');
    const start = await runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const seq = snap.exists ? Number(snap.data().seq) || 0 : 0;
      tx.set(ref, { seq: seq + BLOCK_SIZE }, { merge: true });
      return seq + 1; // first number in the claimed block
    });

    next = start;
    blockEnd = start + BLOCK_SIZE - 1;
    logger.info(`[orderNumber] claimed block ${start}–${blockEnd}`);
    return start;
  })();

  try {
    return await claiming;
  } finally {
    claiming = null;
  }
};

/**
 * Next unique order number. Serves from the in-memory block, claiming a new
 * one only when the current block is exhausted.
 * @returns {Promise<string>} e.g. "OZ000042"
 */
const nextOrderNumber = async () => {
  if (next > blockEnd) await claimBlock();
  const seq = next++;
  return `${PREFIX}${String(seq).padStart(PAD, '0')}`;
};

/** Test/shutdown helper — forces the next call to claim a fresh block. */
const _reset = () => { next = 0; blockEnd = -1; claiming = null; };

module.exports = { nextOrderNumber, BLOCK_SIZE, _reset };
