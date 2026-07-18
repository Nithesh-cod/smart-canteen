// ============================================================================
// DATABASE MIGRATION RUNNER  (FIX B4)
// ============================================================================
// Applies every database/migrations/*.sql file exactly once, in filename order,
// inside its own transaction. Tracks applied files in the schema_migrations
// table. Replaces the fragile setTimeout auto-migration that used to run inside
// the app process.
//
// Usage:
//   npm run migrate          (run before starting the server)
// ============================================================================

// Skip the connection self-test in database.js — this is a short-lived process.
process.env.MIGRATION_MODE = '1';

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ  DEFAULT NOW()
      )
    `);

    const files = fs.existsSync(MIGRATIONS_DIR)
      ? fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
      : [];

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map(r => r.filename));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  =  ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`  >  applying ${file} ...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count++;
        console.log(`  OK ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  FAILED ${file} — rolled back: ${err.message}`);
        throw err;
      }
    }

    console.log(count === 0
      ? 'Database already up to date.'
      : `Applied ${count} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration run failed:', err.message);
  process.exit(1);
});
