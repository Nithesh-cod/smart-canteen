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
//
// STORAGE: Firestore, via the Student model — the same data layer the running
// server uses. This script previously talked to Postgres through
// src/config/database.js, which stopped existing as a live datastore when the
// app migrated to Firestore. That made `npm run create-admin` fail outright,
// and since AdminAuthGate offers no other way to mint a staff login, the chef
// and owner dashboards were unreachable on any fresh deployment.
// ============================================================================

require('dotenv').config();
const bcrypt  = require('bcrypt');
const Student = require('../src/models/Student');

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

  const password_hash = await bcrypt.hash(String(password), BCRYPT_COST);

  try {
    const existing = await Student.findByRoll(String(roll).trim());

    if (existing) {
      // adminUpdate is the privileged path: role + password + reactivation.
      await Student.adminUpdate(existing.id, {
        password_hash,
        role,
        is_active: true,
      });
      console.log(`✅ Updated existing account ${roll} → role=${role}, password reset.`);
    } else {
      const created = await Student.create({
        name:        String(name).trim(),
        roll_number: String(roll).trim(),
        phone:       String(phone).trim(),
        password_hash,
        role,
      });
      console.log(`✅ Created ${role} account: ${roll} (id ${created.id})`);
    }
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exitCode = 1;
  }
}

main();
