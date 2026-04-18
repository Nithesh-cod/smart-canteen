import React from 'react';
import type { Student, Tier } from '../../types';

interface ProfileBarProps {
  student: Student;
  onSwitch: () => void;
  onLogout: () => void;
}

const tierConfig: Record<string, { color: string; bg: string; emoji: string; label: string }> = {
  bronze: {
    color: '#cd7f32',
    bg: 'rgba(205,127,50,0.15)',
    emoji: '🥉',
    label: 'Bronze',
  },
  silver: {
    color: '#c0c0c0',
    bg: 'rgba(192,192,192,0.15)',
    emoji: '🥈',
    label: 'Silver',
  },
  gold: {
    color: '#ffd700',
    bg: 'rgba(255,215,0,0.15)',
    emoji: '🥇',
    label: 'Gold',
  },
  platinum: {
    color: '#e5e4e2',
    bg: 'rgba(229,228,226,0.12)',
    emoji: '💎',
    label: 'Platinum',
  },
};

const pulseCss = `
@keyframes points-pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(0,245,255,0.3); }
  50% { box-shadow: 0 0 20px rgba(0,245,255,0.6), 0 0 35px rgba(0,245,255,0.2); }
}
@keyframes avatar-glow {
  0%, 100% { box-shadow: 0 0 12px rgba(0,245,255,0.4); }
  50% { box-shadow: 0 0 22px rgba(255,0,255,0.5); }
}
`;

export const ProfileBar: React.FC<ProfileBarProps> = ({ student, onSwitch, onLogout }) => {
  const tierKey = (student.tier as string | undefined)?.toLowerCase() ?? 'bronze';
  const tier = tierConfig[tierKey] ?? tierConfig.bronze;
  const initials = student.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  const tierBadgeStyle: React.CSSProperties =
    tierKey === 'platinum'
      ? {
          background: 'linear-gradient(135deg, rgba(229,228,226,0.25), rgba(180,180,180,0.15))',
          border: '1px solid rgba(229,228,226,0.5)',
          color: '#e5e4e2',
        }
      : {
          background: tier.bg,
          border: `1px solid ${tier.color}55`,
          color: tier.color,
        };

  const btnBase: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.65)',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontFamily: "'Orbitron', sans-serif",
    fontWeight: 600,
    letterSpacing: '0.06em',
    transition: 'all 0.2s',
    textTransform: 'uppercase',
  } as React.CSSProperties;

  return (
    <>
      <style>{pulseCss}</style>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '16px 24px',
        marginBottom: '24px',
      }}>

        {/* Left: Avatar + Name + Tier */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '52px', height: '52px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', fontWeight: 800, color: '#0a0a1a',
            fontFamily: "'Orbitron', sans-serif",
            flexShrink: 0,
            animation: 'avatar-glow 3s ease-in-out infinite',
          }}>
            {initials}
          </div>

          <div>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '1rem',
              fontWeight: 700,
              color: '#fff',
              letterSpacing: '0.05em',
              marginBottom: '5px',
            }}>
              {student.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                ...tierBadgeStyle,
                padding: '3px 10px',
                borderRadius: '50px',
                fontSize: '0.72rem',
                fontFamily: "'Orbitron', sans-serif",
                fontWeight: 700,
                letterSpacing: '0.08em',
              }}>
                {tier.emoji} {tier.label}
              </span>
              {student.roll_number && (
                <span style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: '0.78rem',
                  fontFamily: "'Rajdhani', sans-serif",
                }}>
                  {student.roll_number}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Middle: Points */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(0,245,255,0.06)',
          border: '1px solid rgba(0,245,255,0.25)',
          borderRadius: '12px',
          padding: '10px 20px',
          animation: 'points-pulse 2.5s ease-in-out infinite',
        }}>
          <span style={{ fontSize: '1.3rem' }}>💎</span>
          <div>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '1.3rem',
              fontWeight: 800,
              color: '#00f5ff',
              lineHeight: 1,
            }}>
              {(student.points ?? 0).toLocaleString()}
            </div>
            <div style={{
              color: 'rgba(0,245,255,0.6)',
              fontSize: '0.68rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontFamily: "'Orbitron', sans-serif",
            }}>
              Points
            </div>
          </div>
        </div>

        {/* Right: Buttons */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            style={btnBase}
            onClick={onSwitch}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,237,78,0.5)';
              e.currentTarget.style.color = '#ffed4e';
              e.currentTarget.style.background = 'rgba(255,237,78,0.07)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            }}
          >
            🔄 Switch
          </button>
          <button
            style={btnBase}
            onClick={onLogout}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,51,102,0.5)';
              e.currentTarget.style.color = '#ff3366';
              e.currentTarget.style.background = 'rgba(255,51,102,0.07)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            }}
          >
            🚪 Logout
          </button>
        </div>
      </div>
    </>
  );
};

export default ProfileBar;

