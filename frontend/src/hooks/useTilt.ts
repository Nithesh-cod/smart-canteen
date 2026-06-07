import { useRef, useEffect } from 'react';

/**
 * useTilt — 3D parallax tilt for any element.
 *
 * Listens to mousemove on the element's bounding box and applies a CSS
 * transform that rotates it on X and Y axes based on the cursor's offset
 * from centre. Releases smoothly on mouseleave.
 *
 * Pure refs, no React state — keeps re-renders to zero, so cards can be
 * tilted in dense grids without ruining scroll performance.
 *
 * @param max  Max rotation in degrees on each axis. 8-14 reads as "depth"
 *             without crossing into nausea territory.
 * @param scale  Scale-up on hover. 1.0 = no scale, 1.03 = slight lift.
 */
export function useTilt<T extends HTMLElement>(max = 10, scale = 1.02) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced-motion users — they get no tilt, just a hover scale.
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let targetRX = 0, targetRY = 0, targetS = 1;
    let curRX = 0, curRY = 0, curS = 1;

    const apply = () => {
      // Lerp toward target so release is smooth, not snappy.
      curRX += (targetRX - curRX) * 0.18;
      curRY += (targetRY - curRY) * 0.18;
      curS  += (targetS  - curS ) * 0.18;
      el.style.transform =
        `perspective(900px) rotateX(${curRX}deg) rotateY(${curRY}deg) scale(${curS})`;

      if (
        Math.abs(targetRX - curRX) > 0.01 ||
        Math.abs(targetRY - curRY) > 0.01 ||
        Math.abs(targetS  - curS ) > 0.001
      ) {
        rafId = requestAnimationFrame(apply);
      }
    };

    const onMove = (e: MouseEvent) => {
      if (prefersReduced) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      // dx, dy in [-1, 1] where (0,0) = card centre.
      const dx = (e.clientX - cx) / (rect.width  / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      targetRY =  dx * max;          // mouse right → rotate Y positive
      targetRX = -dy * max;          // mouse down  → rotate X negative
      targetS  = scale;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      targetRX = 0;
      targetRY = 0;
      targetS  = 1;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(apply);
    };

    el.style.transformStyle = 'preserve-3d';
    el.style.willChange = 'transform';
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      el.style.transform = '';
      el.style.willChange = '';
    };
  }, [max, scale]);

  return ref;
}

/**
 * useMagnetic — magnetic pull toward the cursor inside the element.
 *
 * Tracks cursor position relative to the element's centre and translates
 * the element a fraction of that offset, so it appears to "lean" toward
 * the cursor. Releases smoothly on mouseleave.
 *
 * Great on primary CTAs — adds a subtle organic-feeling response that
 * makes the button feel alive without anything visibly happening unless
 * the cursor is already near it.
 *
 * @param strength  Fraction of the cursor offset to translate. 0.25 = lean
 *                  by 1/4 of the distance from centre. 0.4 starts to look
 *                  cartoonish.
 */
export function useMagnetic<T extends HTMLElement>(strength = 0.25) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let rafId = 0;
    let targetX = 0, targetY = 0;
    let curX = 0, curY = 0;

    const apply = () => {
      curX += (targetX - curX) * 0.22;
      curY += (targetY - curY) * 0.22;
      el.style.transform = `translate(${curX}px, ${curY}px)`;
      if (Math.abs(targetX - curX) > 0.1 || Math.abs(targetY - curY) > 0.1) {
        rafId = requestAnimationFrame(apply);
      }
    };

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      targetX = (e.clientX - cx) * strength;
      targetY = (e.clientY - cy) * strength;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(apply);
    };

    el.style.willChange = 'transform';
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      el.style.transform = '';
      el.style.willChange = '';
    };
  }, [strength]);

  return ref;
}
