// ============================================================================
// BUILD A PRODUCTION ENV BLOCK FROM THE LOCAL .env
// ============================================================================
// Copying backend/.env straight into a host breaks the deploy in several ways
// that all fail quietly. This reads the local file, drops what must not travel,
// overrides what must change, and writes a paste-ready block.
//
//   node scripts/make-render-env.js > render.env.txt
//
// The output contains REAL SECRETS. It is written to stdout so it never lands
// in the repo by accident; redirect it somewhere outside version control, paste
// it into the host, then delete it.
// ============================================================================

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '../.env');
const SA_PATH = path.resolve(__dirname, '../serviceAccountKey.json');

// Never travel to the server. Each would fail in a different, quiet way.
const DROP = {
  GOOGLE_APPLICATION_CREDENTIALS:
    'points at a gitignored local file that does not exist on the host — boot crashes',
  ANTHROPIC_API_KEY: 'nothing in the app reads it; no reason to expose a key',
  ADMIN_ROLLS: 'removed — granting staff access by roll number was a security hole',
  CHEF_ROLLS: 'removed — roles live in the students.role field now',
  PORT: 'set by the host',
  FRONTEND_URL: 'only FRONTEND_URLS (plural) is read',
  PRINTER_NAME: 'counter-PC hardware only',
  PRINTER_ADDRESS: 'counter-PC hardware only',
  PRINTER_BAUD: 'counter-PC hardware only',
  PRINTER_PORT: 'counter-PC hardware only',
  DATABASE_URL: 'migrated to Firestore',
  SUPABASE_URL: 'migrated to Firestore',
  SUPABASE_ANON_KEY: 'migrated to Firestore',
};

// Must differ from local, whatever the local file says.
const OVERRIDE = {
  NODE_ENV: ['production', 'dev mode disables the stock + webhook boot guards'],
  PRINTER_TYPE: ['none', 'no printer on the host; any other value suppresses the PDF receipt'],
};

// Correct locally, but wrong for production — flagged, not silently changed.
const REVIEW = {
  FRONTEND_URLS: 'MUST become your Vercel URL, or CORS blocks the whole site',
  JWT_SECRET: 'regenerate — this value has lived on a dev machine',
  JWT_REFRESH_SECRET: 'regenerate — this value has lived on a dev machine',
  RAZORPAY_KEY_ID: 'rzp_test_* takes no real money; switch to live when selling',
  RAZORPAY_WEBHOOK_SECRET: 'must match the secret set on the Razorpay webhook',
};

function parseEnv(text) {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out.set(key, val);
  }
  return out;
}

if (!fs.existsSync(ENV_PATH)) {
  console.error(`No .env at ${ENV_PATH}`);
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
const lines = [];
const notes = [];

lines.push('# Generated from backend/.env — CONTAINS REAL SECRETS, do not commit.');
lines.push('# Paste into the host\'s environment, then delete this file.');
lines.push('');

// Firebase credentials: the host needs the JSON inline, not a file path.
if (fs.existsSync(SA_PATH)) {
  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
  lines.push('# Whole service-account JSON on one line (replaces the file path).');
  lines.push(`FIREBASE_SERVICE_ACCOUNT=${JSON.stringify(sa)}`);
  lines.push('');
} else {
  notes.push(`serviceAccountKey.json not found at ${SA_PATH} — add FIREBASE_SERVICE_ACCOUNT by hand`);
}

for (const [key, [value, why]] of Object.entries(OVERRIDE)) {
  const was = env.get(key);
  lines.push(`${key}=${value}`);
  if (was !== undefined && was !== value) {
    notes.push(`${key}: local was "${was}" → forced to "${value}" (${why})`);
  }
}
lines.push('');

for (const [key, value] of env) {
  if (key in DROP || key in OVERRIDE) continue;
  if (key in REVIEW) lines.push(`# REVIEW: ${REVIEW[key]}`);
  lines.push(`${key}=${value}`);
}

console.log(lines.join('\n'));

console.error('\n──────── review before pasting ────────');
for (const [key, why] of Object.entries(DROP)) {
  if (env.has(key)) console.error(`  dropped ${key} — ${why}`);
}
for (const n of notes) console.error(`  ${n}`);
for (const key of Object.keys(REVIEW)) {
  if (env.has(key)) console.error(`  CHECK ${key} — ${REVIEW[key]}`);
}
console.error('───────────────────────────────────────');
