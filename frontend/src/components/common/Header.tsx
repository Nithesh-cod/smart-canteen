import React from 'react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  rightContent?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ title, subtitle, rightContent }) => {
  const headerStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    height: '70px',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 40px',
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  };

  const leftStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '2px',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: "'Orbitron', monospace",
    fontWeight: 700,
    fontSize: '1.2rem',
    lineHeight: 1.2,
    background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    letterSpacing: '0.05em',
    margin: 0,
  };

  const subtitleStyle: React.CSSProperties = {
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    lineHeight: 1,
  };

  const rightStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  };

  return (
    <header style={headerStyle}>
      <div style={leftStyle}>
        <h1 style={titleStyle}>{title}</h1>
        {subtitle && <span style={subtitleStyle}>{subtitle}</span>}
      </div>
      {rightContent && <div style={rightStyle}>{rightContent}</div>}
    </header>
  );
};

export default Header;
