import React, { useState, useEffect, useCallback } from 'react';
import * as authService from '../../services/auth.service';
import { PermissionDeniedState, SessionExpiredState, Skeleton } from './states';

/**
 * Sign into Firebase Auth (custom token from the backend) so the dashboard's
 * client-side Firestore listeners are authorized by Security Rules. Best-effort:
 * if it fails, realtime reads will be denied but the REST-backed UI still works.
 */
async function ensureFirebaseAuth(): Promise<void> {
  try {
    const res = await authService.getFirebaseToken();
    if (res.success && res.data?.firebase_token) {
      // Dynamic: services/firebase initialises the Firestore SDK at module
      // scope, so a static import would load 649KB to render a login form.
      const { signIntoFirebase } = await import('../../services/firebase');
      await signIntoFirebase(res.data.firebase_token);
    }
  } catch {
    /* non-fatal — dashboards degrade to REST polling if realtime is denied */
  }
}

// ============================================================================
// AdminAuthGate  (FIX S1/S2)
// ============================================================================
// Gates the Chef / Owner dashboards behind REAL authentication:
//   • No client-side JWT decoding — the role is verified server-side via
//     GET /api/auth/me on every mount.
//   • No autoLoginRoll, no silent login, no auto-create-admin. Those made the
//     dashboards accessible to anyone who knew a roll number.
//   • A real identifier + password form. Accounts are created offline with
//     backend/scripts/create-admin.js.
// ============================================================================

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'wrong_role' | 'expired';

interface AdminAuthGateProps {
  requiredRoles: string[];
  dashboardName: string;
  children: React.ReactNode;
}

const AdminAuthGate: React.FC<AdminAuthGateProps> = ({
  requiredRoles,
  dashboardName,
  children,
}) => {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Verify the stored token's role with the server (never trust the client) ──
  const verifyAccess = useCallback(async () => {
    const token = authService.getStoredToken();
    if (!token) {
      setStatus('unauthenticated');
      return;
    }
    try {
      const me = await authService.getMe();
      if (me.success && me.data && requiredRoles.includes(me.data.role)) {
        await ensureFirebaseAuth(); // authorize Firestore realtime before showing the dashboard
        setStatus('authenticated');
      } else if (me.success && me.data) {
        setStatus('wrong_role');
      } else {
        authService.clearAuthData();
        setStatus('unauthenticated');
      }
    } catch {
      // 401/expired/invalid — drop the token and show the login form
      authService.clearAuthData();
      setStatus('unauthenticated');
    }
  }, [requiredRoles]);

  useEffect(() => {
    verifyAccess();

    // A 401 mid-session means the token aged out while someone was working —
    // shown as its own state rather than dumping them on a bare login form
    // with a red line, which reads like their password stopped working.
    const handleUnauth = () => {
      setStatus('expired');
      setError('');
    };
    window.addEventListener('auth:unauthorized', handleUnauth);
    return () => window.removeEventListener('auth:unauthorized', handleUnauth);
  }, [verifyAccess]);

  // ── Manual login ───────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const result = await authService.login(identifier.trim(), password);
      if (!result.success || !result.data) {
        setError(result.message || 'Login failed. Check your credentials.');
        return;
      }
      const role = result.data.student.role || 'student';
      if (!requiredRoles.includes(role)) {
        // Do NOT keep a session that lacks the required role.
        authService.clearAuthData();
        // There are TWO ways to hit a wrong role — a stored token checked on
        // mount, and a fresh login like this one. They used to behave
        // differently: the stored-token path got a proper explanation while
        // this path, the far more common one (someone typing chef credentials
        // into the owner screen), just tinted a line above the same form and
        // invited them to try the credentials that were only just rejected.
        // Both now land on the same state.
        setError('');
        setStatus('wrong_role');
        return;
      }
      authService.saveAuthData(result.data.token, result.data.student);
      await ensureFirebaseAuth(); // authorize Firestore realtime before showing the dashboard
      setStatus('authenticated');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Login failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'checking') {
    return (
      <div style={pageStyle}>
        <div className="lg-surface" style={{ padding: '34px 40px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 260 }}>
          <Skeleton width={150} height={16} />
          <Skeleton width={210} height={12} />
          <Skeleton width={180} height={12} />
        </div>
      </div>
    );
  }

  if (status === 'authenticated') {
    return <>{children}</>;
  }

  // ── Permission denied ─────────────────────────────────────────────────────
  // A valid login at the wrong door. Previously this only tinted a line of
  // text above the same form, so a chef who opened the owner dashboard was
  // invited to type the very credentials that had just been rejected. Naming
  // the required role turns "try again" into "ask an owner".
  if (status === 'wrong_role') {
    return (
      <PermissionDeniedState
        requiredRoles={requiredRoles}
        onSwitchAccount={() => {
          authService.clearAuthData();
          setStatus('unauthenticated');
          setError('');
        }}
      />
    );
  }

  // ── Session expired ───────────────────────────────────────────────────────
  // Distinct from a plain sign-in prompt: this person WAS working and got
  // interrupted, so the reassurance that nothing was lost is the message.
  if (status === 'expired') {
    return <SessionExpiredState onSignIn={() => { setStatus('unauthenticated'); setError(''); }} />;
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>
            {dashboardName.toLowerCase().includes('owner') ? '👔' : '👨‍🍳'}
          </div>
          <h1 style={headingStyle}>{dashboardName}</h1>
          {/* wrong_role and expired now return their own screens above, so by
              the time we reach this form the only case left is "not signed in". */}
          <p style={subStyle}>Sign in to continue.</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Roll Number or Phone</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. OWNER001"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>
          {error && <div style={errorStyle}>{error}</div>}
          <button
            type="submit"
            disabled={loading || !identifier.trim() || !password}
            style={{
              ...btnStyle,
              opacity: loading || !identifier.trim() || !password ? 0.6 : 1,
              cursor: loading || !identifier.trim() || !password ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        <p style={{ ...subStyle, marginTop: 18, fontSize: '0.78rem', textAlign: 'center' }}>
          Admin / chef accounts are created by an administrator with
          <br />
          <code style={{ color: '#ffed4e' }}>npm run create-admin</code>
        </p>
      </div>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #140a09 0%, #241512 50%, #1b0e0c 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255, 90, 95,0.2)',
  borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 400,
  boxShadow: '0 0 60px rgba(255, 90, 95,0.08)',
};
const headingStyle: React.CSSProperties = {
  fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', fontWeight: 900,
  background: 'linear-gradient(135deg, #ff5a5f, #ff9e3d)',
  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0,
};
const subStyle: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif', fontSize: '0.9rem',
  color: 'rgba(255,255,255,0.45)', marginTop: 6,
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'Inter, sans-serif', fontSize: '0.75rem',
  fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '1.5px',
  textTransform: 'uppercase', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 10,
  border: '1px solid rgba(255, 90, 95,0.25)', background: 'rgba(255,255,255,0.04)',
  color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: '1rem',
  outline: 'none', boxSizing: 'border-box',
};
const btnStyle: React.CSSProperties = {
  width: '100%', padding: '13px', borderRadius: 12, border: 'none',
  background: 'linear-gradient(135deg, rgba(255, 90, 95,0.25), rgba(255, 158, 61,0.25))',
  color: '#ff5a5f', fontFamily: 'Sora, sans-serif', fontWeight: 700,
  fontSize: '0.95rem', letterSpacing: '0.5px',
};
const errorStyle: React.CSSProperties = {
  background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.35)',
  borderRadius: 8, padding: '10px 14px', color: '#ff3366',
  fontFamily: 'Inter, sans-serif', fontSize: '0.88rem',
};

export default AdminAuthGate;
