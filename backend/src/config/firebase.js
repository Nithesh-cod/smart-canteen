// ============================================================================
// FIREBASE ADMIN — Firestore data layer
// ============================================================================
// Replaces the Supabase/Postgres `pg` pool (config/database.js). Initializes
// the Firebase Admin SDK once and exports the Firestore handle plus a couple of
// helpers the models use. Uses the modular firebase-admin v14 API.
//
// Credentials are resolved in this order (first that works wins):
//   1. FIRESTORE_EMULATOR_HOST set        → local emulator, no real creds
//   2. FIREBASE_SERVICE_ACCOUNT (JSON)    → full service-account JSON in one env
//   3. GOOGLE_APPLICATION_CREDENTIALS     → path to a service-account .json file
//   4. applicationDefault()               → GCP/Cloud Run ambient creds
//
// NEVER commit the service-account JSON. Point to it via env only.
// ============================================================================

const { initializeApp, cert, applicationDefault, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

function buildApp() {
  if (getApps().length) return getApps()[0];

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || undefined;

  // 1. Emulator — no real credentials needed.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(
      `[Firebase] Using Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`
    );
    return initializeApp({ projectId: projectId || 'smart-canteen-local' });
  }

  // 2. Full service-account JSON provided inline (good for Render/host env).
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    let creds;
    try {
      creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (err) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON: ' + err.message
      );
    }
    console.log('[Firebase] Initialized from FIREBASE_SERVICE_ACCOUNT');
    return initializeApp({ credential: cert(creds), projectId: projectId || creds.project_id });
  }

  // 3. Path to a service-account file (read automatically by applicationDefault()).
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(
      `[Firebase] Initialized from GOOGLE_APPLICATION_CREDENTIALS=` +
      `${process.env.GOOGLE_APPLICATION_CREDENTIALS}`
    );
    return initializeApp({ credential: applicationDefault(), projectId });
  }

  // 4. Ambient credentials (Cloud Run / Cloud Functions), else fail loud.
  try {
    const app = initializeApp({ credential: applicationDefault(), projectId });
    console.log('[Firebase] Initialized with application-default credentials');
    return app;
  } catch (err) {
    throw new Error(
      'No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT (JSON), ' +
      'GOOGLE_APPLICATION_CREDENTIALS (file path), or FIRESTORE_EMULATOR_HOST ' +
      'for local dev. Original error: ' + err.message
    );
  }
}

const app = buildApp();
const db  = getFirestore(app);

// Ignore `undefined` fields instead of throwing — lets models pass optional
// columns straight through the way the old `?? null` pg params did.
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch {
  /* settings can only be applied once; safe to ignore on re-require */
}

/**
 * Run a Firestore transaction. Mirrors the name of the old pg `transaction()`
 * helper so model code reads the same. The callback receives the Firestore
 * transaction object.
 * @param {(tx: FirebaseFirestore.Transaction) => Promise<any>} fn
 */
const runTransaction = (fn) => db.runTransaction(fn);

module.exports = {
  db,
  FieldValue,
  Timestamp,
  runTransaction,
  collections: {
    students:  () => db.collection('students'),
    menuItems: () => db.collection('menu_items'),
    orders:    () => db.collection('orders'),
    offers:    () => db.collection('offers'),
    counters:  () => db.collection('counters'),
  },
};
