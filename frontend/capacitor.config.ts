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
    // Cleartext stays OFF here: this flag is blanket permission for ANY
    // plain-HTTP subresource on any page the WebView loads, third-party
    // checkout pages included, and every backend call is https anyway.
    //
    // Razorpay's fingerprinting step does need plain HTTP to loopback, which
    // is granted narrowly in res/xml/network_security_config.xml — loopback
    // only, never a network hop. See that file for why netbanking failed here
    // but worked on the website.
    allowMixedContent: false,
  },

  server: {
    // Android's WebView refuses cookies and some storage on a bare
    // "http://localhost" origin; the https scheme avoids that class of
    // surprise without needing a certificate, since the content is local.
    androidScheme: 'https',

    // Serve the local bundle under the site's own hostname so the page origin
    // is https://smart-canteen-pi-gray.vercel.app instead of https://localhost.
    //
    // Razorpay's checkout session is bound to the origin that created it, and
    // that origin is the last remaining difference between "netbanking works on
    // the website" and "netbanking 500s in the app" — same key, same backend,
    // same account, and the cleartext fix in network_security_config.xml did
    // not change the outcome. An unregistered origin is a plausible reason for
    // /payments/validate/account to fail the way it does.
    //
    // Nothing is fetched FROM this origin at runtime: API and socket traffic
    // both go to the absolute Render origin (see utils/constants.ts), so
    // routing the origin's own paths to local files costs nothing. The backend
    // already allows this origin through CORS because the website uses it.
    //
    // Side effect worth knowing: storage is per-origin, so anyone already
    // signed in on a previous build lands on the login screen once.
    hostname: 'smart-canteen-pi-gray.vercel.app',
  },
};

export default config;
