import React, { useEffect, useState } from 'react';

/**
 * CinematicHero — full-bleed hero with massive kinetic typography.
 *
 * Layout:
 *   - LEFT: huge stacked wordmark "SMART" / "CANTEEN" — letterforms tracked
 *     wide, with each line clipped against a different gradient so they read
 *     as two layers of the same crystal.
 *   - CENTRE: rotating tagline (cycles through a deck of 4 short phrases on
 *     a 3.5s cadence) + a thin live data bar (current time + items in
 *     orbit count).
 *   - RIGHT: animated status ring (SVG <circle> with stroke-dashoffset that
 *     breathes in/out continuously) — reads as "system online".
 *
 * Built to feel like the opening of a system rather than a navbar.
 */
interface CinematicHeroProps {
  itemsInOrbit: number;
}

const TAGLINES = [
  'CYBER FOOD ORDERING',
  'NEURO-CULINARY GATEWAY',
  'BIO-FUEL DISTRIBUTION',
  'GASTRO TRANSMISSION GRID',
];

export const CinematicHero: React.FC<CinematicHeroProps> = ({ itemsInOrbit }) => {
  const [tagIdx, setTagIdx] = useState(0);
  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const i = setInterval(() => setTagIdx(x => (x + 1) % TAGLINES.length), 3500);
    const c = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => { clearInterval(i); clearInterval(c); };
  }, []);

  return (
    <>
      <style>{`
        @keyframes hero-line-rise {
          from { transform: translateY(40px); opacity: 0; letter-spacing: 0.5em; }
          to   { transform: translateY(0);    opacity: 1; letter-spacing: 0.12em; }
        }
        @keyframes hero-line-rise-2 {
          from { transform: translateY(40px); opacity: 0; letter-spacing: 0.5em; }
          to   { transform: translateY(0);    opacity: 1; letter-spacing: 0.18em; }
        }
        @keyframes ring-breathe {
          0%, 100% { stroke-dashoffset: 60; }
          50%      { stroke-dashoffset: 20; }
        }
        @keyframes ring-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes tag-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes scan-bar {
          0%, 100% { transform: scaleX(0); }
          50%      { transform: scaleX(1); }
        }
        /* Single-line wordmark: "SMART CANTEEN" rendered on one row. The
           two halves are still styled differently — "SMART" white→green,
           "CANTEEN" lighter green→deep-green — so the wordmark reads as
           two layers in the same beat instead of two stacked lines.
           Font scales down on narrow viewports so it always fits on one
           row without wrapping; we also drop letter-spacing under 600px
           to win the extra real estate. */
        .hero-wordmark {
          display: flex;
          align-items: baseline;
          gap: 0.4em;
          font-family: 'Orbitron', sans-serif;
          font-weight: 900;
          font-size: clamp(1.6rem, 6vw, 4.4rem);
          line-height: 1;
          letter-spacing: 0.1em;
          white-space: nowrap;
          animation: hero-line-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
          text-shadow: 0 0 30px rgba(255, 90, 95,0.12);
        }
        .hero-word-smart {
          background: linear-gradient(180deg, #ffffff 0%, #ff5a5f 60%, #ff9e3d 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-word-canteen {
          font-weight: 700;
          background: linear-gradient(180deg, #ff5a5f 0%, #ff9e3d 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          opacity: 0.85;
          letter-spacing: 0.14em;
        }
        .hero-scan {
          width: 110px;
          height: 1px;
          background: linear-gradient(90deg, #ff5a5f, transparent);
          margin: 10px 0 14px;
          animation: scan-bar 3.5s ease-in-out infinite;
          transform-origin: left center;
        }
        @media (max-width: 600px) {
          .hero-wordmark { letter-spacing: 0.04em; gap: 0.3em; }
          .hero-word-canteen { letter-spacing: 0.06em; }
        }
        .hero-tag {
          font-family: 'Rajdhani', sans-serif;
          font-size: clamp(0.7rem, 1.8vw, 0.88rem);
          letter-spacing: 0.45em;
          color: rgba(255, 90, 95,0.85);
          text-transform: uppercase;
          font-weight: 500;
          animation: tag-in 0.5s ease both;
        }
        .hero-clock {
          font-family: 'Orbitron', monospace;
          font-size: clamp(0.7rem, 1.5vw, 0.82rem);
          letter-spacing: 0.2em;
          color: rgba(255,255,255,0.55);
        }
        .hero-orbit-pill {
          font-family: 'Orbitron', monospace;
          font-size: 0.74rem;
          letter-spacing: 0.16em;
          color: #ffed4e;
          background: rgba(255,237,78,0.06);
          border: 1px solid rgba(255,237,78,0.35);
          border-radius: 100px;
          padding: 4px 12px;
          text-transform: uppercase;
          text-shadow: 0 0 10px rgba(255,237,78,0.5);
        }
        @media (max-width: 720px) {
          .hero-right { display: none; }
          .hero-meta { gap: 10px !important; }
        }
      `}</style>

      <section
        style={{
          position: 'relative',
          padding: '34px 32px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          borderBottom: '1px solid rgba(255, 90, 95,0.08)',
          background:
            'linear-gradient(180deg, rgba(255, 90, 95,0.025) 0%, transparent 100%)',
          zIndex: 5,
        }}
      >
        {/* LEFT — single-line wordmark */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="hero-wordmark">
            <span className="hero-word-smart">SMART</span>
            <span className="hero-word-canteen">CANTEEN</span>
          </div>
          <div className="hero-scan" />
          <div
            className="hero-meta"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              marginTop: 14,
              flexWrap: 'wrap',
            }}
          >
            <div className="hero-tag" key={tagIdx}>
              {'●'} {TAGLINES[tagIdx]}
            </div>
            <div className="hero-clock">{clock}</div>
            {itemsInOrbit > 0 && (
              <div className="hero-orbit-pill">
                ◉ {itemsInOrbit} in orbit
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — status ring */}
        <div className="hero-right" style={{ position: 'relative', width: 88, height: 88 }}>
          <svg
            width="88"
            height="88"
            viewBox="0 0 88 88"
            style={{ animation: 'ring-spin 18s linear infinite' }}
          >
            <circle
              cx="44" cy="44" r="36"
              stroke="rgba(255, 90, 95,0.18)"
              strokeWidth="1.5"
              fill="none"
            />
            <circle
              cx="44" cy="44" r="36"
              stroke="#ff5a5f"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray="80"
              strokeLinecap="round"
              style={{ animation: 'ring-breathe 3.6s ease-in-out infinite' }}
              filter="drop-shadow(0 0 6px #ff5a5f)"
            />
            <circle
              cx="44" cy="8" r="3"
              fill="#ff5a5f"
              filter="drop-shadow(0 0 6px #ff5a5f)"
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Orbitron, monospace',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: '0.62rem', letterSpacing: 2, color: 'rgba(255,255,255,0.45)' }}>
              SYS
            </div>
            <div style={{ fontSize: '0.92rem', color: '#ff5a5f', fontWeight: 700, textShadow: '0 0 8px #ff5a5f' }}>
              ONLINE
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

function formatClock(d: Date) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `T-${h}:${m}:${s}`;
}

export default CinematicHero;
