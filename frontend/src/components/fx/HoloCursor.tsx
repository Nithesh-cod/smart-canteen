import React, { useEffect, useRef, useState } from 'react';

/**
 * HoloCursor — custom HUD reticle that replaces the system cursor.
 *
 * Two layers:
 *   1. OUTER ring: lerped toward the cursor with ~85ms lag, so it trails
 *      smoothly. Grows + shifts colour when over a clickable element.
 *   2. INNER dot: locked exactly on the cursor coordinate for precision.
 *
 * Hover detection uses an event-delegated `closest('a, button, [data-clickable]')`
 * scan on mousemove — no per-element listeners. Cleans up on unmount.
 *
 * Hidden on touch devices (no pointer hover concept).
 */
export const HoloCursor: React.FC = () => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [hot, setHot] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    // No fine pointer → bail; system cursor still shows.
    const fine = window.matchMedia('(pointer: fine)').matches;
    if (!fine) { setSupported(false); return; }

    let raf = 0;
    const outer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const target = { x: outer.x, y: outer.y };

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (innerRef.current) {
        innerRef.current.style.transform =
          `translate(${e.clientX - 3}px, ${e.clientY - 3}px)`;
      }
      // Hot-element detection — anything clickable bumps the reticle into
      // its bigger highlighted state.
      const t = e.target as Element | null;
      const isHot = !!t?.closest?.(
        'a, button, input, select, textarea, [role="button"], [data-clickable]'
      );
      setHot(isHot);
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      outer.x += (target.x - outer.x) * 0.22;
      outer.y += (target.y - outer.y) * 0.22;
      const size = hot ? 46 : 28;
      if (outerRef.current) {
        outerRef.current.style.transform =
          `translate(${outer.x - size / 2}px, ${outer.y - size / 2}px)`;
        outerRef.current.style.width  = size + 'px';
        outerRef.current.style.height = size + 'px';
      }
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);

    // Hide system cursor only on the document body so OS-level chrome
    // (window resize handles, etc.) still uses its own pointer.
    document.body.style.cursor = 'none';

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
      document.body.style.cursor = '';
    };
  }, [hot]);

  if (!supported) return null;

  return (
    <>
      <style>{`
        .holo-outer {
          position: fixed;
          top: 0; left: 0;
          pointer-events: none;
          z-index: 100000;
          border: 1.5px solid #00ff88;
          border-radius: 50%;
          transition: width 0.15s, height 0.15s, border-color 0.15s, box-shadow 0.15s, background 0.15s;
          mix-blend-mode: difference;
          box-shadow: 0 0 8px rgba(0,255,136,0.5);
        }
        .holo-outer.hot {
          border-color: #ffed4e;
          box-shadow: 0 0 14px rgba(255,237,78,0.8), inset 0 0 8px rgba(255,237,78,0.25);
          background: rgba(255,237,78,0.08);
        }
        .holo-inner {
          position: fixed;
          top: 0; left: 0;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #00ff88;
          pointer-events: none;
          z-index: 100001;
          box-shadow: 0 0 6px #00ff88;
        }
        /* Hide on coarse pointers (touch devices) — defensive */
        @media (pointer: coarse) {
          .holo-outer, .holo-inner { display: none; }
        }
      `}</style>
      <div ref={outerRef} className={`holo-outer ${hot ? 'hot' : ''}`} />
      <div ref={innerRef} className="holo-inner" />
    </>
  );
};

export default HoloCursor;
