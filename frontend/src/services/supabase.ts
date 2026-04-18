// ============================================================================
// SUPABASE REALTIME SERVICE
// ============================================================================
// Subscribes to Postgres row-level changes via Supabase Realtime.
// Works alongside Socket.IO — Supabase Realtime fires even when a different
// backend instance made the DB change.
//
// ⚠️  IMPORTANT — one-time setup in Supabase SQL Editor:
//   alter publication supabase_realtime add table orders, menu_items, students;
// Without this, subscriptions will TIMED_OUT and no live events will arrive.
// ============================================================================

import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string;
const SUPABASE_ANON = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
) as string;

const REALTIME_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON &&
  !SUPABASE_URL.includes('placeholder'));

if (!REALTIME_ENABLED) {
  console.warn(
    '⚠️  Supabase Realtime disabled — VITE_SUPABASE_URL or key not set.\n' +
    '   Socket.IO updates still work for real-time changes.'
  );
}

export const supabase = createClient(
  SUPABASE_URL  || 'https://placeholder.supabase.co',
  SUPABASE_ANON || 'placeholder',
  {
    realtime: { params: { eventsPerSecond: 20 } },
    auth: { persistSession: false },
  }
);

// ─── Subscription helpers ─────────────────────────────────────────────────────

type ChangeCallback = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}) => void;

// Track retry state per channel to avoid log spam
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Subscribe to all row changes on a table.
 * Auto-retries with 5-second delay on TIMED_OUT (tables not in publication yet)
 * or CHANNEL_ERROR (network glitch).
 *
 * If you see TIMED_OUT in the console, run this once in Supabase SQL Editor:
 *   alter publication supabase_realtime add table orders, menu_items, students;
 */
export const subscribeToTable = (
  table: string,
  onChange: ChangeCallback,
  channelName?: string
): RealtimeChannel => {
  const name = channelName ?? `realtime:${table}`;

  // When Supabase is not configured, return an unsubscribed channel so callers
  // always get a RealtimeChannel back but NO WebSocket connection is attempted.
  if (!REALTIME_ENABLED) {
    return supabase.channel(`noop:${name}`);
  }

  const channel = supabase
    .channel(name)
    .on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table },
      (payload: any) => {
        onChange({
          eventType: payload.eventType,
          new: payload.new ?? {},
          old: payload.old ?? {},
        });
      }
    )
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        // Clear any pending retry
        const existing = retryTimers.get(name);
        if (existing) { clearTimeout(existing); retryTimers.delete(name); }
        console.log(`✅ Supabase Realtime: subscribed to "${table}"`);

      } else if (status === 'TIMED_OUT') {
        // Happens when the table isn't in the realtime publication yet.
        // Log the fix instruction once, then retry silently.
        if (!retryTimers.has(name)) {
          console.warn(
            `⚠️  Supabase Realtime: TIMED_OUT on "${table}"\n` +
            `   Fix: run this once in Supabase SQL Editor →\n` +
            `   alter publication supabase_realtime add table orders, menu_items, students;`
          );
        }
        scheduleRetry(table, onChange, name);

      } else if (status === 'CHANNEL_ERROR') {
        console.warn(`⚠️  Supabase Realtime: CHANNEL_ERROR on "${table}" — retrying…`);
        scheduleRetry(table, onChange, name);
      }
    });

  return channel;
};

/** Retry a failed subscription after a delay (5s → 15s → 30s → 60s cap). */
function scheduleRetry(
  table: string,
  onChange: ChangeCallback,
  channelName: string,
  attempt = 1
) {
  // Already scheduled
  if (retryTimers.has(channelName)) return;

  const delayMs = Math.min(5_000 * attempt, 60_000);
  const timer = setTimeout(() => {
    retryTimers.delete(channelName);
    // Remove old channel and re-subscribe
    supabase.removeChannel(supabase.channel(channelName));
    subscribeToTable(table, onChange, channelName);
  }, delayMs);
  retryTimers.set(channelName, timer);
}

/**
 * Remove a realtime channel (call in useEffect cleanup).
 */
export const unsubscribe = (channel: RealtimeChannel | null): void => {
  if (channel) {
    // Cancel any pending retry for this channel name
    const name = (channel as any).topic as string | undefined;
    if (name) {
      const t = retryTimers.get(name);
      if (t) { clearTimeout(t); retryTimers.delete(name); }
    }
    supabase.removeChannel(channel);
  }
};
