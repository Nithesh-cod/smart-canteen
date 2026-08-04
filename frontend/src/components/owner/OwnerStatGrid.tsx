import React, { useEffect, useRef, useState } from 'react';

/**
 * OwnerStatGrid — KPI tile grid with momentum-counted numbers and tiny
 * trend sparklines.
 *
 * Each tile is a notched-corner panel (same crystal language as the kiosk
 * menu cards) showing:
 *   - Glyph + label
 *   - Big animated number (counts up over 1.2s with eased momentum, not
 *     just a linear tick)
 *   - Sub-label (e.g. "vs yesterday")
 *   - A 7-point sparkline drawn inline as SVG
 *   - A small "delta chip" — +12% green or −4% amber
 *
 * Numbers update smoothly via rAF tween whenever the prop value changes, so
 * websocket-driven refreshes feel alive rather than stuttering.
 */

interface StatTile {
  label: string;
  glyph: string;
  value: number;
  prefix?: string;
  suffix?: string;
  /** Optional 7-point trend for the sparkline. */
  trend?: number[];
  /** Optional delta percentage e.g. +12 or -4. */
  delta?: number;
  /** Override tile colour — defaults to green primary. */
  tone?: 'green' | 'amber' | 'red';
}

interface OwnerStatGridProps {
  tiles: StatTile[];
}

const toneMap = {
  green: { color: '#ff5a5f', glow: 'rgba(255, 90, 95,0.35)' },
  amber: { color: '#ffed4e', glow: 'rgba(255,237,78,0.35)' },
  red:   { color: '#ff3366', glow: 'rgba(255,51,102,0.35)' },
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 88;
  const h = 28;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
      <polygon
        points={`0,${h} ${pts} ${w},${h}`}
        fill={`url(#spark-${color})`}
      />
    </svg>
  );
}

function useTween(target: number, duration = 1200) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    let raf = 0;
    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / duration);
      // ease-out cubic — feels weighty not robotic
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

function StatTileView({ tile }: { tile: StatTile }) {
  const tweened = useTween(tile.value);
  const { color, glow } = toneMap[tile.tone ?? 'green'];

  return (
    <div className="stat-tile">
      <div className="stat-tile-head">
        <span className="stat-tile-glyph" style={{ color, textShadow: `0 0 8px ${color}` }}>{tile.glyph}</span>
        <span className="stat-tile-label">{tile.label}</span>
      </div>
      <div className="stat-tile-body">
        <div className="stat-tile-value" style={{ color, textShadow: `0 0 24px ${glow}` }}>
          {tile.prefix ?? ''}
          {Math.round(tweened).toLocaleString('en-IN')}
          {tile.suffix ?? ''}
        </div>
        {tile.trend && tile.trend.length >= 2 && (
          <div className="stat-tile-spark">
            <Sparkline data={tile.trend} color={color} />
          </div>
        )}
      </div>
      {tile.delta !== undefined && (
        <div
          className="stat-tile-delta"
          style={{
            color: tile.delta >= 0 ? '#ff5a5f' : '#ff9f43',
            borderColor: tile.delta >= 0 ? 'rgba(255, 90, 95,0.3)' : 'rgba(255,159,67,0.4)',
            background: tile.delta >= 0 ? 'rgba(255, 90, 95,0.06)' : 'rgba(255,159,67,0.06)',
          }}
        >
          {tile.delta >= 0 ? '▲' : '▼'} {Math.abs(tile.delta).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

export const OwnerStatGrid: React.FC<OwnerStatGridProps> = ({ tiles }) => {
  return (
    <>
      <style>{`
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 18px;
          margin-bottom: 26px;
        }
        .stat-tile {
          position: relative;
          padding: 20px 22px 22px;
          background:
            linear-gradient(180deg, rgba(255, 90, 95,0.04) 0%, transparent 40%),
            linear-gradient(180deg, #0a1816 0%, #1b0e0c 100%);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          clip-path: polygon(
            0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%
          );
          overflow: hidden;
          transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
        }
        .stat-tile::before {
          content: '';
          position: absolute;
          top: 0; left: 6%; right: 24%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 90, 95,0.5), transparent);
        }
        .stat-tile:hover {
          border-color: rgba(255, 90, 95,0.3);
          transform: translateY(-2px);
          box-shadow: 0 14px 36px rgba(255, 90, 95,0.12);
        }
        .stat-tile-head {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 14px;
        }
        .stat-tile-glyph {
          font-family: 'Orbitron', monospace;
          font-size: 1rem;
        }
        .stat-tile-label {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.66rem;
          letter-spacing: 0.22em;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
        }
        .stat-tile-body {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
        }
        .stat-tile-value {
          font-family: 'Orbitron', monospace;
          font-size: 1.85rem;
          font-weight: 800;
          letter-spacing: 0.02em;
          line-height: 1;
        }
        .stat-tile-spark { opacity: 0.85; }
        .stat-tile-delta {
          position: absolute;
          top: 16px; right: 38px;
          font-family: 'Orbitron', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.12em;
          padding: 3px 8px;
          border-radius: 100px;
          border: 1px solid;
        }
      `}</style>

      <div className="stat-grid">
        {tiles.map((tile, i) => (
          <StatTileView key={i} tile={tile} />
        ))}
      </div>
    </>
  );
};

export default OwnerStatGrid;
