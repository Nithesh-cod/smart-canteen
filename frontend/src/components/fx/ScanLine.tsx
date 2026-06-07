import React from 'react';

/**
 * ScanLine — fixed full-screen CRT effect.
 *
 * Two overlays composed:
 *   1. A faint horizontal scan-line pattern (1px green stripe every 4px) —
 *      pure CSS gradient, zero JS, zero compositor work.
 *   2. A bright moving bar that sweeps top→bottom every ~8s via CSS @keyframes.
 *
 * Both layers use `pointer-events: none` so they never block clicks. The
 * effect is deliberately subtle — about 4% opacity — so it reads as
 * atmosphere instead of fighting the menu cards for attention.
 */
interface ScanLineProps {
  /** Scan-line tint. */
  color?: string;
  /** Sweep period in seconds. */
  period?: number;
  /** Stripe opacity 0-1. */
  intensity?: number;
}

export const ScanLine: React.FC<ScanLineProps> = ({
  color = '#00ff88',
  period = 8,
  intensity = 0.04,
}) => {
  return (
    <>
      <style>{`
        @keyframes scanSweep {
          0%   { transform: translateY(-100vh); opacity: 0; }
          5%   { opacity: 0.5; }
          50%  { opacity: 0.5; }
          95%  { opacity: 0.5; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>

      {/* Static horizontal stripe pattern */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9998,
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 3px,
            ${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')} 3px,
            ${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')} 4px
          )`,
          mixBlendMode: 'screen',
        }}
      />

      {/* Sweeping bar */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100vw',
          height: '120px',
          pointerEvents: 'none',
          zIndex: 9999,
          background: `linear-gradient(
            180deg,
            transparent 0%,
            ${color}11 30%,
            ${color}33 50%,
            ${color}11 70%,
            transparent 100%
          )`,
          animation: `scanSweep ${period}s linear infinite`,
          mixBlendMode: 'screen',
        }}
      />
    </>
  );
};

export default ScanLine;
