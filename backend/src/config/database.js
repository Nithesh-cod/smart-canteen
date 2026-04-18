// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================
// Supports Supabase (via DATABASE_URL) or individual env vars (local Postgres)
// ============================================================================

const { Pool } = require('pg');
require('dotenv').config();

// ─── Build pool config ────────────────────────────────────────────────────────
// If DATABASE_URL is set (Supabase / any hosted Postgres), use it directly.
// Otherwise fall back to individual DB_* environment variables.

let poolConfig;

if (process.env.DATABASE_URL) {
  const url = process.env.DATABASE_URL;

  // Guard: catch the common mistake of pasting the Supabase REST/dashboard URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    console.error(
      '\n❌  DATABASE_URL looks like an HTTP URL, not a PostgreSQL connection string.\n' +
      '    It must start with  postgresql://  or  postgres://\n\n' +
      '    How to get the correct URL:\n' +
      '    1. Open your Supabase project dashboard\n' +
      '    2. Go to  Settings → Database\n' +
      '    3. Under "Connection string", choose  URI  (Transaction pooler, port 6543)\n' +
      '    4. Copy the string — it looks like:\n' +
      '       postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres\n' +
      '    5. Paste it as DATABASE_URL in backend/.env\n'
    );
    process.exit(1);
  }

  // ── Parse the URL manually for Supabase ─────────────────────────────────
  // pg has a bug where it strips the ".PROJECT_REF" suffix from the username
  // when parsing a connectionString, sending just "postgres" instead of
  // "postgres.PROJECT_REF".  Passing individual fields bypasses the bug.
  const isSupabase = url.includes('supabase.com') || url.includes('supabase.co');

  if (isSupabase) {
    try {
      const parsed   = new URL(url);
      const user     = decodeURIComponent(parsed.username);
      const password = decodeURIComponent(parsed.password);
      const host     = parsed.hostname;
      const port     = parseInt(parsed.port) || 5432;
      const database = parsed.pathname.replace(/^\//, '') || 'postgres';

      poolConfig = {
        user,
        password,
        host,
        port,
        database,
        ssl:  { rejectUnauthorized: false },
        max:  10,
        min:  2,                          // keep 2 connections warm
        idleTimeoutMillis:     60000,
        connectionTimeoutMillis: 15000,   // Supabase pooler can be slow on cold start
        allowExitOnIdle: false,
      };

      console.log(`[DB] Supabase config → host=${host}:${port} db=${database} user=${user}`);
    } catch (parseErr) {
      console.error('❌  Failed to parse DATABASE_URL:', parseErr.message);
      process.exit(1);
    }
  } else {
    // Non-Supabase hosted Postgres — pass connectionString as-is
    poolConfig = {
      connectionString: url,
      ssl:  false,
      max:  10,
      idleTimeoutMillis:     30000,
      connectionTimeoutMillis: 8000,
    };
  }
} else {
  poolConfig = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'canteen_db',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

const pool = new Pool(poolConfig);

// ─── Event handlers ───────────────────────────────────────────────────────────

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('✅ Database pool connection established');
  }
});

// Test the connection at startup — run a real query to confirm auth works
(async () => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    console.log(`✅ Database reachable — server time: ${result.rows[0].now}`);
  } catch (err) {
    console.error(
      '\n❌  Database startup check failed.\n' +
      '    Error: ' + err.message + '\n\n' +
      '    Most likely causes:\n' +
      '    1. Wrong password in DATABASE_URL (backend/.env)\n' +
      '    2. Wrong host — make sure you copied the full URI from Supabase\n' +
      '    3. Tables not created yet — run database/schema.sql in Supabase SQL Editor\n'
    );
    // Do not exit — requests will return 500 until the DB is fixed
  }
})();

pool.on('error', (err) => {
  // Log but never exit — errors are handled per-request
  console.error('❌ Unexpected database pool error:', err.message);
});

// ─── Query helper ────────────────────────────────────────────────────────────

/**
 * Execute a parameterised SQL query.
 * @param {string} text   SQL query string
 * @param {Array}  params Query parameters
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (process.env.NODE_ENV === 'development') {
      const duration = Date.now() - start;
      const preview  = text.length > 80 ? text.substring(0, 80) + '…' : text;
      console.log(`[DB] ${duration}ms | ${res.rowCount} row(s) | ${preview}`);
    }
    return res;
  } catch (error) {
    console.error('[DB] Query error:', error.message, '\nSQL:', text);
    throw error;
  }
};

// ─── Transaction helper ───────────────────────────────────────────────────────

/**
 * Run multiple queries inside a single transaction.
 * Rolls back automatically on error.
 * @param {Function} callback  async (client) => result
 */
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DB] Transaction rolled back:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

// ─── Health check ─────────────────────────────────────────────────────────────

/**
 * Ping the database.
 * @returns {Promise<boolean>}
 */
const checkConnection = async () => {
  try {
    const result = await query('SELECT NOW() AS now');
    return result.rows.length > 0;
  } catch {
    return false;
  }
};

// ─── Auto-migration: add stock_quantity to menu_items if missing ──────────────
const runMigrations = async () => {
  // ── stock_quantity column ────────────────────────────────────────────────
  try {
    await pool.query(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT -1
    `);
    console.log('✅ Migration: stock_quantity column ready');
  } catch (err) {
    console.warn('⚠️  Migration warning (stock_quantity):', err.message);
  }

  // ── Drop overly-restrictive category CHECK constraint ───────────────────
  // The original schema locked categories to 4 values; we now allow any string.
  try {
    await pool.query(`
      ALTER TABLE menu_items
      DROP CONSTRAINT IF EXISTS menu_items_category_check
    `);
    console.log('✅ Migration: category CHECK constraint removed');
  } catch (err) {
    console.warn('⚠️  Migration warning (category check):', err.message);
  }

  // ── offers table ─────────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS offers (
        id                  SERIAL PRIMARY KEY,
        title               VARCHAR(200) NOT NULL,
        description         TEXT DEFAULT '',
        discount_percentage NUMERIC(5,2),
        discount_amount     NUMERIC(10,2),
        min_order_amount    NUMERIC(10,2),
        valid_from          TIMESTAMPTZ NOT NULL,
        valid_until         TIMESTAMPTZ NOT NULL,
        is_active           BOOLEAN DEFAULT TRUE,
        created_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Migration: offers table ready');
  } catch (err) {
    console.warn('⚠️  Migration warning (offers table):', err.message);
  }
  // NOTE: To enable Supabase Realtime on orders/menu_items/students tables,
  // run this once in the Supabase SQL Editor (requires superuser):
  //   alter publication supabase_realtime add table orders, menu_items, students;
  // The pooler connection user does not have ALTER PUBLICATION privileges.
};

// Run migrations after a short delay to allow pool to stabilize
setTimeout(runMigrations, 3000);

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { pool, query, transaction, checkConnection };
