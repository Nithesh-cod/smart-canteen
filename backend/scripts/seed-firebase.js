// ============================================================================
// SEED FIRESTORE  —  starter menu + test accounts
// ============================================================================
// Populates the Firestore database with the canteen menu and a set of test
// accounts (admin / chef / students). Safe to re-run: menu items are written to
// fixed numeric ids (upsert) and accounts are matched by roll number.
//
//   node scripts/seed-firebase.js
// ============================================================================

require('dotenv').config();
const bcrypt = require('bcrypt');
const { db, FieldValue } = require('../src/config/firebase');

const BCRYPT_COST = 12;
const PASSWORD    = 'test1234'; // shared password for every seeded account

// ── Menu (from the original schema.sql seed; a few given limited stock so the
//    stock / oversell behaviour is testable). stock_quantity -1 = unlimited. ──
const MENU = [
  ['Paneer Tikka',      'Grilled cottage cheese with spices',      'starters',  120, 4.5, true,  15, -1],
  ['Chicken Biryani',   'Aromatic basmati rice with chicken',      'mains',     180, 4.8, false, 25, -1],
  ['Veg Fried Rice',    'Chinese style fried rice with veggies',   'mains',     140, 4.3, true,  20, -1],
  ['Gulab Jamun',       'Sweet milk dumplings in sugar syrup',     'desserts',   60, 4.7, true,   5,  6],
  ['Cold Coffee',       'Chilled blended coffee drink',            'beverages',  80, 4.6, true,   5, 15],
  ['Spring Rolls',      'Crispy golden vegetable rolls',           'starters',  100, 4.4, true,  10, -1],
  ['Masala Dosa',       'Crispy South Indian crepe with filling',  'mains',      90, 4.6, true,  15, 10],
  ['Samosa',            'Crispy pastry stuffed with spiced potato','starters',   40, 4.5, true,   5,  5],
  ['Masala Chai',       'Classic spiced Indian tea',               'beverages',  20, 4.8, true,   5, -1],
  ['Chocolate Brownie', 'Rich fudgy chocolate brownie',            'desserts',   70, 4.7, true,  10, -1],
  ['Veg Burger',        'Crispy veggie patty with fresh toppings', 'mains',     110, 4.2, true,  15, -1],
  ['Fresh Lime Soda',   'Chilled lime with soda and mint',         'beverages',  40, 4.5, true,   5, -1],
];

const IMG = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'; // generic food image

const ACCOUNTS = [
  { name: 'Canteen Owner', roll: 'OWNER001', phone: '9000000010', role: 'admin',   department: 'Management' },
  { name: 'Head Chef',     roll: 'CHEF001',  phone: '9000000020', role: 'chef',    department: 'Kitchen' },
  { name: 'Arjun Kumar',   roll: 'STU001',   phone: '9000000001', role: 'student', department: 'Computer Science' },
  { name: 'Priya Sharma',  roll: 'STU002',   phone: '9000000002', role: 'student', department: 'Mechanical' },
];

async function seedMenu() {
  let id = 0;
  for (const [name, description, category, price, rating, is_vegetarian, preparation_time, stock_quantity] of MENU) {
    id++;
    await db.collection('menu_items').doc(String(id)).set({
      name, description, category,
      price, image_url: IMG, rating, is_vegetarian, preparation_time, stock_quantity,
      is_available: true,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  }
  // keep the id counter in sync so admin-created items don't collide with seeds
  await db.collection('counters').doc('menu_item_id').set({ seq: id });
  await db.collection('counters').doc('order_number').set({ seq: 0 }, { merge: true });
  return id;
}

async function upsertAccount(acc) {
  const hash = await bcrypt.hash(PASSWORD, BCRYPT_COST);
  const existing = await db.collection('students').where('roll_number', '==', acc.roll).limit(1).get();
  if (!existing.empty) {
    await existing.docs[0].ref.update({ password_hash: hash, role: acc.role, is_active: true });
    return 'updated';
  }
  const ref = db.collection('students').doc();
  await ref.set({
    name: acc.name, roll_number: acc.roll, phone: acc.phone,
    email: null, department: acc.department || null,
    password_hash: hash, role: acc.role,
    points: 0, tier: 'Bronze', total_orders: 0, total_spent: 0,
    is_active: true, profile_image_url: null,
    created_at: FieldValue.serverTimestamp(),
    last_login: FieldValue.serverTimestamp(),
  });
  return 'created';
}

async function main() {
  console.log('Seeding Firestore…\n');

  const menuCount = await seedMenu();
  console.log(`✅ Menu: ${menuCount} items written (ids 1–${menuCount})`);

  for (const acc of ACCOUNTS) {
    const r = await upsertAccount(acc);
    console.log(`✅ Account ${r}: ${acc.role.padEnd(7)} ${acc.roll}`);
  }

  console.log('\n────────────────────────────────────────────────');
  console.log('  LOGIN CREDENTIALS  (password for all: ' + PASSWORD + ')');
  console.log('────────────────────────────────────────────────');
  console.log('  Owner  →  roll: OWNER001   → Owner Dashboard (/owner)');
  console.log('  Chef   →  roll: CHEF001    → Chef Display   (/chef)');
  console.log('  Student→  roll: STU001     → Kiosk / tracking');
  console.log('  Student→  roll: STU002');
  console.log('────────────────────────────────────────────────');
  console.log('  Log in with the ROLL NUMBER (or the phone) + password.');
  console.log('  Limited-stock items for testing: Samosa(5), Gulab Jamun(6),');
  console.log('  Masala Dosa(10), Cold Coffee(15). Rest are unlimited.');
  console.log('────────────────────────────────────────────────\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
