import api, { CART_TOKEN_KEY } from './api';

// ============================================================================
// CART SERVICE — server-held stock
// ============================================================================
// The cart is no longer purely local. Every quantity change reserves (or
// returns) real stock on the server, which is what makes the counter PC, the
// web app and the Android app agree: what one shopper puts in a cart, the
// others immediately see as unavailable.
//
// Cart identity is a signed token minted by the server and kept in
// localStorage. It is never generated client-side — the server treats a cart
// id as a capability to release that cart's holds, so a guessable or
// self-chosen id would let anyone free other people's reservations.
// ============================================================================

export interface AvailabilityEntry {
  id: number;
  available: number; // -1 = unlimited
}

export interface HoldResult {
  ok: boolean;
  available: number;
  held: number;
  /** Server-supplied reason, suitable for showing to the shopper. */
  message?: string;
}

let sessionPromise: Promise<string | null> | null = null;

/**
 * Ensure this browser has a cart session, creating one on first use.
 *
 * Concurrent callers share one in-flight request: a kiosk that renders the
 * menu and immediately adds an item would otherwise mint two carts and hold
 * stock under the one it then throws away, leaking it until the TTL expired.
 */
export const ensureSession = async (): Promise<string | null> => {
  const existing = localStorage.getItem(CART_TOKEN_KEY);
  if (existing) return existing;
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    try {
      const res = await api.post('/cart/session');
      const token: string | null = res.data?.data?.cart_token ?? null;
      // A signed-in student gets no token — their cart id comes from their JWT,
      // which is what lets one cart follow them from the kiosk to their phone.
      if (token) localStorage.setItem(CART_TOKEN_KEY, token);
      return token;
    } catch {
      return null; // offline: fall back to a local-only cart
    } finally {
      sessionPromise = null;
    }
  })();

  return sessionPromise;
};

/** Drop the local cart token (sign-out / cart handed to a new customer). */
export const forgetSession = (): void => {
  localStorage.removeItem(CART_TOKEN_KEY);
};

/**
 * Set the quantity this cart holds of one item. A SET, not a delta — retries
 * over a flaky connection can't double-hold. Sending 0 releases the item.
 */
export const setItem = async (
  menuItemId: number,
  quantity: number,
): Promise<HoldResult> => {
  await ensureSession();
  try {
    const res = await api.put('/cart/items', {
      menu_item_id: menuItemId,
      quantity,
    });
    return {
      ok: true,
      available: res.data?.data?.available ?? -1,
      held: res.data?.data?.held ?? quantity,
    };
  } catch (err) {
    const response = (err as { response?: { status?: number; data?: any } }).response;
    // 409 = someone else took it first. This is an expected outcome during a
    // lunch rush, not an error condition — the caller rolls the row back.
    if (response?.status === 409) {
      return {
        ok: false,
        available: response.data?.data?.available ?? 0,
        held: 0,
        message: response.data?.message,
      };
    }
    throw err;
  }
};

/** Release every hold this cart owns. */
export const clear = async (): Promise<void> => {
  try {
    await api.delete('/cart');
  } catch {
    // Best-effort: the server's TTL sweeper returns abandoned holds anyway,
    // so a failure here costs at most one hold window, never permanent stock.
  }
};

/** Live availability for the whole menu (on-hand minus everyone's holds). */
export const getAvailability = async (): Promise<AvailabilityEntry[]> => {
  const res = await api.get('/cart/availability');
  return res.data?.data?.items ?? [];
};
