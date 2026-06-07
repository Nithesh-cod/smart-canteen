import React, { useEffect, useRef } from 'react';

/**
 * ParticleField — Canvas 2D field of slow-drifting green motes.
 *
 * Pure 2D Canvas (no WebGL) so it composes safely on top of the WebGL Orb
 * without thrashing GPU memory. Capped at ~60 particles total, density-aware
 * resize handler, frame-skip when the page is hidden, and a one-line
 * `requestAnimationFrame` cleanup — fine to mount full-screen behind the
 * Student Kiosk without measurable scroll jank.
 *
 * Particles drift upward with a gentle horizontal sway. They fade in at the
 * bottom and fade out at the top so there are no hard edges.
 */
interface ParticleFieldProps {
  /** Hex colour for the motes — defaults to cyber-green. */
  color?: string;
  /** 0-1; scales particle count and base alpha. */
  intensity?: number;
  /** When false, skips the rAF loop entirely (e.g. for reduced-motion users). */
  enabled?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Phase offset for the sway sine wave. */
  phase: number;
  /** Base alpha 0.15-0.85. */
  alpha: number;
}

const PARTICLE_BASE_COUNT = 50;

export const ParticleField: React.FC<ParticleFieldProps> = ({
  color = '#00ff88',
  intensity = 0.7,
  enabled = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) return;

    // Respect prefers-reduced-motion — no particles for users who opted out.
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let particles: Particle[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width  = window.innerWidth  + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);

      // Density scales with viewport area so phones don't get over-particled.
      const target = Math.round(
        PARTICLE_BASE_COUNT * intensity *
        Math.min(1, (window.innerWidth * window.innerHeight) / (1920 * 1080))
      );
      if (particles.length !== target) {
        particles = Array.from({ length: target }, () => spawn());
      }
    };

    const spawn = (): Particle => ({
      x: Math.random() * window.innerWidth,
      y: window.innerHeight + Math.random() * 100,
      vx: 0,
      vy: -0.25 - Math.random() * 0.55,
      r: 0.6 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.15 + Math.random() * 0.7,
    });

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const time = t * 0.001;
      for (const p of particles) {
        // Horizontal sway driven by sine + per-particle phase offset.
        p.x += Math.sin(time + p.phase) * 0.12;
        p.y += p.vy;

        // Edge fade — alpha tapers to 0 within 80px of top/bottom so there
        // are no hard cuts when a particle dies/respawns.
        let edgeFade = 1;
        if (p.y < 80)                     edgeFade = p.y / 80;
        if (p.y > window.innerHeight - 80) edgeFade = (window.innerHeight - p.y) / 80;
        edgeFade = Math.max(0, Math.min(1, edgeFade));

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = p.alpha * edgeFade * intensity;
        ctx.shadowColor = color;
        ctx.shadowBlur  = p.r * 4;
        ctx.fill();

        // Respawn at bottom when it floats past the top.
        if (p.y < -20) Object.assign(p, spawn(), { y: window.innerHeight + 10 });
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
    };

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [color, intensity, enabled]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1, // above Orb (0), below content (2+)
      }}
    />
  );
};

export default ParticleField;
