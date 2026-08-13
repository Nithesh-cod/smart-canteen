import type { CapacitorConfig } from '@capacitor/cli';

// ============================================================================
// CAPACITOR — Android app shell
// ============================================================================
// Wraps the same React bundle the website runs. One codebase, so the cart,
// ordering and payment logic cannot drift between the app and the web — which
// is exactly where sync bugs would otherwise live.
//
// Build the APK with:
//   npm run build          # produce dist/
//   npx cap sync android   # copy dist/ into the native project
//   npx cap open android   # opens Android Studio → Build > Build APK
// ============================================================================

const config: CapacitorConfig = {
  appId: 'com.smartcanteen.app',
  appName: 'Smart Canteen',
  webDir: 'dist',

  android: {
    // The bundle is served from http://localhost inside the WebView, which is
    // why that origin has to be in the backend's CORS allowlist. Anything the
    // app fetches from the API goes to the absolute Render origin instead —
    // there is no Vercel rewrite in here (see utils/constants.ts).
    //
    // Cleartext stays OFF: every backend call is https, and enabling it would
    // silently permit plaintext traffic carrying JWTs and payment calls.
    allowMixedContent: false,
  },

  server: {
    // Android's WebView refuses cookies and some storage on a bare
    // "http://localhost" origin; the https scheme avoids that class of
    // surprise without needing a certificate, since the content is local.
    androidScheme: 'https',
  },
};

export default config;
