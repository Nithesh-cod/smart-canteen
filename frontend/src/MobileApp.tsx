import React, { useState, useEffect, useCallback } from 'react';
import * as authService from './services/auth.service';
import { signIntoFirebase } from './services/firebase';
import UnifiedLogin from './pages/UnifiedLogin';
import StudentKiosk from './pages/StudentKiosk';
import OrderTracking from './pages/OrderTracking';
import ChefDisplay from './pages/ChefDisplay';
import OwnerDashboard from './pages/OwnerDashboard';
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
// which is the whole reason to install it rather than use the website. A guest
// kiosk flow on a personal device would throw that away on every launch.
//
// Role decides what the app IS, and role comes from the server (GET /api/auth/me)
// — never from anything stored on the device. The same account works here, on
// the hosted site and on the counter PC, because all three talk to one backend.
// ============================================================================

type Phase = 'checking' | 'signed-out' | 'ready';
type StudentTab = 'menu' | 'track';

/**
 * Sign into Firebase Auth so the client-side realtime listeners are authorised
 * by Security Rules. Best-effort: the REST-backed UI still works without it.
 */
async function ensureFirebaseAuth(): Promise<void> {
  try {
    const res = await authService.getFirebaseToken();
    if (res.success && res.data?.firebase_token) {
      await signIntoFirebase(res.data.firebase_token);
    }
  } catch {
    /* non-fatal — falls back to REST polling */
  }
}

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
      // 401/expired/offline — treat as signed out rather than guessing.
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
  // UnifiedLogin already routes by server-assigned role on the web. Here the
  // shell owns navigation instead, so it just re-resolves the session and this
  // component decides what to render.
  if (phase === 'signed-out') {
    return (
      <>
        <NetworkBanner />
        <UnifiedLogin onAuthenticated={resolveSession} />
      </>
    );
  }

  // ── Staff ─────────────────────────────────────────────────────────────────
  // Same panels as the web, same credentials, same data. No tab bar: a chef
  // has one job on this screen and a bottom-of-screen switcher would only get
  // in the way during service.
  if (role === 'chef') {
    return (
      <>
        <NetworkBanner />
        <ChefDisplay />
        <SignOutPill label={name || 'Chef'} onSignOut={handleSignOut} />
      </>
    );
  }

  if (role === 'admin') {
    return (
      <>
        <NetworkBanner />
        <OwnerDashboard />
        <SignOutPill label={name || 'Owner'} onSignOut={handleSignOut} />
      </>
    );
  }

  // ── Student — Menu | Track ────────────────────────────────────────────────
  return (
    <>
      <NetworkBanner />
      <div style={{ paddingTop: 52 }}>
        <nav style={tabBarStyle} className="lg-surface">
          <TabButton active={tab === 'menu'} onClick={() => setTab('menu')} glyph="🍽️" label="Menu" />
          <TabButton active={tab === 'track'} onClick={() => setTab('track')} glyph="📍" label="Track" />
        </nav>

        {/* Both stay MOUNTED, with the inactive one hidden. Unmounting the menu
            on every tab switch would drop the cart's optimistic state and force
            a refetch of the whole menu — and on a phone that is a visible
            stall each time someone checks their order. */}
        <div style={{ display: tab === 'menu' ? 'block' : 'none' }}>
          <StudentKiosk />
        </div>
        <div style={{ display: tab === 'track' ? 'block' : 'none' }}>
          <OrderTracking />
        </div>
      </div>
    </>
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

const SignOutPill: React.FC<{ label: string; onSignOut: () => void }> = ({ label, onSignOut }) => (
  <button
    onClick={onSignOut}
    style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 200,
      padding: '10px 16px',
      borderRadius: 100,
      border: '1px solid rgba(255,255,255,0.18)',
      background: 'rgba(20,10,9,0.82)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
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
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 24,
};

const tabBarStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 150,
  display: 'flex',
  gap: 6,
  padding: 6,
  borderRadius: 0,
};

export default MobileApp;
