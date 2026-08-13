// Where the API lives, per platform:
//
//   Dev     — Vite proxies /api and /socket.io to localhost:5000 (vite.config.ts).
//   Web     — Vercel rewrites /api/* to Render (vercel.json), so a RELATIVE url
//             is correct and keeps requests same-origin.
//   Native  — there is no Vercel in front of the app. The Android WebView serves
//             the bundle from http://localhost, so a relative "/api" resolves to
//             http://localhost/api and hits nothing at all. The APK must talk to
//             the backend's ABSOLUTE origin.
//
// Sockets always go direct to Render even on web: Vercel rewrites proxy HTTP but
// do not carry a websocket upgrade.
const RENDER_BACKEND = 'https://smart-canteen-api-k9oi.onrender.com';

/**
 * True when running inside the Capacitor native shell (the Android APK).
 * Capacitor injects window.Capacitor before the app bundle executes, so this is
 * reliable at module-evaluation time and needs no build-time flag — one build
 * serves both web and native.
 */
export const IS_NATIVE: boolean =
  typeof window !== 'undefined' &&
  Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor);

const ENV_API    = import.meta.env.VITE_API_URL as string | undefined;
const ENV_SOCKET = import.meta.env.VITE_SOCKET_URL as string | undefined;

/**
 * A relative API url is meaningless inside the app shell. When native, ignore
 * the relative value the web build uses and point at the real backend.
 */
const resolveApiUrl = (): string => {
  if (IS_NATIVE) {
    // An absolute VITE_API_URL (someone pointing a build at staging) is honoured;
    // a relative one is not, because it cannot work here.
    if (ENV_API && /^https?:\/\//i.test(ENV_API)) return ENV_API;
    return `${RENDER_BACKEND}/api`;
  }
  return ENV_API || '/api';
};

export const API_URL    = resolveApiUrl();
export const SOCKET_URL = IS_NATIVE
  ? RENDER_BACKEND
  : (ENV_SOCKET || (import.meta.env.PROD ? RENDER_BACKEND : ''));

export const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || '';

export const ORDER_STATUS = {
  PENDING: 'pending',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const TIER_THRESHOLDS = {
  BRONZE: 0,
  SILVER: 1000,
  GOLD: 3000,
  PLATINUM: 5000,
} as const;

export const TIER_COLORS = {
  Bronze: '#cd7f32',
  Silver: '#c0c0c0',
  Gold: '#ffd700',
  Platinum: '#e5e4e2',
} as const;

export const CATEGORIES = ['all', 'starters', 'mains', 'desserts', 'beverages'] as const;

export const POINTS_PER_RUPEE = 0.1;          // 10% of order value earned as points
export const POINTS_VALUE = 0.1;               // 1 point = ₹0.10
export const MAX_POINTS_DISCOUNT_PERCENT = 50; // max 50% of bill payable with points
export const MIN_POINTS_TO_REDEEM = 100;
