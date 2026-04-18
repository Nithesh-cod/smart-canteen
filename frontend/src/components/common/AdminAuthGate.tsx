import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as authService from '../../services/auth.service';

// ─── JWT decoder (no verification — just reads the payload) ───────────────────
const decodeJWT = (token: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
};

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'wrong_role';

interface AdminAuthGateProps {
  requiredRoles: string[];
  dashboardName: string;
  /** Env-var roll number for silent auto-login (no form shown) */
  autoLoginRoll?: string;
  children: React.ReactNode;
}

const AdminAuthGate: React.FC<AdminAuthGateProps> = ({
  requiredRoles,
  dashboardName,
  autoLoginRoll,
  children,
}) => {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [roll, setRoll] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const autoLoggingIn = useRef(false);

  // ── Silent auto-login ──────────────────────────────────────────────────────
  const silentLogin = useCallback(async (rollNum: string) => {
    if (autoLoggingIn.current) return;
    autoLoggingIn.current = true;
    try {
      const result = await authService.login(rollNum.trim());
      if (!result.success || !result.data) {
        autoLoggingIn.current = false;
        setStatus('unauthenticated');
        return;
      }
      const payload = decodeJWT(result.data.token);
      const role = payload?.role as string | undefined;
      if (!role || !requiredRoles.includes(role)) {
        autoLoggingIn.current = false;
        setStatus('wrong_role');
        return;
      }
      authService.saveAuthData(result.data.token, result.data.student);
      setStatus('authenticated');
    } catch {
      autoLoggingIn.current = false;
      setStatus('unauthenticated');
    }
  }, [requiredRoles]);

  // ── Check stored token / trigger auto-login ────────────────────────────────
  const checkToken = useCallback(() => {
    const token = localStorage.getItem('canteen_token');
    if (token) {
      const payload = decodeJWT(token);
      if (payload) {
        const expired = payload.exp && (payload.exp as number) * 1000 < Date.now();
        if (!expired) {
          const role = payload.role as string | undefined;
          if (role && requiredRoles.includes(role)) {
            setStatus('authenticated');
            return;
          }
        }
      }
      authService.clearAuthData();
    }
    // No valid token — auto-login silently if roll configured
    if (autoLoginRoll) {
      silentLogin(autoLoginRoll);
    } else {
      setStatus('unauthenticated');
    }
  }, [requiredRoles, autoLoginRoll, silentLogin]);

  useEffect(() => {
    checkToken();

    // On 401: if auto-roll configured, re-login silently; else show login form
    const handleUnauth = () => {
      autoLoggingIn.current = false;
      if (autoLoginRoll) {
        setStatus('checking');
        silentLogin(autoLoginRoll);
      } else {
        setStatus('unauthenticated');
        setError('Session expired. Please log in again.');
      }
    };
    window.addEventListener('auth:unauthorized', handleUnauth);
    return () => window.removeEventListener('auth:unauthorized', handleUnauth);
  }, [checkToken, autoLoginRoll, silentLogin]);

  // ── Manual login (shown only when no autoLoginRoll configured) ───────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roll.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await authService.login(roll.trim());
      if (!result.success || !result.data) {
        setError(result.message || 'Login failed. Check your roll number.');
        return;
      }
      const payload = decodeJWT(result.data.token);
      const role = payload?.role as string | undefined;
      if (!role || !requiredRoles.includes(role)) {
        setError(`Access denied. This dashboard requires: ${requiredRoles.join(' / ')} role.`);
        return;
      }
      authService.saveAuthData(result.data.token, result.data.student);
      setStatus('authenticated');
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'checking') {
    return (
      <div style={pageStyle}>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Rajdhani, sans-serif', fontSize: '1rem' }}>
          Loading…
        </div>
      </div>
    );
  }

  if (status === 'authenticated') {
    return <>{children}</>;
  }

  // Wrong role or unauthenticated (manual login form — only if no autoLoginRoll)
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>
            {dashboardName.toLowerCase().includes('owner') ? '👔' : '👨‍🍳'}
          </div>
          <h1 style={headingStyle}>{dashboardName}</h1>
          <p style={subStyle}>
            {status === 'wrong_role'
              ? `Your account doesn't have ${requiredRoles.join('/')} access.`
              : 'Sign in with your roll number to continue.'}
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Roll Number</label>
            <input
              type="text"
              value={roll}
              onChange={(e) => setRoll(e.target.value)}
              placeholder="e.g. ADMIN001"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#00f5ff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,245,255,0.12)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(0,245,255,0.25)'; e.currentTarget.style.boxShadow = 'none'; }}
              autoFocus
            />
          </div>
          {error && <div style={errorStyle}>{error}</div>}
          <button
            type="submit"
            disabled={loading || !roll.trim()}
            style={{ ...btnStyle, opacity: loading || !roll.trim() ? 0.6 : 1, cursor: loading || !roll.trim() ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        {status === 'wrong_role' && (
          <button
            onClick={() => { authService.clearAuthData(); setStatus('unauthenticated'); setError(''); }}
            style={{ ...btnStyle, marginTop: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
          >
            Use a different account
          </button>
        )}
      </div>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0f0a1f 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(0,245,255,0.2)',
  borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 400,
  boxShadow: '0 0 60px rgba(0,245,255,0.08)',
};
const headingStyle: React.CSSProperties = {
  fontFamily: 'Orbitron, sans-serif', fontSize: '1.3rem', fontWeight: 900,
  background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0,
};
const subStyle: React.CSSProperties = {
  fontFamily: 'Rajdhani, sans-serif', fontSize: '0.9rem',
  color: 'rgba(255,255,255,0.45)', marginTop: 6,
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.75rem',
  fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '1.5px',
  textTransform: 'uppercase', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 10,
  border: '1px solid rgba(0,245,255,0.25)', background: 'rgba(255,255,255,0.04)',
  color: '#fff', fontFamily: 'Rajdhani, sans-serif', fontSize: '1rem',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s',
};
const btnStyle: React.CSSProperties = {
  width: '100%', padding: '13px', borderRadius: 12, border: 'none',
  background: 'linear-gradient(135deg, rgba(0,245,255,0.25), rgba(255,0,255,0.25))',
  color: '#00f5ff', fontFamily: 'Orbitron, sans-serif', fontWeight: 700,
  fontSize: '0.95rem', letterSpacing: '0.5px', transition: 'all 0.2s',
};
const errorStyle: React.CSSProperties = {
  background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.35)',
  borderRadius: 8, padding: '10px 14px', color: '#ff3366',
  fontFamily: 'Rajdhani, sans-serif', fontSize: '0.88rem',
};

export default AdminAuthGate;
