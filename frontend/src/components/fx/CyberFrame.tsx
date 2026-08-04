import React from 'react';

/**
 * CyberFrame — animated HUD corner brackets that wrap any block.
 *
 * Renders four SVG corner pieces overlaid on the wrapped children. The
 * brackets pulse on hover (parent-driven via the `active` prop) so cards,
 * panels and modals can adopt a unified sci-fi frame without each one
 * re-implementing the path geometry.
 *
 * Pure SVG + CSS keyframes — no JS frame loop, safe to use on every card.
 */
interface CyberFrameProps {
  children: React.ReactNode;
  /** When true the brackets glow brighter and scale up slightly. */
  active?: boolean;
  /** Bracket colour — defaults to the cyber-green primary. */
  color?: string;
  /** Bracket size in px. 18-24 reads best at card scale. */
  size?: number;
  /** Render with `position: relative` on the wrapper. */
  className?: string;
  style?: React.CSSProperties;
}

const Bracket: React.FC<{
  pos: 'tl' | 'tr' | 'bl' | 'br';
  color: string;
  size: number;
  active: boolean;
}> = ({ pos, color, size, active }) => {
  // Each bracket is a 24×24 viewBox L-shape; rotate via transform.
  const rot = { tl: 0, tr: 90, br: 180, bl: 270 }[pos];
  const offset = { tl: { top: -1, left: -1 }, tr: { top: -1, right: -1 }, br: { bottom: -1, right: -1 }, bl: { bottom: -1, left: -1 } }[pos];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        transform: `rotate(${rot}deg) scale(${active ? 1.12 : 1})`,
        transformOrigin: 'center',
        transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), filter 0.25s',
        filter: active
          ? `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color}88)`
          : `drop-shadow(0 0 2px ${color}88)`,
        ...offset,
      }}
    >
      <path
        d="M 1 8 L 1 1 L 8 1"
        stroke={color}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="1" cy="1" r="1.5" fill={color} />
    </svg>
  );
};

export const CyberFrame: React.FC<CyberFrameProps> = ({
  children,
  active = false,
  color = '#ff5a5f',
  size = 20,
  className,
  style,
}) => {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        ...style,
      }}
    >
      {children}
      <Bracket pos="tl" color={color} size={size} active={active} />
      <Bracket pos="tr" color={color} size={size} active={active} />
      <Bracket pos="bl" color={color} size={size} active={active} />
      <Bracket pos="br" color={color} size={size} active={active} />
    </div>
  );
};

export default CyberFrame;
