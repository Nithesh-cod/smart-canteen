import React, { useEffect, useRef } from 'react';

/**
 * GridFloor — calm Tron-style perspective grid background.
 *
 * Replaces the Orb shader for the kiosk background. Three layered effects:
 *
 * 1. PERSPECTIVE GRID: pure CSS, two repeating-linear-gradients on a tilted
 *    plane (perspective(800px) rotateX(60deg)). Rises slowly via translate3d
 *    keyframes so it feels like an infinite floor receding to the horizon.
 *    Zero JS, GPU-composited, never reflows.
 *
 * 2. AMBIENT GLOW: a soft radial gradient that follows the cursor with
 *    ~180ms lag (lerped via rAF). Reads as "the room knows where you are"
 *    without ever entering chaotic territory. Capped at ~40% opacity.
 *
 * 3. HORIZON LINE: a single 1px gradient strip at the vanishing point, with
 *    a slow horizontal sheen sweep, anchors the perspective and stops the
 *    grid from feeling weightless.
 *
 * Total cost: 1 rAF loop tracking a single mouse target, no canvas, no
 * WebGL, no per-frame DOM writes beyond `style.transform`. Comfortable on
 * a 5-year-old laptop.
 */
interface GridFloorProps {
  /** Grid colour — defaults to cyber-green. */
  color?: string;
  /** Grid line opacity 0-1. */
  intensity?: number;
}

export const GridFloor: React.FC<GridFloorProps> = ({
  color = '#ff5a5f',
  intensity = 0.18,
}) => {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;

    // Skip the cursor-following glow for reduced-motion users; the static
    // gradient + grid is still enough to feel polished.
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let raf = 0;
    let tx = window.innerWidth  / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      cx += (tx - cx) * 0.05;
      cy += (ty - cy) * 0.05;
      el.style.background = `radial-gradient(
        circle at ${cx}px ${cy}px,
        ${color}26 0%,
        ${color}10 12%,
        transparent 35%
      )`;
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, [color]);

  return (
    <>
      <style>{`
        @keyframes grid-rise {
          0%   { transform: perspective(800px) rotateX(60deg) translate3d(0, 0,    0); }
          100% { transform: perspective(800px) rotateX(60deg) translate3d(0, 80px, 0); }
        }
        @keyframes horizon-sweep {
          0%, 100% { background-position: -100% 0; }
          50%      { background-position: 200% 0; }
        }

        .gf-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          background:
            radial-gradient(ellipse at top, #1b0e0c 0%, #140a09 60%, #020504 100%);
        }

        .gf-grid-wrap {
          position: absolute;
          left: -50%; right: -50%;
          bottom: 0; height: 70%;
          transform-origin: center bottom;
          opacity: var(--gf-intensity);
        }
        .gf-grid {
          width: 100%;
          height: 100%;
          background-image:
            linear-gradient(var(--gf-color) 1px, transparent 1px),
            linear-gradient(90deg, var(--gf-color) 1px, transparent 1px);
          background-size: 80px 80px;
          transform-origin: center bottom;
          animation: grid-rise 4s linear infinite;
          mask-image: linear-gradient(180deg, transparent 0%, black 35%, black 80%, transparent 100%);
          -webkit-mask-image: linear-gradient(180deg, transparent 0%, black 35%, black 80%, transparent 100%);
        }

        .gf-horizon {
          position: absolute;
          left: 0; right: 0;
          top: 30%;
          height: 1px;
          background: linear-gradient(90deg,
            transparent 0%,
            var(--gf-color) 20%,
            var(--gf-color) 80%,
            transparent 100%);
          background-size: 200% 100%;
          animation: horizon-sweep 12s ease-in-out infinite;
          box-shadow: 0 0 24px var(--gf-color), 0 0 60px var(--gf-color);
          opacity: 0.45;
        }

        .gf-vignette {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%);
          pointer-events: none;
        }
      `}</style>
      <div
        className="gf-bg"
        style={
          {
            ['--gf-color' as any]: color,
            ['--gf-intensity' as any]: intensity,
          } as React.CSSProperties
        }
      >
        {/* Cursor-following glow (sits underneath the grid) */}
        <div
          ref={glowRef}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            mixBlendMode: 'screen',
            transition: 'background 0.3s linear',
          }}
        />

        {/* Tilted grid floor */}
        <div className="gf-grid-wrap">
          <div className="gf-grid" />
        </div>

        {/* Horizon line at the vanishing point */}
        <div className="gf-horizon" />

        {/* Vignette to keep content area calm */}
        <div className="gf-vignette" />
      </div>
    </>
  );
};

export default GridFloor;
