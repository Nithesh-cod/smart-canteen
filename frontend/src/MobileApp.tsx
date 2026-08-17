import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import * as authService from './services/auth.service';
import UnifiedLogin from './pages/UnifiedLogin';
import NetworkBanner from './components/common/NetworkBanner';
import { Skeleton } from './components/common/states';
import logoUrl from './assets/logo.png';

// ============================================================================
// MOBILE APP SHELL
// ============================================================================
// The APK's root. Differs from the web app in one deliberate way: the web
// opens straight onto the public kiosk (a canteen terminal anyone can walk up
// to and order from as a guest), whereas the app opens on SIGN IN.
//
// That is not an arbitrary difference. A phone belongs to one person, so the
// app can carry their identity, points and order history between sessions —
// which is the whole reason to install it rather than use the website.
//
// Role decides what the app IS, and role comes from the server
// (GET /api/auth/me) — never from anything stored on the device. The same
// account works here, on the hosted site and on the counter PC, because all
// three talk to one backend.
//
// ── WHY THE STAFF PANELS ARE LAZY ───────────────────────────────────────────
// Statically importing them put the chef display, the owner dashboard and the
// charting library into the one bundle every launch has to parse — around a
// megabyte of JavaScript before the first pixel, on a phone CPU. A student
// never opens either panel, and an owner does not need the kitchen display.
// Loading them on demand means each role parses roughly what it actually uses.
// ============================================================================

// StudentKiosk is lazy for the same reason the staff panels are: it imports
// services/firebase, which initialises the Firestore SDK at module scope. A
// static import here would drag that 649KB onto the LOGIN screen — the one
// screen in the app that needs no database at all.
const StudentKiosk = lazy(() => import('./pages/StudentKiosk'));
const ChefDisplay = lazy(() => import('./pages/ChefDisplay'));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const OrderTracking = lazy(() => import('./pages/OrderTracking'));

type Phase = 'checking' | 'signed-out' | 'ready';
type StudentTab = 'menu' | 'track';

/**
 * Sign into Firebase Auth so the client-side realtime listeners are authorised
 * by Security Rules. Best-effort: the REST-backed UI still works without it.
 *
 * The import is DYNAMIC on purpose. services/firebase runs initializeApp,
 * getFirestore and getAuth at module scope, so importing it at the top of this
 * file pulled the whole 649KB Firestore SDK — downloaded, parsed AND
 * initialised — before the login form could paint. That is the single largest
 * dependency in the app, loaded to render a screen with two text inputs, on a
 * phone CPU. Deferring it to the moment a session actually exists moves that
 * cost off the launch path entirely.
 */
async function ensureFirebaseAuth(): Promise<void> {
  try {
    const res = await authService.getFirebaseToken();
    if (res.success && res.data?.firebase_token) {
      const { signIntoFirebase } = await import('./services/firebase');
      await signIntoFirebase(res.data.firebase_token);
    }
  } catch {
    /* non-fatal — falls back to REST polling */
  }
}

/** Shown while a lazily-loaded panel is fetched. */
const PanelFallback: React.FC = () => (
  <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div className="lg-surface" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Skeleton width="60%" height={16} />
      <Skeleton width="85%" height={12} />
      <Skeleton width="45%" height={12} />
    </div>
  </div>
);

const MobileApp: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('checking');
  const [role, setRole] = useState<string>('student');
  const [name, setName] = useState<string>('');
  const [tab, setTab] = useState<StudentTab>('menu');

  // ── Resolve the session against the SERVER, not localStorage ──────────────
  // A stored token says nothing about whether it is still valid or what role it
  // now carries: an owner can demote a chef, or deactivate an account, and the
  // device would never know. Asking the server on every launch means a revoked
  // account cannot keep a working app just by holding an old token.
  const resolveSession = useCallback(async () => {
    if (!authService.getStoredToken()) {
      setPhase('signed-out');
      return;
    }
    try {
      const me = await authService.getMe();
      if (me.success && me.data) {
        setRole(me.data.role || 'student');
        setName(me.data.name || '');
        await ensureFirebaseAuth();
        setPhase('ready');
      } else {
        authService.clearAuthData();
        setPhase('signed-out');
      }
    } catch {
      authService.clearAuthData();
      setPhase('signed-out');
    }
  }, []);

  useEffect(() => {
    resolveSession();
    const onUnauth = () => {
      authService.clearAuthData();
      setPhase('signed-out');
    };
    window.addEventListener('auth:unauthorized', onUnauth);
    return () => window.removeEventListener('auth:unauthorized', onUnauth);
  }, [resolveSession]);

  const handleSignOut = useCallback(() => {
    authService.clearAuthData();
    setTab('menu');
    setPhase('signed-out');
  }, []);

  // ── Checking ──────────────────────────────────────────────────────────────
  if (phase === 'checking') {
    return (
      <div style={splashStyle}>
        <img src={logoUrl} alt="" width={96} height={96} style={{ borderRadius: 22 }} />
        <div className="lg-surface" style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 10, width: 220 }}>
          <Skeleton width={140} height={13} />
          <Skeleton width={190} height={10} />
        </div>
      </div>
    );
  }

  // ── Signed out — sign in or create an account ─────────────────────────────
  if (phase === 'signed-out') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <NetworkBanner inline />
        <UnifiedLogin onAuthenticated={resolveSession} />
      </div>
    );
  }

  // ── Staff ─────────────────────────────────────────────────────────────────
  // Same panels as the web, same credentials, same data. No tab bar: a chef has
  // one job on this screen and a switcher would only get in the way in service.
  if (role === 'chef' || role === 'admin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <NetworkBanner inline />
        <Suspense fallback={<PanelFallback />}>
          {role === 'chef' ? <ChefDisplay /> : <OwnerDashboard />}
        </Suspense>
        <SignOutPill label={name || (role === 'chef' ? 'Chef' : 'Owner')} onSignOut={handleSignOut} />
      </div>
    );
  }

  // ── Student — Menu | Track ────────────────────────────────────────────────
  // Laid out as a flex column with the bar in NORMAL FLOW, not fixed.
  //
  // Three separate things previously claimed `position: fixed; top: 0` — the
  // network banner, this tab bar, and the kiosk's own floating profile pill —
  // so on a phone they stacked on top of one another and the page read as if
  // its layout had collapsed. A fixed bar also needs its height hardcoded as
  // padding on the content below, which silently breaks the moment the banner
  // appears and adds ~66px nothing accounted for.
  //
  // In flow, the browser does that arithmetic. `position: sticky` keeps the bar
  // visible while the menu scrolls without removing it from the layout.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <NetworkBanner inline />
      <div style={{ flex: 1, minHeight: 0 }}>
        {/* Sign out lives IN the bar, not as a floating pill. The kiosk's own
            profile pill is hidden on native (it duplicated the app chrome), so
            without this a student had no way to sign out at all. A floating
            pill would not work here either: the kiosk already floats a cart
            button in the bottom-right corner. */}
        <nav style={tabBarStyle} className="lg-surface">
          <TabButton active={tab === 'menu'} onClick={() => setTab('menu')} glyph="🍽️" label="Menu" />
          <TabButton active={tab === 'track'} onClick={() => setTab('track')} glyph="📍" label="Track" />
          <button
            onClick={handleSignOut}
            title={name ? `${name} — sign out` : 'Sign out'}
            aria-label={name ? `${name} — sign out` : 'Sign out'}
            style={signOutTabStyle}
          >
            <span aria-hidden="true">⏻</span>
          </button>
        </nav>

        {/* The menu stays MOUNTED when switching to Track. Unmounting it would
            drop the cart's optimistic state and refetch the whole menu, which
            on a phone is a visible stall every time someone checks an order.
            Track is lazy, so it costs nothing until first opened. */}
        <div style={{ display: tab === 'menu' ? 'block' : 'none' }}>
          <Suspense fallback={<PanelFallback />}>
            <StudentKiosk />
          </Suspense>
        </div>
        {tab === 'track' && (
          <Suspense fallback={<PanelFallback />}>
            <OrderTracking />
          </Suspense>
        )}
      </div>
    </div>
  );
};

// ── Bits ────────────────────────────────────────────────────────────────────

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  glyph: string;
  label: string;
}> = ({ active, onClick, glyph, label }) => (
  <button
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '13px 8px',
      background: active ? 'rgba(255, 90, 95, 0.16)' : 'transparent',
      border: 'none',
      borderRadius: 14,
      color: active ? '#ff5a5f' : 'rgba(255,242,235,0.55)',
      fontFamily: "'Sora', sans-serif",
      fontSize: '0.74rem',
      fontWeight: 800,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      cursor: 'pointer',
      transition: 'background 0.2s, color 0.2s',
    }}
  >
    <span style={{ fontSize: '1rem' }} aria-hidden="true">{glyph}</span>
    {label}
  </button>
);

// Staff panels only. The class carries the positioning so index.css can lift it
// clear of the owner dashboard's bottom bar — below 600px that sidebar becomes a
// fixed 56px tab bar along the bottom edge, and this pill was landing on top of
// it. Inline styles cannot express that breakpoint.
const SignOutPill: React.FC<{ label: string; onSignOut: () => void }> = ({ label, onSignOut }) => (
  <button
    onClick={onSignOut}
    className="app-signout-pill"
    style={{
      position: 'fixed',
      bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
      right: 16,
      zIndex: 200,
      padding: '10px 16px',
      borderRadius: 100,
      border: '1px solid rgba(255,255,255,0.18)',
      background: 'rgba(20,10,9,0.92)',
      color: 'rgba(255,242,235,0.8)',
      fontFamily: "'Inter', sans-serif",
      fontSize: '0.76rem',
      fontWeight: 700,
      cursor: 'pointer',
    }}
  >
    {label} · Sign out
  </button>
);

const splashStyle: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 24,
};

const signOutTabStyle: React.CSSProperties = {
  // flex: 0 so it takes only the width it needs — the two real tabs keep the
  // rest and stay equal, rather than being squeezed into thirds by a control
  // that is not a destination.
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 44,
  padding: '13px 0',
  background: 'transparent',
  border: 'none',
  borderRadius: 14,
  color: 'rgba(255,242,235,0.45)',
  fontSize: '1rem',
  cursor: 'pointer',
};

const tabBarStyle: React.CSSProperties = {
  // Sticky, not fixed: it stays visible while the menu scrolls but remains part
  // of the layout, so the content below is positioned by the browser instead of
  // by a hardcoded padding that breaks whenever the banner appears.
  position: 'sticky',
  top: 0,
  zIndex: 150,
  display: 'flex',
  gap: 6,
  padding: 6,
  borderRadius: 0,
};

export default MobileApp;
