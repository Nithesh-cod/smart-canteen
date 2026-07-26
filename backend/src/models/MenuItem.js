// ============================================================================
// MENU ITEM MODEL  (Firestore)
// ============================================================================
// Firestore implementation of menu_items. Public API + return shapes match the
// old Postgres model so controllers don't change.
//
// IDs: the frontend treats menu-item ids as NUMBERS (cart keys, favorites[]),
// so we keep numeric ids — stored as the string doc-id ("1","2",…) and
// returned as `id: Number(doc.id)`. New items get their next id from
// counters/menu_item_id (the seed script sets that counter to the max seeded id).
//
// Collection: menu_items/{numericId}
// ============================================================================

const { FieldValue, runTransaction, collections } = require('../config/firebase');

const menuCol = collections.menuItems;

const tsToIso = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v);

/** Doc → plain menu item with a numeric id. */
const toItem = (doc) => {
  if (!doc || !doc.exists) return null;
  const d = doc.data();
  return {
    id: Number(doc.id),
    ...d,
    created_at: tsToIso(d.created_at),
    updated_at: tsToIso(d.updated_at),
  };
};

const byCategoryThenName = (a, b) =>
  String(a.category || '').localeCompare(String(b.category || '')) ||
  String(a.name || '').localeCompare(String(b.name || ''));

// ============================================================================
// FIND
// ============================================================================

/** All menu items, ordered by category then name. */
const getAll = async () => {
  const snap = await menuCol().get();
  return snap.docs.map(toItem).sort(byCategoryThenName);
};

/** Available items only. */
const getAvailable = async () => {
  const snap = await menuCol().where('is_available', '==', true).get();
  return snap.docs.map(toItem).sort(byCategoryThenName);
};

/** Available items in a category, ordered by name. */
const getByCategory = async (category) => {
  const snap = await menuCol().where('category', '==', category).get();
  return snap.docs
    .map(toItem)
    .filter((m) => m.is_available === true)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
};

/** Single item by (numeric) id. */
const getById = async (id) => toItem(await menuCol().doc(String(id)).get());

/** Search available items by name substring, best-rated first. */
const search = async (searchTerm) => {
  const term = String(searchTerm).toLowerCase();
  const snap = await menuCol().where('is_available', '==', true).get();
  return snap.docs
    .map(toItem)
    .filter((m) => m.name && m.name.toLowerCase().includes(term))
    .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
};

// ============================================================================
// CREATE
// ============================================================================
/**
 * Create a menu item (admin). Assigns the next numeric id from the counter.
 */
const create = async ({
  name, description, category, price, image_url,
  is_vegetarian, preparation_time, stock_quantity,
}) => {
  const counterRef = collections.counters().doc('menu_item_id');

  const newId = await runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists ? Number(snap.data().seq) || 0 : 0) + 1;
    tx.set(counterRef, { seq: next }, { merge: true });
    return next;
  });

  const ref = menuCol().doc(String(newId));
  await ref.set({
    name,
    description:      description || null,
    category,
    price:            Number(price),
    image_url:        image_url || null,
    is_available:     true,
    rating:           4.0,
    is_vegetarian:    is_vegetarian === undefined ? true : is_vegetarian,
    preparation_time: preparation_time || 10,
    stock_quantity:   stock_quantity !== undefined ? stock_quantity : -1,
    created_at:       FieldValue.serverTimestamp(),
    updated_at:       FieldValue.serverTimestamp(),
  });
  return toItem(await ref.get());
};

// ============================================================================
// UPDATE
// ============================================================================
/** Partial update of the allowed fields. */
const update = async (id, data) => {
  const ref = menuCol().doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;

  const allowed = ['name', 'description', 'category', 'price', 'image_url',
    'is_vegetarian', 'preparation_time', 'rating', 'stock_quantity'];
  const upd = {};
  for (const k of allowed) if (data[k] !== undefined) upd[k] = data[k];
  if (Object.keys(upd).length === 0) throw new Error('No fields to update');
  upd.updated_at = FieldValue.serverTimestamp();

  await ref.update(upd);
  return toItem(await ref.get());
};

/** Toggle availability (chef/admin). */
const toggleAvailability = async (id, isAvailable) => {
  const ref = menuCol().doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({ is_available: isAvailable, updated_at: FieldValue.serverTimestamp() });
  return toItem(await ref.get());
};

// ============================================================================
// DELETE
// ============================================================================
const deleteItem = async (id) => {
  const ref = menuCol().doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
};

// ============================================================================
// STOCK  (kept for compatibility; order-create's reserveStock is authoritative)
// ============================================================================
/** Decrement tracked stock (clamped at 0). -1 = unlimited, left untouched. */
const decrementStock = async (id, quantity) => {
  const ref = menuCol().doc(String(id));
  return runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const cur = Number(snap.data().stock_quantity);
    if (cur === -1) return null; // unlimited — not tracked
    const next = Math.max(0, cur - quantity);
    tx.update(ref, { stock_quantity: next, updated_at: FieldValue.serverTimestamp() });
    return { ...toItem(snap), stock_quantity: next };
  });
};

// ============================================================================
// BULK
// ============================================================================
/** Bulk availability toggle. Returns number of items updated. */
const bulkUpdateAvailability = async (ids, isAvailable) => {
  const { db } = require('../config/firebase');
  const batch = db.batch();
  for (const id of ids) {
    batch.update(menuCol().doc(String(id)), {
      is_available: isAvailable,
      updated_at:   FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return ids.length;
};

// ============================================================================
// STATISTICS  (aggregated in memory — Firestore has no JOIN/GROUP BY)
// ============================================================================
/**
 * Top-selling items over the last 30 days, from paid orders. Order items are
 * inline on each order doc, so we scan recent orders and tally per item.
 */
const getTopSelling = async (limit = 10) => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Single-field range on created_at (auto-indexed); filter paid in memory.
  const snap = await collections.orders().where('created_at', '>=', cutoff).get();

  const tally = new Map(); // menu_item_id → { order_count, total_quantity, total_revenue }
  for (const doc of snap.docs) {
    const o = doc.data();
    if (o.payment_status !== 'paid') continue;
    for (const it of o.items || []) {
      const key = Number(it.menu_item_id);
      const cur = tally.get(key) || { order_count: 0, total_quantity: 0, total_revenue: 0 };
      cur.order_count   += 1;
      cur.total_quantity += Number(it.quantity) || 0;
      cur.total_revenue  += (Number(it.price) || 0) * (Number(it.quantity) || 0);
      tally.set(key, cur);
    }
  }

  const top = [...tally.entries()]
    .sort((a, b) => b[1].order_count - a[1].order_count)
    .slice(0, limit);

  // Attach menu-item display fields.
  const results = await Promise.all(
    top.map(async ([menuId, agg]) => {
      const m = await getById(menuId);
      return {
        id: menuId,
        name:     m?.name     ?? `#${menuId}`,
        category: m?.category ?? null,
        price:    m?.price    ?? null,
        image_url: m?.image_url ?? null,
        ...agg,
      };
    })
  );
  return results;
};

/** Per-category stats over available items. */
const getCategoryStats = async () => {
  const snap = await menuCol().where('is_available', '==', true).get();
  const groups = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    const g = groups.get(d.category) || { prices: [] };
    g.prices.push(Number(d.price) || 0);
    groups.set(d.category, g);
  }
  return [...groups.entries()]
    .map(([category, g]) => ({
      category,
      item_count: g.prices.length,
      avg_price:  g.prices.reduce((s, p) => s + p, 0) / g.prices.length,
      min_price:  Math.min(...g.prices),
      max_price:  Math.max(...g.prices),
    }))
    .sort((a, b) => String(a.category).localeCompare(String(b.category)));
};

// ============================================================================
// EXPORTS  (identical surface to the old pg model)
// ============================================================================
module.exports = {
  getAll,
  getAvailable,
  getByCategory,
  getById,
  search,
  create,
  update,
  toggleAvailability,
  deleteItem,
  decrementStock,
  getTopSelling,
  getCategoryStats,
  bulkUpdateAvailability,
};
