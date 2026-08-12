// ============================================================================
// ORDER MODEL  (Firestore)
// ============================================================================
// Firestore implementation of orders. Public API + return shapes match the old
// Postgres model so the controllers don't change.
//
// Order items are stored INLINE on the order doc (orders/{id}.items[]) — no
// separate order_items collection, so no joins. Orders are enriched with
// student_name / student_roll / student_phone on read (from the student doc, or
// the guest_* fields for guest checkouts), exactly like the old SQL COALESCE.
//
// The order-create path reserves stock ATOMICALLY inside one Firestore
// transaction (read menu docs → verify stock → write decrements + order +
// order-number counter), which fixes the overselling race.
// ============================================================================

const { FieldValue, runTransaction, collections } = require('../config/firebase');
const { nextOrderNumber } = require('../services/orderNumber.service');

const ordersCol   = collections.orders;
const menuCol      = collections.menuItems;
const studentsCol  = collections.students;

const tsToIso   = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v || null);
const tsMillis  = (doc) => { const c = doc.data().created_at; return c && c.toMillis ? c.toMillis() : 0; };

// ── enrichment ───────────────────────────────────────────────────────────────

const shapeOrder = (doc, studentData) => {
  const d = doc.data();
  const o = {
    id: doc.id,
    ...d,
    created_at:     tsToIso(d.created_at),
    updated_at:     tsToIso(d.updated_at),
    completed_at:   tsToIso(d.completed_at),
    bill_issued_at: tsToIso(d.bill_issued_at),
    items: d.items || [],
  };
  if (studentData) {
    o.student_name   = studentData.name;
    o.student_roll   = studentData.roll_number;
    o.student_phone  = studentData.phone;
    o.student_points = studentData.points;
    o.student_dept   = studentData.department;
  } else {
    o.student_name  = d.guest_name  || null;
    o.student_roll  = d.guest_roll  || null;
    o.student_phone = d.guest_phone || null;
  }
  return o;
};

const enrichOne = async (doc) => {
  if (!doc || !doc.exists) return null;
  const sid = doc.data().student_id;
  let sData = null;
  if (sid) {
    const s = await studentsCol().doc(String(sid)).get();
    if (s.exists) sData = s.data();
  }
  return shapeOrder(doc, sData);
};

/** Batch-enrich a list of order docs (one read per unique student). */
const enrichMany = async (docs) => {
  const ids = [...new Set(docs.map((d) => d.data().student_id).filter(Boolean).map(String))];
  const map = new Map();
  await Promise.all(ids.map(async (id) => {
    const s = await studentsCol().doc(id).get();
    if (s.exists) map.set(id, s.data());
  }));
  return docs.map((doc) => shapeOrder(doc, doc.data().student_id ? map.get(String(doc.data().student_id)) : null));
};

// ============================================================================
// CREATE  (atomic stock reserve + order-number counter)
// ============================================================================
/**
 * Create an order with inline items, reserving stock atomically.
 * @param {Object} orderData
 * @param {Array}  items - [{ menu_item_id, item_name, quantity, price }]
 * @returns {Promise<Object>} complete order; `._stockChanges` carries the
 *          post-commit menu deltas for the controller's socket/realtime fanout.
 * @throws {Error} err.status 400 (out of stock) / 404 (item vanished)
 */
const create = async (orderData, items) => {
  // Fold duplicate lines so the stock check sees the TOTAL per item.
  const wanted = new Map();
  for (const it of items) {
    const id = String(it.menu_item_id);
    wanted.set(id, (wanted.get(id) || 0) + Number(it.quantity));
  }
  const ids = [...wanted.keys()].sort();

  // Allocate the receipt number OUTSIDE the transaction (see
  // services/orderNumber.service.js). It used to be read-modify-written on a
  // single Firestore counter document inside this transaction, which capped
  // the whole system at roughly one order per second and made every order
  // contend with every other one regardless of which items they shared.
  //
  // Computing it out here also means a transaction retry reuses the SAME
  // number rather than burning a fresh one on each attempt.
  const orderNumber = await nextOrderNumber();

  const result = await runTransaction(async (tx) => {
    // ── READS FIRST (Firestore requires all reads before any write) ──────────
    const snaps = new Map();
    for (const id of ids) snaps.set(id, await tx.get(menuCol().doc(id)));

    // ── VALIDATE + compute stock decrements ──────────────────────────────────
    const stockWrites  = [];
    const stockChanges = [];
    for (const id of ids) {
      const qty  = wanted.get(id);
      const snap = snaps.get(id);
      if (!snap.exists) { const e = new Error(`Menu item ${id} no longer exists`); e.status = 404; throw e; }
      const data = snap.data();
      const cur  = Number(data.stock_quantity);
      if (cur === -1) continue; // unlimited — untracked
      if (cur < qty) {
        const e = new Error(`"${data.name}" is out of stock — only ${Math.max(0, cur)} left, you requested ${qty}`);
        e.status = 400; throw e;
      }
      const next = cur - qty;
      const is_available = next <= 0 ? false : data.is_available;
      stockWrites.push({ ref: menuCol().doc(id), next, is_available });
      stockChanges.push({ id: Number(id), name: data.name, stock_quantity: next, is_available });
    }

    // ── WRITES ────────────────────────────────────────────────────────────────
    for (const w of stockWrites) {
      tx.update(w.ref, { stock_quantity: w.next, is_available: w.is_available, updated_at: FieldValue.serverTimestamp() });
    }

    const orderRef = ordersCol().doc(); // auto-id
    tx.set(orderRef, {
      student_id:       orderData.student_id || null,
      order_number:     orderNumber,
      total_amount:     Number(orderData.total_amount),
      original_amount:  Number(orderData.original_amount ?? orderData.total_amount),
      points_used:      orderData.points_used   || 0,
      points_earned:    orderData.points_earned || 0,
      status:           'pending',
      payment_status:   orderData.payment_status || 'pending',
      payment_method:   orderData.payment_method || null,
      razorpay_order_id:   null,
      razorpay_payment_id: null,
      razorpay_signature:  null,
      guest_name:  orderData.guest_name  || null,
      guest_phone: orderData.guest_phone || null,
      guest_roll:  orderData.guest_roll  || null,
      bill_issued_at: null,
      completed_at:   null,
      items: items.map((it) => ({
        menu_item_id: Number(it.menu_item_id),
        item_name:    it.item_name,
        quantity:     Number(it.quantity),
        price:        Number(it.price),
      })),
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    return { orderId: orderRef.id, stockChanges };
  });

  const complete = await getById(result.orderId);
  complete._stockChanges = result.stockChanges;
  return complete;
};

// ============================================================================
// FIND
// ============================================================================

const getById = async (id) => {
  if (!id) return null;
  return enrichOne(await ordersCol().doc(String(id)).get());
};

/** Look an order up by its Razorpay order id (webhook path). */
const findByRazorpayOrderId = async (razorpayOrderId) => {
  if (!razorpayOrderId) return null;
  const snap = await ordersCol().where('razorpay_order_id', '==', razorpayOrderId).limit(1).get();
  return snap.empty ? null : enrichOne(snap.docs[0]);
};

/** Look an order up by its human order number. */
const getByOrderNumber = async (orderNumber) => {
  const snap = await ordersCol().where('order_number', '==', orderNumber).limit(1).get();
  return snap.empty ? null : enrichOne(snap.docs[0]);
};

/** A student's orders, newest first. */
const getByStudent = async (studentId, limit = 50) => {
  // Single-field equality; sort/limit in memory (a student has few orders) to
  // avoid a composite (student_id + created_at) index.
  const snap = await ordersCol().where('student_id', '==', String(studentId)).get();
  const docs = snap.docs.sort((a, b) => tsMillis(b) - tsMillis(a)).slice(0, limit);
  return enrichMany(docs);
};

/**
 * All orders with optional filters. One single-field filter is pushed to
 * Firestore to bound reads; remaining filters + sort + pagination happen in
 * memory (avoids composite indexes; fine at canteen scale).
 */
const getAll = async (filters = {}) => {
  const { status, payment_status, from_date, to_date } = filters;
  const limit  = filters.limit  || 100;
  const offset = filters.offset || 0;

  let q = ordersCol();
  let serverSorted = false;

  if (status)              q = q.where('status', '==', status);
  else if (payment_status) q = q.where('payment_status', '==', payment_status);
  else if (from_date)      q = q.where('created_at', '>=', new Date(from_date));

  // Read window. The old unconditional `.limit(3000)` meant EVERY call to this
  // function — and the chef panel calls it on each realtime change plus a 30s
  // poll — read up to three thousand documents to return a page of fifty.
  // Firestore bills per document read, so at any real concurrency that is both
  // the dominant latency cost and the dominant bill.
  //
  // With no filter we can let Firestore do the ordering and paging itself:
  // created_at is a single field, so this needs no composite index.
  if (!status && !payment_status && !from_date) {
    q = q.orderBy('created_at', 'desc').limit(offset + limit);
    serverSorted = true;
  } else {
    // A filter plus orderBy('created_at') would require a composite index per
    // filter field, which has to be deployed before it works. Until those
    // indexes exist we still scan and sort in memory, but over a window scaled
    // to the request rather than a flat 3000.
    q = q.limit(Math.min(3000, Math.max(500, (offset + limit) * 4)));
  }

  const snap = await q.get();

  let docs = snap.docs.filter((d) => {
    const o = d.data();
    if (status && o.status !== status) return false;
    if (payment_status && o.payment_status !== payment_status) return false;
    const created = o.created_at && o.created_at.toDate ? o.created_at.toDate() : null;
    if (from_date && created && created < new Date(from_date)) return false;
    if (to_date   && created && created > new Date(to_date))   return false;
    return true;
  });

  // Kitchen queues want oldest-first; everything else newest-first.
  // Skip re-sorting when Firestore already returned them newest-first.
  const asc = status === 'pending' || status === 'preparing';
  if (asc || !serverSorted) {
    docs.sort((a, b) => (asc ? tsMillis(a) - tsMillis(b) : tsMillis(b) - tsMillis(a)));
  }

  const total  = docs.length;
  const orders = await enrichMany(docs.slice(offset, offset + limit));
  return { orders, total };
};

/**
 * Sum of points_used across a student's in-flight (pending) orders that are
 * still unpaid or mid-refund. Used to stop double-redeeming the same points
 * across concurrent orders.
 */
const reservedPoints = async (studentId) => {
  const snap = await ordersCol().where('student_id', '==', String(studentId)).get();
  let sum = 0;
  for (const d of snap.docs) {
    const o = d.data();
    if (o.status === 'pending' && (o.payment_status === 'pending' || o.payment_status === 'refunding')) {
      sum += Number(o.points_used) || 0;
    }
  }
  return sum;
};

/**
 * Atomically move an order's payment_status from `fromStatus` to `toStatus`,
 * only if it's currently `fromStatus`. Returns true iff this call made the
 * change — the race-free replacement for `UPDATE … WHERE payment_status = $x`.
 * Used by the cancel/refund flows to claim the transient 'refunding' state.
 */
const compareAndSetPaymentStatus = async (id, fromStatus, toStatus) => {
  const ref = ordersCol().doc(String(id));
  return runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().payment_status !== fromStatus) return false;
    tx.update(ref, { payment_status: toStatus, updated_at: FieldValue.serverTimestamp() });
    return true;
  });
};

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update status. When `fromStatus` is given, the write only happens if the
 * order is still in that status (guards a webhook-vs-chef race). Returns the
 * updated order, or null when the guard didn't match / order missing.
 */
const updateStatus = async (id, status, fromStatus = null) => {
  const ref = ordersCol().doc(String(id));
  const ok = await runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    if (fromStatus && snap.data().status !== fromStatus) return false;
    const upd = { status, updated_at: FieldValue.serverTimestamp() };
    if (status === 'completed') upd.completed_at = FieldValue.serverTimestamp();
    tx.update(ref, upd);
    return true;
  });
  return ok ? getById(id) : null;
};

/**
 * Update payment fields. razorpay_* are only overwritten when a non-null value
 * is supplied (preserves the old COALESCE behaviour so a partial update from
 * the webhook / createPaymentOrder path doesn't wipe values verify already set).
 */
const updatePayment = async (id, paymentData) => {
  const ref = ordersCol().doc(String(id));
  const upd = {
    payment_status: paymentData.payment_status || 'paid',
    payment_method: paymentData.payment_method || 'Razorpay',
    updated_at:     FieldValue.serverTimestamp(),
  };
  if (paymentData.razorpay_order_id   != null) upd.razorpay_order_id   = paymentData.razorpay_order_id;
  if (paymentData.razorpay_payment_id != null) upd.razorpay_payment_id = paymentData.razorpay_payment_id;
  if (paymentData.razorpay_signature  != null) upd.razorpay_signature  = paymentData.razorpay_signature;

  await ref.update(upd);
  return getById(id);
};

/** Cancel an order (payment_status untouched — refund path owns that). */
const cancel = async (id) => {
  await ordersCol().doc(String(id)).update({ status: 'cancelled', updated_at: FieldValue.serverTimestamp() });
  return getById(id);
};

/**
 * Restore stock for every line item on an order. Untracked items (-1) skipped;
 * a previously-zero item that goes back above zero flips is_available on again.
 * @returns {Promise<Array<{id, stock_quantity, is_available, name}>>}
 */
const restoreStock = async (orderId) => {
  const orderSnap = await ordersCol().doc(String(orderId)).get();
  if (!orderSnap.exists) return [];

  const wanted = new Map();
  for (const it of orderSnap.data().items || []) {
    const id = String(it.menu_item_id);
    wanted.set(id, (wanted.get(id) || 0) + Number(it.quantity));
  }

  const restored = [];
  for (const [id, qty] of wanted) {
    const r = await runTransaction(async (tx) => {
      const ref  = menuCol().doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const data = snap.data();
      const cur  = Number(data.stock_quantity);
      if (cur === -1) return null; // untracked
      const next = cur + qty;
      const is_available = next > 0 && data.is_available === false ? true : data.is_available;
      tx.update(ref, { stock_quantity: next, is_available, updated_at: FieldValue.serverTimestamp() });
      return { id: Number(id), stock_quantity: next, is_available, name: data.name };
    });
    if (r) restored.push(r);
  }
  return restored;
};

// ============================================================================
// STATISTICS  (aggregated in memory over a bounded window)
// ============================================================================

const startOfToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const startOfWeek  = () => { const n = new Date(); const dow = n.getDay(); const back = dow === 0 ? 6 : dow - 1; return new Date(n.getFullYear(), n.getMonth(), n.getDate() - back); };
const startOfMonth = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); };

/** Dashboard stats: completed-order revenue for today/week/month + today's status breakdown. */
const getStats = async () => {
  // One read window (this month) covers today ⊆ week ⊆ month.
  const monthStart = startOfMonth();
  const weekStart  = startOfWeek();
  const todayStart = startOfToday();
  const snap = await ordersCol().where('created_at', '>=', monthStart).get();

  const rows = snap.docs.map((d) => ({
    created: d.data().created_at && d.data().created_at.toDate ? d.data().created_at.toDate() : null,
    status:  d.data().status,
    amount:  Number(d.data().total_amount) || 0,
  }));

  const agg = (fromDate) => {
    const sub = rows.filter((r) => r.status === 'completed' && r.created && r.created >= fromDate);
    return { order_count: sub.length, revenue: sub.reduce((s, r) => s + r.amount, 0) };
  };

  const breakdown = new Map();
  for (const r of rows) if (r.created && r.created >= todayStart) breakdown.set(r.status, (breakdown.get(r.status) || 0) + 1);

  return {
    today: agg(todayStart),
    week:  agg(weekStart),
    month: agg(monthStart),
    status_breakdown: [...breakdown.entries()].map(([status, count]) => ({ status, count })),
  };
};

/** Daily completed-order revenue for the last N days. */
const getRevenueData = async (days = 30) => {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const snap = await ordersCol().where('created_at', '>=', cutoff).get();

  const byDate = new Map();
  for (const d of snap.docs) {
    const o = d.data();
    if (o.status !== 'completed') continue;
    const dt = o.created_at && o.created_at.toDate ? o.created_at.toDate() : null;
    if (!dt) continue;
    const key = dt.toISOString().slice(0, 10);
    const cur = byDate.get(key) || { order_count: 0, revenue: 0 };
    cur.order_count += 1;
    cur.revenue     += Number(o.total_amount) || 0;
    byDate.set(key, cur);
  }

  return [...byDate.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

// ============================================================================
// HELPERS
// ============================================================================

/** Legacy order-number generator (create() now uses the counter). Kept for API compat. */
const generateOrderNumber = async () => `OZ${Date.now()}${Math.floor(Math.random() * 1000)}`;

/**
 * Stamp bill_issued_at the FIRST time a receipt is produced (idempotent).
 * @returns {Promise<boolean>} true when this call set the timestamp.
 */
const markBillIssued = async (id) => {
  const ref = ordersCol().doc(String(id));
  return runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().bill_issued_at) return false;
    tx.update(ref, { bill_issued_at: FieldValue.serverTimestamp() });
    return true;
  });
};

// ============================================================================
// EXPORTS  (identical surface to the old pg model)
// ============================================================================
module.exports = {
  create,
  getById,
  findByRazorpayOrderId,
  getByOrderNumber,
  getByStudent,
  getAll,
  reservedPoints,
  compareAndSetPaymentStatus,
  updateStatus,
  updatePayment,
  cancel,
  restoreStock,
  getStats,
  getRevenueData,
  generateOrderNumber,
  markBillIssued,
};
