// ============================================================================
// OFFER MODEL  (Firestore)
// ============================================================================
// Promotional offers. Replaces the raw-SQL offers CRUD that lived in the admin
// and menu controllers. Collection: offers/{offerId}
//   title, description, discount_percentage, discount_amount, min_order_amount,
//   valid_from (Timestamp), valid_until (Timestamp), is_active, created_at
// ============================================================================

const { FieldValue, runTransaction, collections } = require('../config/firebase');

const col = collections.offers;

const tsToIso = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v || null);

const toOffer = (doc) => {
  if (!doc || !doc.exists) return null;
  const d = doc.data();
  return {
    id: doc.id,
    ...d,
    valid_from:  tsToIso(d.valid_from),
    valid_until: tsToIso(d.valid_until),
    created_at:  tsToIso(d.created_at),
  };
};

const byNewest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));

/** All offers, newest first. */
const getAll = async () => {
  const snap = await col().get();
  return snap.docs.map(toOffer).sort(byNewest);
};

/** Active offers within their validity window (public kiosk). */
const getActive = async () => {
  const now = new Date();
  const snap = await col().where('is_active', '==', true).get(); // single-field; window filtered in memory
  return snap.docs
    .map(toOffer)
    .filter((o) => {
      const vf = o.valid_from ? new Date(o.valid_from) : null;
      const vu = o.valid_until ? new Date(o.valid_until) : null;
      return (!vf || vf <= now) && (!vu || vu >= now);
    })
    .sort(byNewest);
};

/** Create an offer. */
const create = async (data) => {
  const ref = col().doc();
  await ref.set({
    title:               data.title,
    description:         data.description || '',
    discount_percentage: data.discount_percentage ?? null,
    discount_amount:     data.discount_amount ?? null,
    min_order_amount:    data.min_order_amount ?? null,
    valid_from:          new Date(data.valid_from),
    valid_until:         new Date(data.valid_until),
    is_active:           data.is_active !== undefined ? data.is_active : true,
    created_at:          FieldValue.serverTimestamp(),
  });
  return toOffer(await ref.get());
};

/** Partial update. Returns null if the offer doesn't exist. */
const update = async (id, data) => {
  const ref = col().doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;

  const upd = {};
  for (const k of ['title', 'description', 'discount_percentage', 'discount_amount',
    'min_order_amount', 'is_active']) {
    if (data[k] !== undefined) upd[k] = data[k];
  }
  if (data.valid_from  !== undefined) upd.valid_from  = new Date(data.valid_from);
  if (data.valid_until !== undefined) upd.valid_until = new Date(data.valid_until);
  if (Object.keys(upd).length === 0) return toOffer(snap);

  await ref.update(upd);
  return toOffer(await ref.get());
};

/** Delete. Returns true if it existed. */
const remove = async (id) => {
  const ref = col().doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
};

/** Flip is_active. Returns the updated offer, or null if not found. */
const toggle = async (id) => {
  const ref = col().doc(String(id));
  const ok = await runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    tx.update(ref, { is_active: !snap.data().is_active });
    return true;
  });
  return ok ? toOffer(await ref.get()) : null;
};

module.exports = { getAll, getActive, create, update, remove, toggle };
