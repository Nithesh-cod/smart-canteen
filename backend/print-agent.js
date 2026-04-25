// ============================================================================
// SMART CANTEEN — LOCAL PRINT AGENT
// ============================================================================
// Run this on the Windows machine where the POS printer is connected.
// It watches Supabase Realtime for newly-paid orders and prints a receipt
// automatically — regardless of whether payment happened on Render cloud
// or on a local backend instance.
//
// Usage:
//   cd backend
//   node print-agent.js
//
// Required .env keys (already present in backend/.env):
//   SUPABASE_URL, SUPABASE_ANON_KEY  — Realtime subscription
//   DATABASE_URL                      — fetch full order + items from Postgres
//   PRINTER_TYPE=windows
//   PRINTER_NAME=POS-58-Series (1)
// ============================================================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool }         = require('pg');
const printerService   = require('./src/services/printer.service');

// ── Config validation ────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const DB_URL       = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env');
  process.exit(1);
}
if (!DB_URL) {
  console.error('❌  Set DATABASE_URL in backend/.env');
  process.exit(1);
}

// ── Direct Postgres pool (same connection the backend uses) ──────────────────
const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function fetchOrder(orderId) {
  const result = await pool.query(
    `SELECT
       o.*,
       COALESCE(s.name,        o.guest_name)  AS student_name,
       COALESCE(s.roll_number, o.guest_roll)  AS student_roll,
       COALESCE(s.phone,       o.guest_phone) AS student_phone,
       COALESCE(
         json_agg(
           json_build_object(
             'id',           oi.id,
             'menu_item_id', oi.menu_item_id,
             'item_name',    oi.item_name,
             'quantity',     oi.quantity,
             'price',        oi.price
           ) ORDER BY oi.id
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) AS items
     FROM orders o
     LEFT JOIN students   s  ON o.student_id = s.id
     LEFT JOIN order_items oi ON o.id        = oi.order_id
     WHERE o.id = $1
     GROUP BY o.id, s.name, s.roll_number, s.phone`,
    [orderId]
  );
  return result.rows[0] || null;
}

// ── Dedup guard: prevent double-print if Realtime fires twice ────────────────
const recentlyQueued = new Set();

async function handlePaidOrder(orderId) {
  if (recentlyQueued.has(orderId)) return;
  recentlyQueued.add(orderId);
  setTimeout(() => recentlyQueued.delete(orderId), 120_000); // forget after 2 min

  try {
    const order = await fetchOrder(orderId);
    if (!order) {
      console.warn(`⚠️  Order ${orderId} not found in DB — skipping`);
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
    recentlyQueued.delete(orderId); // allow retry on next event
    console.error(`❌ Print error for order ${orderId}:`, err.message);
  }
}

// ── Supabase Realtime — watch every UPDATE on the orders table ───────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

supabase
  .channel('print-agent')
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders' },
    (payload) => {
      const row = payload.new;
      // Trigger on the exact moment payment_status flips to 'paid'
      if (row.payment_status === 'paid') {
        handlePaidOrder(row.id);
      }
    }
  )
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('✅ Subscribed to Supabase Realtime — listening for paid orders...\n');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error('❌ Realtime connection error:', err?.message || status);
      console.error('   Will retry automatically...');
    } else {
      console.log(`   Realtime: ${status}`);
    }
  });

// ── Startup banner ───────────────────────────────────────────────────────────
console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║      Smart Canteen  —  Print Agent       ║');
console.log('╚══════════════════════════════════════════╝');
console.log(`  Printer type : ${process.env.PRINTER_TYPE  || 'none (set PRINTER_TYPE=windows)'}`);
console.log(`  Printer name : ${process.env.PRINTER_NAME  || '(default)'}`);
console.log(`  Supabase     : ${SUPABASE_URL}`);
console.log('');
console.log('  Press Ctrl+C to stop.');
console.log('');

// ── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('\n🛑 Print agent stopped.');
  await pool.end();
  process.exit(0);
});
