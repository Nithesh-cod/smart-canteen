// ============================================================================
// CREATE ADMIN / CHEF ACCOUNT  (FIX S1/S2 — step g)
// ============================================================================
// Admin and chef accounts are NOT created through the public signup endpoint.
// Run this script offline, once, on a trusted machine.
//
// Usage:
//   node scripts/create-admin.js --name "Canteen Owner" --roll OWNER001 \
//        --phone 9999999999 --password "a-strong-password" --role admin
//
//   --role  admin | chef   (default: admin)
//
// If an account with the given roll number already exists, its password and
// role are updated (useful for promoting an existing student or resetting a
// forgotten admin password).
// ============================================================================

process.env.MIGRATION_MODE = '1'; // skip the DB self-test in database.js

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/database');

const BCRYPT_COST = 12;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name     = arg('name');
  const roll     = arg('roll');
  const phone    = arg('phone');
  const password = arg('password');
  const role     = (arg('role') || 'admin').toLowerCase();

  if (!name || !roll || !phone || !password) {
    console.error(
      'Usage: node scripts/create-admin.js --name "Full Name" --roll ROLL001 ' +
      '--phone 9999999999 --password "strongpass" [--role admin|chef]'
    );
    process.exit(1);
  }
  if (!['admin', 'chef'].includes(role)) {
    console.error('--role must be "admin" or "chef"');
    process.exit(1);
  }
  if (String(password).length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(String(password), BCRYPT_COST);

  try {
    const existing = await pool.query(
      'SELECT id FROM students WHERE roll_number = $1', [roll]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE students SET password_hash = $1, role = $2, is_active = true WHERE roll_number = $3',
        [hash, role, roll]
      );
      console.log(`✅ Updated existing account ${roll} → role=${role}, password reset.`);
    } else {
      await pool.query(
        `INSERT INTO students
           (name, roll_number, phone, password_hash, role, tier, created_at, last_login)
         VALUES ($1, $2, $3, $4, $5, 'Bronze', NOW(), NOW())`,
        [name, roll, phone, hash, role]
      );
      console.log(`✅ Created ${role} account: ${roll}`);
    }
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
