// Shared test helpers: seed the emulator with a known menu + accounts, and log
// in through the real API to get JWTs.
const request = require('supertest');
const bcrypt  = require('bcrypt');
const { db, FieldValue } = require('../src/config/firebase');

const COLLECTIONS = ['orders', 'students', 'menu_items', 'offers', 'counters'];

async function clearAll() {
  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

const menuDoc = (over) => ({
  name: 'Item', description: '', category: 'mains', price: 20,
  image_url: null, is_available: true, rating: 4.5, preparation_time: 5,
  is_vegetarian: true, stock_quantity: -1,
  created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
  ...over,
});

/**
 * Reset the emulator to a known state:
 *   menu 1 = Chai   (unlimited)
 *   menu 2 = Samosa (stock 1  → for the race test)
 *   menu 3 = Dosa   (stock 5)
 *   accounts: OWNER001 (admin), CHEF001 (chef), STU001 (student) — all "test1234"
 */
async function seed() {
  await clearAll();

  await db.collection('menu_items').doc('1').set(menuDoc({ name: 'Chai',   category: 'beverages', price: 20, stock_quantity: -1 }));
  await db.collection('menu_items').doc('2').set(menuDoc({ name: 'Samosa', category: 'starters',  price: 15, stock_quantity: 1 }));
  await db.collection('menu_items').doc('3').set(menuDoc({ name: 'Dosa',   category: 'mains',     price: 50, stock_quantity: 5 }));
  await db.collection('counters').doc('menu_item_id').set({ seq: 3 });
  await db.collection('counters').doc('order_number').set({ seq: 0 });

  const password_hash = await bcrypt.hash('test1234', 12);
  const mk = async (o) => {
    const ref = db.collection('students').doc();
    await ref.set({
      email: null, department: null, password_hash,
      points: 0, tier: 'Bronze', total_orders: 0, total_spent: 0,
      is_active: true, profile_image_url: null,
      created_at: FieldValue.serverTimestamp(), last_login: FieldValue.serverTimestamp(),
      ...o,
    });
    return ref.id;
  };

  const adminId   = await mk({ name: 'Owner', roll_number: 'OWNER001', phone: '9000000010', role: 'admin' });
  const chefId    = await mk({ name: 'Chef',  roll_number: 'CHEF001',  phone: '9000000020', role: 'chef' });
  const studentId = await mk({ name: 'Stud',  roll_number: 'STU001',   phone: '9000000001', role: 'student' });
  return { adminId, chefId, studentId };
}

/** Log in via the real API and return the JWT. */
async function login(app, identifier, password = 'test1234') {
  const res = await request(app).post('/api/auth/login').send({ identifier, password });
  return res.body?.data?.token;
}

module.exports = { seed, login, clearAll, db };
