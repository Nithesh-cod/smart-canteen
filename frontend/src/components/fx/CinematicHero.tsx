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
        .hero-line-1 {
          font-family: 'Orbitron', sans-serif;
          font-weight: 900;
          font-size: clamp(2.4rem, 7vw, 5.4rem);
          line-height: 0.9;
          letter-spacing: 0.12em;
          background: linear-gradient(180deg, #ffffff 0%, #00ff88 60%, #00d166 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: hero-line-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
          text-shadow: 0 0 30px rgba(0,255,136,0.08);
        }
        .hero-line-2 {
          font-family: 'Orbitron', sans-serif;
          font-weight: 700;
          font-size: clamp(2.4rem, 7vw, 5.4rem);
          line-height: 0.9;
          letter-spacing: 0.18em;
          background: linear-gradient(180deg, #00ff88 0%, #00d166 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          opacity: 0.85;
          animation: hero-line-rise-2 1.1s cubic-bezier(0.16, 1, 0.3, 1) 0.18s both;
        }
        .hero-line-2::before {
          content: '';
          display: block;
          width: 110px;
          height: 1px;
          background: linear-gradient(90deg, #00ff88, transparent);
          margin-bottom: 14px;
          animation: scan-bar 3.5s ease-in-out infinite;
          transform-origin: left center;
        }
        .hero-tag {
          font-family: 'Rajdhani', sans-serif;
          font-size: clamp(0.7rem, 1.8vw, 0.88rem);
          letter-spacing: 0.45em;
          color: rgba(0,255,136,0.85);
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
          borderBottom: '1px solid rgba(0,255,136,0.08)',
          background:
            'linear-gradient(180deg, rgba(0,255,136,0.025) 0%, transparent 100%)',
          zIndex: 5,
        }}
      >
        {/* LEFT — stacked wordmark */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="hero-line-1">SMART</div>
          <div className="hero-line-2">CANTEEN</div>
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
              stroke="rgba(0,255,136,0.18)"
              strokeWidth="1.5"
              fill="none"
            />
            <circle
              cx="44" cy="44" r="36"
              stroke="#00ff88"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray="80"
              strokeLinecap="round"
              style={{ animation: 'ring-breathe 3.6s ease-in-out infinite' }}
              filter="drop-shadow(0 0 6px #00ff88)"
            />
            <circle
              cx="44" cy="8" r="3"
              fill="#00ff88"
              filter="drop-shadow(0 0 6px #00ff88)"
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
            <div style={{ fontSize: '0.92rem', color: '#00ff88', fontWeight: 700, textShadow: '0 0 8px #00ff88' }}>
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
