import React from 'react';

interface LoaderProps {
  variant?: 'spinner' | 'fullscreen' | 'inline';
  size?: number;
  message?: string;
  color?: string;
}

const Loader: React.FC<LoaderProps> = ({
  variant = 'spinner',
  size = 40,
  message,
  color = '#00f5ff',
}) => {
  // ── Shared spinner element ─────────────────────────────────────────────────
  const spinnerStyle = (diameter: number): React.CSSProperties => ({
    width: `${diameter}px`,
    height: `${diameter}px`,
    borderRadius: '50%',
    border: `${Math.max(2, Math.round(diameter / 12))}px solid rgba(0,245,255,0.2)`,
    borderTop: `${Math.max(2, Math.round(diameter / 12))}px solid ${color}`,
    animation: 'spin 1s linear infinite',
    flexShrink: 0,
  });

  // ── inline ─────────────────────────────────────────────────────────────────
  if (variant === 'inline') {
    return (
      <>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <span
          style={{
            display: 'inline-block',
            verticalAlign: 'middle',
            ...spinnerStyle(20),
          }}
          role="status"
          aria-label="Loading"
        />
      </>
    );
  }

  // ── fullscreen ─────────────────────────────────────────────────────────────
  if (variant === 'fullscreen') {
    const overlayStyle: React.CSSProperties = {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.9)',
      zIndex: 9998,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '20px',
    };

    const messageStyle: React.CSSProperties = {
      fontFamily: "'Rajdhani', sans-serif",
      fontSize: '1rem',
      fontWeight: 600,
      color: 'rgba(255,255,255,0.7)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginTop: '8px',
    };

    return (
      <>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <div style={overlayStyle} role="status" aria-label={message ?? 'Loading'}>
          <div style={spinnerStyle(size)} />
          {message && <p style={messageStyle}>{message}</p>}
        </div>
      </>
    );
  }

  // ── spinner (default) ──────────────────────────────────────────────────────
  const wrapStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
  };

  const messageStyle: React.CSSProperties = {
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={wrapStyle} role="status" aria-label={message ?? 'Loading'}>
        <div style={spinnerStyle(size)} />
        {message && <p style={messageStyle}>{message}</p>}
      </div>
    </>
  );
};

export default Loader;
