// ============================================================================
// FIREBASE CLIENT — read-only realtime layer (replaces supabase.ts)
// ============================================================================
// The browser only READS live data from Firestore via onSnapshot. All writes
// still go through the Express API (server-authoritative pricing / points /
// stock / auth). Firestore Security Rules enforce that clients cannot write.
//
// Config comes from Vite env vars (frontend/.env):
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
//   VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
//   VITE_FIREBASE_APP_ID
// Set VITE_USE_FIREBASE_EMULATOR=true to point at a local emulator.
// ============================================================================

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  query,
  where,
  onSnapshot,
  type Firestore,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Guard: a missing projectId means the .env isn't wired yet. Fail loud in dev.
export const isFirebaseConfigured = Boolean(firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);

  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    try {
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      // eslint-disable-next-line no-console
      console.info('[Firebase] Connected to Firestore emulator on 127.0.0.1:8080');
    } catch {
      /* already connected on HMR re-run */
    }
  }
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[Firebase] Not configured — set VITE_FIREBASE_* in frontend/.env. ' +
    'Realtime updates are disabled until then.'
  );
}

export { db };

export type SnapshotHandler<T = DocumentData> = (rows: T[]) => void;

/**
 * Subscribe to a Firestore collection with live updates. Drop-in spiritual
 * replacement for the old Supabase `subscribeToTable` — but instead of raw
 * change events it hands you the FULL current set of matching docs (each with
 * its `id`) on every change, which is exactly what the dashboards render.
 *
 * @param path        collection name, e.g. 'orders' | 'menu_items'
 * @param handler     called with the current docs whenever anything changes
 * @param constraints optional Firestore query constraints (where/orderBy/limit)
 * @returns unsubscribe function (no-op if Firebase isn't configured)
 */
export function subscribeToCollection<T = DocumentData>(
  path: string,
  handler: SnapshotHandler<T>,
  constraints: QueryConstraint[] = []
): () => void {
  if (!db) return () => {};
  const q = query(collection(db, path), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
      handler(rows);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error(`[Firebase] onSnapshot(${path}) error:`, err.message);
    }
  );
}

// Re-export the query builders so callers don't import from 'firebase/firestore'
// directly all over the place.
export { where, query, collection };
