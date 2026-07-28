// Runs before any test module is loaded (jest setupFiles). Sets a deterministic
// test environment. These are set BEFORE app.js calls dotenv.config(), and
// dotenv does not override already-set vars — so these win.
process.env.NODE_ENV = 'test';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret_key';
process.env.PRINTER_TYPE = 'none'; // don't attempt real prints during tests
// Dummy Razorpay keys so the SDK instantiates without a real .env (e.g. in CI).
// Tests never call the live Razorpay API — the webhook tests verify HMAC locally.
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';

// SAFETY: tests must run against the Firestore EMULATOR, never real Firestore.
// `firebase emulators:exec` sets FIRESTORE_EMULATOR_HOST. If it's missing, the
// Admin SDK would use the real service account — refuse to run.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    'Refusing to run: FIRESTORE_EMULATOR_HOST is not set. Run the suite with ' +
    '`npm test` (which starts the Firestore emulator), not `jest` directly.'
  );
}
