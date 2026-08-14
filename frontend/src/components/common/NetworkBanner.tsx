import React, { useEffect, useRef, useState } from 'react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

// ============================================================================
// NETWORK BANNER
// ============================================================================
// A persistent strip for connection trouble, rather than a toast.
//
// Toasts are wrong for this: they auto-dismiss, and a shopper who looks up ten
// seconds later has no idea why nothing works. Connection state is a CONDITION,
// not an event, so it stays on screen for exactly as long as it is true.
//
// It also announces recovery. Without that, someone who saw "offline" has no
// signal that it is safe to try again and just keeps waiting.
// ============================================================================

interface NetworkBannerProps {
  /**
   * Render in normal document flow instead of pinned over the page.
   *
   * Overlaying is right on the website, where it floats above a full-height
   * layout. In the app shell the banner shares the top edge with the tab bar,
   * and two fixed elements at top:0 simply cover each other — so the shell
   * places it in flow and lets the browser stack them.
   */
  inline?: boolean;
}

export const NetworkBanner: React.FC<NetworkBannerProps> = ({ inline = false }) => {
  const { online, slow, latency, recheck } = useNetworkStatus();
  const [showBack, setShowBack] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setShowBack(false);
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setShowBack(true);
      const t = setTimeout(() => setShowBack(false), 4000);
      return () => clearTimeout(t);
    }
  }, [online]);

  if (!online) {
    return (
      <div className={`lg-banner offline ${inline ? "inline" : ""}`} role="status" aria-live="assertive">
        <span className="lg-dot" />
        <span>No connection — your cart is saved. We'll reconnect automatically.</span>
        <button
          className="lg-btn ghost"
          style={{ padding: '4px 12px', fontSize: '0.62rem', marginLeft: 6 }}
          onClick={recheck}
          type="button"
        >
          Check now
        </button>
      </div>
    );
  }

  if (slow) {
    return (
      <div className={`lg-banner slow ${inline ? "inline" : ""}`} role="status" aria-live="polite">
        <span className="lg-dot" />
        <span>
          Slow connection{latency ? ` (${(latency / 1000).toFixed(1)}s)` : ''} — things may take a moment.
        </span>
      </div>
    );
  }

  if (showBack) {
    return (
      <div className={`lg-banner back ${inline ? "inline" : ""}`} role="status" aria-live="polite">
        <span aria-hidden="true">✓</span>
        <span>Back online</span>
      </div>
    );
  }

  return null;
};

export default NetworkBanner;
