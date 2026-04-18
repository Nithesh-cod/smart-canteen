import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store/store';
import { setCredentials } from '../../store/slices/authSlice';
import * as authService from '../../services/auth.service';
import type { Student } from '../../types';
import { useToast } from '../common/Toast';

interface LoginFormProps {
  onLoginSuccess: (student: Student) => void;
}

const RECENT_KEY = 'canteen_recent_students';

function getRecentStudents(): Student[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentStudent(student: Student): void {
  const existing = getRecentStudents().filter((s) => s.id !== student.id);
  const updated = [student, ...existing].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
}

const glowKeyframes = `
@keyframes glow-cycle {
  0%, 100% { text-shadow: 0 0 10px #00f5ff, 0 0 20px #00f5ff, 0 0 40px #00f5ff; }
  50% { text-shadow: 0 0 20px #ff00ff, 0 0 40px #ff00ff, 0 0 80px #ff00ff; }
}
@keyframes float-logo {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-6px); }
}
@keyframes scanline-move {
  0% { top: -2px; }
  100% { top: 100vh; }
}
@keyframes border-pulse {
  0%, 100% { box-shadow: 0 0 30px rgba(0,245,255,0.12), 0 0 60px rgba(255,0,255,0.06), inset 0 1px 0 rgba(255,255,255,0.1); }
  50% { box-shadow: 0 0 50px rgba(0,245,255,0.22), 0 0 100px rgba(255,0,255,0.1), inset 0 1px 0 rgba(255,255,255,0.15); }
}
`;

const cyberBg: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'linear-gradient(135deg, #0a0a1a, #1a0a2e, #0f0a1f)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  fontFamily: "'Rajdhani', sans-serif",
  overflow: 'auto',
  padding: '20px',
  zIndex: 0,
};

const gridOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundImage: `
    linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px)
  `,
  backgroundSize: '50px 50px',
  pointerEvents: 'none',
  zIndex: 0,
};

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupRoll, setSignupRoll] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupDept, setSignupDept] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentStudents, setRecentStudents] = useState<Student[]>([]);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  useEffect(() => {
    setRecentStudents(getRecentStudents());
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim()) {
      setError('Please enter your roll number or phone');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await authService.login(loginIdentifier.trim());
      if (!res.success || !res.data) throw new Error(res.message ?? 'Login failed');
      const { student, token } = res.data;
      dispatch(setCredentials({ student, token }));
      authService.saveAuthData(token, student);
      saveRecentStudent(student);
      showToast(`Welcome back, ${student.name}!`, 'success');
      onLoginSuccess(student);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Login failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim() || !signupRoll.trim() || !signupPhone.trim()) {
      setError('Name, Roll Number, and Phone are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await authService.signup({
        name: signupName.trim(),
        roll_number: signupRoll.trim(),
        phone: signupPhone.trim(),
        department: signupDept.trim() || undefined,
      });
      if (!res.success || !res.data) throw new Error(res.message ?? 'Signup failed');
      const { student, token } = res.data;
      dispatch(setCredentials({ student, token }));
      authService.saveAuthData(token, student);
      saveRecentStudent(student);
      showToast(`Welcome, ${student.name}! Your account is ready.`, 'success');
      onLoginSuccess(student);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Signup failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getInputStyle = (name: string): React.CSSProperties => ({
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${focusedInput === name ? '#00f5ff' : 'rgba(0,245,255,0.25)'}`,
    borderRadius: '10px',
    color: '#fff',
    padding: '14px 18px',
    fontSize: '1rem',
    fontFamily: "'Rajdhani', sans-serif",
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box',
    boxShadow: focusedInput === name ? '0 0 12px rgba(0,245,255,0.2)' : 'none',
  });

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'rgba(255,255,255,0.55)',
    fontSize: '0.78rem',
    marginBottom: '7px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontFamily: "'Orbitron', sans-serif",
  };

  const primaryBtnStyle = (color: string, disabled: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '15px',
    borderRadius: '12px',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled
      ? 'rgba(255,255,255,0.08)'
      : color,
    color: '#fff',
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '0.85rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    boxShadow: disabled ? 'none' : '0 0 22px rgba(0,245,255,0.25)',
    transition: 'all 0.25s',
    opacity: disabled ? 0.6 : 1,
    textTransform: 'uppercase',
  });

  return (
    <>
      <style>{glowKeyframes}</style>
      <div style={cyberBg}>
        <div style={gridOverlay} />

        {/* Scanline */}
        <div style={{
          position: 'fixed',
          left: 0, right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, transparent, rgba(0,245,255,0.25), transparent)',
          animation: 'scanline-move 6s linear infinite',
          pointerEvents: 'none',
          zIndex: 1,
        }} />

        <div style={{
          width: '100%',
          maxWidth: '560px',
          background: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,245,255,0.35)',
          borderRadius: '24px',
          padding: '44px 40px',
          position: 'relative',
          zIndex: 2,
          animation: 'border-pulse 4s ease-in-out infinite',
        }}>

          {/* Corner accents */}
          {[
            { top: -1, left: -1, borderTop: '2px solid #00f5ff', borderLeft: '2px solid #00f5ff', borderRadius: '24px 0 0 0' },
            { top: -1, right: -1, borderTop: '2px solid #ff00ff', borderRight: '2px solid #ff00ff', borderRadius: '0 24px 0 0' },
            { bottom: -1, left: -1, borderBottom: '2px solid #ff00ff', borderLeft: '2px solid #ff00ff', borderRadius: '0 0 0 24px' },
            { bottom: -1, right: -1, borderBottom: '2px solid #00f5ff', borderRight: '2px solid #00f5ff', borderRadius: '0 0 24px 0' },
          ].map((s, i) => (
            <div key={i} style={{ position: 'absolute', width: '24px', height: '24px', ...s }} />
          ))}

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <div style={{ fontSize: '2.6rem', marginBottom: '10px', display: 'inline-block', animation: 'float-logo 3s ease-in-out infinite' }}>
              🍕
            </div>
            <h1 style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '1.9rem',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #00f5ff 0%, #ff00ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              margin: '0 0 6px',
              letterSpacing: '0.15em',
              animation: 'glow-cycle 3s ease-in-out infinite',
            }}>
              SMART CANTEEN
            </h1>
            <p style={{
              color: 'rgba(255,255,255,0.35)',
              fontSize: '0.72rem',
              letterSpacing: '0.35em',
              margin: 0,
              fontFamily: "'Orbitron', sans-serif",
            }}>
              CYBER FOOD ORDERING SYSTEM
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{
            display: 'flex',
            background: 'rgba(0,0,0,0.35)',
            borderRadius: '12px',
            padding: '4px',
            marginBottom: '28px',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {(['login', 'signup'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: '9px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  transition: 'all 0.25s',
                  background: tab === t
                    ? 'linear-gradient(135deg, rgba(0,245,255,0.18), rgba(255,0,255,0.18))'
                    : 'transparent',
                  color: tab === t ? '#00f5ff' : 'rgba(255,255,255,0.38)',
                  boxShadow: tab === t ? '0 0 15px rgba(0,245,255,0.15)' : 'none',
                  textTransform: 'uppercase',
                }}
              >
                {t === 'login' ? '⚡ Login' : '✨ Sign Up'}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(255,51,102,0.12)',
              border: '1px solid rgba(255,51,102,0.4)',
              borderRadius: '10px',
              padding: '11px 16px',
              color: '#ff5577',
              fontSize: '0.88rem',
              marginBottom: '20px',
              textAlign: 'center',
              fontFamily: "'Rajdhani', sans-serif",
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* LOGIN FORM */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} noValidate>
              <div style={{ marginBottom: '22px' }}>
                <label style={labelStyle}>Roll Number or Phone</label>
                <input
                  style={getInputStyle('login-id')}
                  placeholder="CS2023001 or 9876543210"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  autoFocus
                  onFocus={() => setFocusedInput('login-id')}
                  onBlur={() => setFocusedInput(null)}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={primaryBtnStyle('linear-gradient(135deg, rgba(0,245,255,0.85), rgba(255,0,255,0.85))', loading)}
              >
                {loading ? '⏳ Authenticating...' : '⚡ Login'}
              </button>
            </form>
          )}

          {/* SIGNUP FORM */}
          {tab === 'signup' && (
            <form onSubmit={handleSignup} noValidate>
              <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input
                    style={getInputStyle('s-name')}
                    placeholder="John Doe"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    onFocus={() => setFocusedInput('s-name')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Roll Number *</label>
                  <input
                    style={getInputStyle('s-roll')}
                    placeholder="CS2023001"
                    value={signupRoll}
                    onChange={(e) => setSignupRoll(e.target.value)}
                    onFocus={() => setFocusedInput('s-roll')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone *</label>
                  <input
                    style={getInputStyle('s-phone')}
                    placeholder="9876543210"
                    value={signupPhone}
                    onChange={(e) => setSignupPhone(e.target.value)}
                    onFocus={() => setFocusedInput('s-phone')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Department (optional)</label>
                  <input
                    style={getInputStyle('s-dept')}
                    placeholder="Computer Science"
                    value={signupDept}
                    onChange={(e) => setSignupDept(e.target.value)}
                    onFocus={() => setFocusedInput('s-dept')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={primaryBtnStyle('linear-gradient(135deg, rgba(0,255,136,0.85), rgba(0,245,255,0.85))', loading)}
                >
                  {loading ? '⏳ Creating Account...' : '✨ Create Account'}
                </button>
              </div>
            </form>
          )}

          {/* Recent Students */}
          {recentStudents.length > 0 && (
            <div style={{ marginTop: '32px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px',
              }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                <p style={{
                  color: 'rgba(255,255,255,0.35)',
                  fontSize: '0.72rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  margin: 0,
                  fontFamily: "'Orbitron', sans-serif",
                  whiteSpace: 'nowrap',
                }}>
                  Recent Students
                </p>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {recentStudents.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setTab('login');
                      setLoginIdentifier(s.roll_number ?? s.phone ?? '');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 14px',
                      borderRadius: '50px',
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      color: 'rgba(255,255,255,0.65)',
                      fontSize: '0.88rem',
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 600,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(0,245,255,0.5)';
                      e.currentTarget.style.background = 'rgba(0,245,255,0.07)';
                      e.currentTarget.style.color = '#00f5ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
                    }}
                  >
                    <span style={{
                      width: '24px', height: '24px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', fontWeight: 700, color: '#0a0a1a',
                      flexShrink: 0,
                    }}>
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default LoginForm;

