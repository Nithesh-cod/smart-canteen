// ============================================================================
// STUDENT MODEL  (Firestore)
// ============================================================================
// Firestore implementation of the students collection. The PUBLIC API and
// return shapes are kept identical to the old Postgres model so controllers
// don't change: every function returns plain objects whose `id` is the
// Firestore document id and whose timestamp fields are ISO strings.
//
// Collection: students/{studentId}
//   name, roll_number, phone, email, department, password_hash, role,
//   points, tier, total_orders, total_spent, is_active, profile_image_url,
//   created_at (Timestamp), last_login (Timestamp)
// Sub-collection: students/{studentId}/favorites/{menuItemId} → { created_at }
// ============================================================================

const { db, FieldValue, runTransaction, collections } = require('../config/firebase');

const col     = collections.students;
const menuCol = collections.menuItems;

// ── helpers ──────────────────────────────────────────────────────────────────

/** Firestore Timestamp → ISO string (pass through anything else). */
const tsToIso = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v);

/** Doc snapshot → plain student object with normalized fields. */
const toStudent = (doc) => {
  if (!doc || !doc.exists) return null;
  const d = doc.data();
  return {
    id: doc.id,
    ...d,
    created_at: tsToIso(d.created_at),
    last_login: tsToIso(d.last_login),
  };
};

/**
 * Strip secret columns before a row leaves the API.
 * password_hash must NEVER reach a client — not even an admin one.
 */
const toSafe = (row) => {
  if (!row) return row;
  const { password_hash, ...safe } = row; // eslint-disable-line no-unused-vars
  return safe;
};

const firstOf = (snap) => (snap.empty ? null : toStudent(snap.docs[0]));

// ============================================================================
// FIND OPERATIONS
// ============================================================================

/** Find by roll number. */
const findByRoll = async (rollNumber) => {
  const snap = await col().where('roll_number', '==', rollNumber).limit(1).get();
  return firstOf(snap);
};

/** Find by phone number. */
const findByPhone = async (phone) => {
  const snap = await col().where('phone', '==', phone).limit(1).get();
  return firstOf(snap);
};

/** Find by document id. */
const findById = async (id) => {
  if (!id) return null;
  return toStudent(await col().doc(String(id)).get());
};

/** Find by roll number OR phone (login identifier). */
const findByIdentifier = async (identifier) => {
  return (await findByRoll(identifier)) || (await findByPhone(identifier));
};

// ============================================================================
// CREATE
// ============================================================================
/**
 * Create a new student/chef/admin. Mirrors the old columns + defaults
 * (points 0, tier Bronze, is_active true). Returns the created row.
 */
const create = async ({ name, roll_number, phone, email, department, password_hash, role }) => {
  const ref = col().doc(); // auto-id
  await ref.set({
    name,
    roll_number,
    phone,
    email:             email || null,
    department:        department || null,
    password_hash:     password_hash || null,
    role:              role || 'student',
    points:            0,
    tier:              'Bronze',
    total_orders:      0,
    total_spent:       0,
    is_active:         true,
    profile_image_url: null,
    created_at:        FieldValue.serverTimestamp(),
    last_login:        FieldValue.serverTimestamp(),
  });
  return toStudent(await ref.get());
};

// ============================================================================
// ADMIN LIST / UPDATE
// ============================================================================
/**
 * List accounts filtered by role (powers the admin account-management screen).
 * Returns sanitized rows. Firestore has no server-side substring search, so
 * this path is role/tier + pagination only (see getAll for the search path).
 */
const listByRole = async ({ role = null, limit = 50, offset = 0 } = {}) => {
  // Single-field equality (auto-indexed); sort + paginate in memory to avoid a
  // composite index. Account lists are small at canteen scale.
  let q = col();
  if (role) q = q.where('role', '==', role);

  const snap = await q.get();
  const all = snap.docs
    .map((d) => toSafe(toStudent(d)))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  return {
    accounts: all.slice(offset, offset + limit),
    total:    all.length,
  };
};

/**
 * Admin-only privileged update: role, password, and/or active state.
 * Returns the sanitized updated row, or null if the account doesn't exist.
 */
const adminUpdate = async (id, data) => {
  const ref = col().doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;

  const update = {};
  if (data.role !== undefined)          update.role = data.role;
  if (data.password_hash !== undefined) update.password_hash = data.password_hash;
  if (data.is_active !== undefined)     update.is_active = data.is_active;
  if (Object.keys(update).length === 0) throw new Error('No fields to update');

  await ref.update(update);
  return toSafe(toStudent(await ref.get()));
};

/**
 * Student self-service profile update (name/email/department/profile_image_url).
 */
const updateProfile = async (id, data) => {
  const ref = col().doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;

  const update = {};
  if (data.name)              update.name = data.name;
  if (data.email)             update.email = data.email;
  if (data.department)        update.department = data.department;
  if (data.profile_image_url) update.profile_image_url = data.profile_image_url;
  if (Object.keys(update).length === 0) throw new Error('No fields to update');

  await ref.update(update);
  return toStudent(await ref.get());
};

/** Bump last_login to now. */
const updateLastLogin = async (id) => {
  await col().doc(String(id)).update({ last_login: FieldValue.serverTimestamp() });
};

// ============================================================================
// POINTS / STATS / TIER  (each atomic on its own)
// ============================================================================
// NOTE: the payment pipeline reconciles points + stats + tier inside ONE
// Firestore transaction in the controller for correctness. These standalone
// helpers stay available for incidental single updates.

/** Add loyalty points. */
const addPoints = async (id, points) => {
  const ref = col().doc(String(id));
  await ref.update({ points: FieldValue.increment(points) });
  return toStudent(await ref.get());
};

/** Deduct points, clamped at 0 (atomic read-modify-write). */
const deductPoints = async (id, points) => {
  const ref = col().doc(String(id));
  return runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const next = Math.max(0, (Number(snap.data().points) || 0) - points);
    tx.update(ref, { points: next });
    return { ...toStudent(snap), points: next };
  });
};

/** Recompute tier from total_spent. */
const updateTier = async (id) => {
  const ref = col().doc(String(id));
  return runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const spent = Number(snap.data().total_spent) || 0;
    const tier =
      spent >= 5000 ? 'Platinum' :
      spent >= 3000 ? 'Gold' :
      spent >= 1000 ? 'Silver' : 'Bronze';
    tx.update(ref, { tier });
    return { ...toStudent(snap), tier };
  });
};

/**
 * Update spend/order stats after a pay (amount > 0) or refund (amount < 0).
 * Both columns clamp at 0. total_orders +1 on pay, -1 on refund (FIX T5).
 */
const updateStats = async (id, amount) => {
  const ref = col().doc(String(id));
  const orderDelta = amount < 0 ? -1 : 1;
  return runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data();
    const total_spent  = Math.max(0, (Number(d.total_spent)  || 0) + amount);
    const total_orders = Math.max(0, (Number(d.total_orders) || 0) + orderDelta);
    tx.update(ref, { total_spent, total_orders });
    return { ...toStudent(snap), total_spent, total_orders };
  });
};

const tierFor = (spent) =>
  spent >= 5000 ? 'Platinum' : spent >= 3000 ? 'Gold' : spent >= 1000 ? 'Silver' : 'Bronze';

/**
 * Apply a completed purchase to a student ATOMICALLY (points + spend + tier).
 * Preserves the old sequential semantics exactly:
 *   points = max(0, points - pointsUsed) + pointsEarned
 *   total_spent += amount (clamped ≥ 0), total_orders += 1, tier recomputed.
 * One Firestore transaction — replaces the old multi-call pg transaction.
 */
const applyPurchase = async (id, { pointsUsed = 0, pointsEarned = 0, amount = 0 } = {}) => {
  const ref = col().doc(String(id));
  return runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data();
    const points       = Math.max(0, (Number(d.points) || 0) - pointsUsed) + pointsEarned;
    const total_spent  = Math.max(0, (Number(d.total_spent)  || 0) + amount);
    const total_orders = Math.max(0, (Number(d.total_orders) || 0) + 1);
    const tier = tierFor(total_spent);
    tx.update(ref, { points, total_spent, total_orders, tier });
    return { ...toStudent(snap), points, total_spent, total_orders, tier };
  });
};

/**
 * Reverse a purchase on refund/cancel ATOMICALLY (mirror of applyPurchase):
 *   points = max(0, points - pointsEarned) + pointsUsed
 *   total_spent -= amount (clamped ≥ 0), total_orders -= 1, tier recomputed.
 */
const applyReversal = async (id, { pointsUsed = 0, pointsEarned = 0, amount = 0 } = {}) => {
  const ref = col().doc(String(id));
  return runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data();
    const points       = Math.max(0, (Number(d.points) || 0) - pointsEarned) + pointsUsed;
    const total_spent  = Math.max(0, (Number(d.total_spent)  || 0) - amount);
    const total_orders = Math.max(0, (Number(d.total_orders) || 0) - 1);
    const tier = tierFor(total_spent);
    tx.update(ref, { points, total_spent, total_orders, tier });
    return { ...toStudent(snap), points, total_spent, total_orders, tier };
  });
};

// ============================================================================
// FAVORITES  (sub-collection students/{id}/favorites/{menuItemId})
// ============================================================================

/** Available favorite menu items, newest-favorited first. */
const getFavorites = async (studentId) => {
  const favSnap = await col().doc(String(studentId))
    .collection('favorites').orderBy('created_at', 'desc').get();
  if (favSnap.empty) return [];

  const items = await Promise.all(
    favSnap.docs.map(async (f) => {
      const m = await menuCol().doc(f.id).get();
      if (!m.exists) return null;
      const data = m.data();
      return { id: m.id, ...data };
    })
  );
  return items.filter((m) => m && m.is_available === true);
};

/** Add a favorite (idempotent). */
const addToFavorites = async (studentId, menuItemId) => {
  const ref = col().doc(String(studentId)).collection('favorites').doc(String(menuItemId));
  await ref.set({ menu_item_id: menuItemId, created_at: FieldValue.serverTimestamp() }, { merge: true });
  const snap = await ref.get();
  return { student_id: studentId, menu_item_id: menuItemId, created_at: tsToIso(snap.data().created_at) };
};

/** Remove a favorite. Returns true if it existed. */
const removeFromFavorites = async (studentId, menuItemId) => {
  const ref = col().doc(String(studentId)).collection('favorites').doc(String(menuItemId));
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
};

/** Is this item favorited by the student? */
const isFavorite = async (studentId, menuItemId) => {
  const snap = await col().doc(String(studentId))
    .collection('favorites').doc(String(menuItemId)).get();
  return snap.exists;
};

// ============================================================================
// ADMIN: PAGINATED STUDENT LIST
// ============================================================================
/**
 * Paginated student list for the admin roster. tier filter + pagination are
 * server-side. `search` has no native Firestore equivalent, so when a search
 * term is present we scan a capped window and filter in memory (fine at
 * canteen scale; documented limitation).
 */
const getAll = async ({ limit = 50, offset = 0, tier = null, search = null } = {}) => {
  // tier and/or search → single-field filter (or none) + in-memory sort/filter,
  // avoiding a composite (tier + created_at) index. Canteen scale is small.
  if (tier || search) {
    let q = col();
    if (tier) q = q.where('tier', '==', tier);
    const scan = await q.limit(3000).get();
    let rows = scan.docs.map(toStudent);
    if (search) {
      const term = String(search).toLowerCase();
      rows = rows.filter((s) =>
        [s.name, s.roll_number, s.phone, s.email]
          .some((f) => f && String(f).toLowerCase().includes(term))
      );
    }
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return { students: rows.slice(offset, offset + limit), total: rows.length };
  }

  // No filters → true server-side pagination on a single-field orderBy (fine).
  const countSnap = await col().count().get();
  const snap = await col().orderBy('created_at', 'desc').offset(offset).limit(limit).get();
  return { students: snap.docs.map(toStudent), total: countSnap.data().count };
};

// ============================================================================
// STATS (single student detail)
// ============================================================================
/**
 * Student + derived counters (order_count, lifetime_spent, favorites_count).
 * Aggregated by reading the student's paid orders (small at canteen scale).
 */
const getStats = async (id) => {
  const doc = await col().doc(String(id)).get();
  if (!doc.exists) return null;
  const student = toStudent(doc);

  // Single-field filter (student_id) then filter paid in memory — avoids a
  // composite (student_id + payment_status) index. A student has few orders.
  const ordersSnap = await collections.orders()
    .where('student_id', '==', String(id))
    .get();
  const paid = ordersSnap.docs.filter((o) => o.data().payment_status === 'paid');

  const order_count    = paid.length;
  const lifetime_spent = paid.reduce((s, o) => s + (Number(o.data().total_amount) || 0), 0);
  const favSnap        = await col().doc(String(id)).collection('favorites').count().get();

  return {
    ...student,
    order_count,
    lifetime_spent,
    favorites_count: favSnap.data().count,
  };
};

// ============================================================================
// EXPORTS  (identical surface to the old pg model)
// ============================================================================
module.exports = {
  findByRoll,
  findByPhone,
  findById,
  findByIdentifier,
  create,
  toSafe,
  listByRole,
  adminUpdate,
  updateProfile,
  updateLastLogin,
  addPoints,
  deductPoints,
  updateTier,
  updateStats,
  applyPurchase,
  applyReversal,
  getFavorites,
  addToFavorites,
  removeFromFavorites,
  isFavorite,
  getAll,
  getStats,
};
