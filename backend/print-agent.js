// ============================================================================
// SMART CANTEEN — LOCAL PRINT AGENT  (Firestore)
// ============================================================================
// Run this on the Windows machine where the POS printer is connected.
// It watches Cloud Firestore for orders whose payment_status flips to 'paid'
// and prints a receipt automatically — regardless of whether payment happened
// on the cloud backend or a local one.
//
// Usage:
//   cd backend
//   node print-agent.js
//
// Required backend/.env keys:
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json   (Firestore access)
//   FIREBASE_PROJECT_ID=smart-canteen-64c7e
//   PRINTER_TYPE=windows
//   PRINTER_NAME=POS-58-Series (1)
// ============================================================================

require('dotenv').config();
const { db }           = require('./src/config/firebase');
const Order            = require('./src/models/Order');
const printerService   = require('./src/services/printer.service');

// ── Dedup guard: prevent a double-print if the listener fires twice ──────────
const recentlyPrinted = new Set();

async function handlePaidOrder(orderId) {
  if (recentlyPrinted.has(orderId)) return;
  recentlyPrinted.add(orderId);
  setTimeout(() => recentlyPrinted.delete(orderId), 120_000); // forget after 2 min

  try {
    // Order.getById returns the fully-enriched order (items inline + student /
    // guest name) — the exact shape printerService.printBill expects.
    const order = await Order.getById(orderId);
    if (!order) {
      console.warn(`⚠️  Order ${orderId} not found — skipping`);
      return;
    }

    console.log(`🖨️  Printing receipt for order #${order.order_number}...`);
    const result = await printerService.printBill(order);

    if (result.printed) {
      console.log(`✅ Receipt printed  →  order #${order.order_number}`);
    } else {
      console.warn(`⚠️  Print returned false for #${order.order_number}`);
      console.warn('   Check PRINTER_TYPE and PRINTER_NAME in .env');
    }
  } catch (err) {
    recentlyPrinted.delete(orderId); // allow retry on the next event
    console.error(`❌ Print error for order ${orderId}:`, err.message);
  }
}

// ── Firestore listener — watch paid orders ───────────────────────────────────
// We listen only to the 'paid' slice. The FIRST snapshot is the existing
// backlog (every already-paid order) — we skip it, exactly like the old
// Supabase Realtime agent which never replayed history. After that, each
// docChange is a live transition, so a freshly-paid order prints once.
let primed = false;

const unsubscribe = db
  .collection('orders')
  .where('payment_status', '==', 'paid')
  .onSnapshot(
    (snapshot) => {
      if (!primed) {
        primed = true;
        console.log(`✅ Listening for paid orders (skipped ${snapshot.size} existing)...\n`);
        return;
      }
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added' || change.type === 'modified') {
          if (change.doc.data().payment_status === 'paid') {
            handlePaidOrder(change.doc.id);
          }
        }
      }
    },
    (err) => {
      console.error('❌ Firestore listener error:', err.message);
      console.error('   Check the service-account key and network. Will keep the process alive.');
    }
  );

// ── Startup banner ───────────────────────────────────────────────────────────
console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║      Smart Canteen  —  Print Agent       ║');
console.log('╚══════════════════════════════════════════╝');
console.log(`  Printer type : ${process.env.PRINTER_TYPE || 'none (set PRINTER_TYPE=windows)'}`);
console.log(`  Printer name : ${process.env.PRINTER_NAME || '(default)'}`);
console.log(`  Firestore    : ${process.env.FIREBASE_PROJECT_ID || '(from service account)'}`);
console.log('');
console.log('  Press Ctrl+C to stop.');
console.log('');

// ── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n🛑 Print agent stopped.');
  try { unsubscribe(); } catch { /* ignore */ }
  process.exit(0);
});
