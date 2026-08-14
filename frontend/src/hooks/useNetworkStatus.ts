import { useEffect, useState, useCallback, useRef } from 'react';
import { API_URL } from '../utils/constants';

// ============================================================================
// NETWORK STATUS — offline + slow-connection detection
// ============================================================================
// Backs the offline and slow-network states.
//
// `navigator.onLine` alone is not enough and is the classic trap here: it
// reports whether a network INTERFACE exists, not whether anything is
// reachable. Campus wifi that has associated but not authenticated — the
// captive-portal case, which is exactly what a canteen kiosk sits on — reports
// `true` while every request fails. So we treat it as a fast negative signal
// only (offline is always really offline) and confirm "online" by actually
// reaching our own health endpoint.
// ============================================================================

// Derived from the RESOLVED API_URL, not the raw env var.
//
// The production web build sets VITE_API_URL="/api", so reading the env var
// directly produced the relative "/health". On the website that happens to work
// — Vercel serves the same origin. Inside the app it resolves against the
// WebView's own origin (https://localhost), where nothing is listening, so the
// probe failed forever and the app showed a permanent "No connection" banner
// while every other request was succeeding against Render.
//
// API_URL already knows the difference between web and native; using it means
// the probe follows the same origin as the traffic it is meant to be reporting on.
const HEALTH_URL = API_URL.replace(/\/api\/?$/, '') + '/health';

/** Above this, a connection is "slow" rather than merely busy. */
const SLOW_MS = 2500;
/** How often to re-probe while we believe we are offline. */
const RECHECK_MS = 5000;

export interface NetworkStatus {
  online: boolean;
  slow: boolean;
  /** Last measured round-trip to our own server, in ms. */
  latency: number | null;
  /** Force an immediate re-probe. */
  recheck: () => void;
}

export const useNetworkStatus = (): NetworkStatus => {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [slow, setSlow] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const inFlight = useRef(false);

  const probe = useCallback(async () => {
    // The browser is certain when it says offline; skip the round trip.
    if (!navigator.onLine) {
      setOnline(false);
      setSlow(false);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;

    const started = performance.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      // cache: 'no-store' — a cached 200 would make a dead network look healthy.
      await fetch(HEALTH_URL, { cache: 'no-store', signal: controller.signal });
      clearTimeout(timer);

      const took = performance.now() - started;
      setLatency(Math.round(took));
      setOnline(true);
      setSlow(took > SLOW_MS);
    } catch {
      // Reachability failure, not necessarily "no network" — but from the
      // shopper's point of view an unreachable canteen is the same thing.
      setOnline(false);
      setSlow(false);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    probe();

    const goOnline = () => { probe(); };
    const goOffline = () => { setOnline(false); setSlow(false); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Re-probe on a timer ONLY while we think we're down, so a healthy kiosk
    // isn't pinging the server forever in the background.
    const id = window.setInterval(() => { if (!navigator.onLine || !online) probe(); }, RECHECK_MS);

    // A tab restored from the background may have missed the online event.
    const onVisible = () => { if (document.visibilityState === 'visible') probe(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, [probe, online]);

  return { online, slow, latency, recheck: probe };
};
