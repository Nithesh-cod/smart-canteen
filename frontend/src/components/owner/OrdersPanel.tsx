import React, { useMemo, useState } from 'react';
import type { Order } from '../../types';

/**
 * OrdersPanel — modern orders table for the Owner dashboard.
 *
 * Replaces the previous OrdersTable that rendered black when the orders
 * array was empty. This version:
 *   - Filter chips by status (All / Pending / Preparing / Ready / Completed
 *     / Cancelled) with live counts.
 *   - Search field that matches order number, student name, or roll number.
 *   - Status pills with consistent colour language matching the menu.
 *   - Auto-formatted currency + relative timestamps.
 *   - Friendly empty state when nothing matches the filter.
 *   - Refresh button with spinner state.
 *
 * Pure layout — does not call APIs directly; consumes the `orders` prop and
 * a `onRefresh` callback from the dashboard parent.
 */

interface OrdersPanelProps {
  orders: Order[];
  onRefresh: () => void | Promise<void>;
}

const STATUS_TONES: Record<string, { bg: string; fg: string; border: string }> = {
  pending:   { bg: 'rgba(255,237,78,0.08)',  fg: '#ffed4e', border: 'rgba(255,237,78,0.4)' },
  preparing: { bg: 'rgba(255, 90, 95,0.08)',   fg: '#ff5a5f', border: 'rgba(255, 90, 95,0.4)' },
  ready:     { bg: 'rgba(255, 158, 61,0.12)',   fg: '#ff5a5f', border: 'rgba(255, 90, 95,0.6)' },
  completed: { bg: 'rgba(255,255,255,0.04)', fg: 'rgba(255,255,255,0.55)', border: 'rgba(255,255,255,0.18)' },
  cancelled: { bg: 'rgba(255,51,102,0.08)',  fg: '#ff3366', border: 'rgba(255,51,102,0.45)' },
  refunded:  { bg: 'rgba(255,159,67,0.08)',  fg: '#ff9f43', border: 'rgba(255,159,67,0.5)' },
};

const STATUS_FILTERS = ['all', 'pending', 'preparing', 'ready', 'completed', 'cancelled'] as const;

export const OrdersPanel: React.FC<OrdersPanelProps> = ({ orders, onRefresh }) => {
  const [filter, setFilter] = useState<typeof STATUS_FILTERS[number]>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Defensive — match the OwnerDashboard fetcher fix, so a legacy API shape
  // that arrives as the wrapper object never crashes the table.
  const safeOrders = Array.isArray(orders) ? orders : [];

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: safeOrders.length };
    for (const o of safeOrders) map[o.status] = (map[o.status] ?? 0) + 1;
    return map;
  }, [safeOrders]);

  const filtered = useMemo(() => {
    let arr = filter === 'all' ? safeOrders : safeOrders.filter(o => o.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(o =>
        String(o.order_number || '').toLowerCase().includes(q) ||
        String((o as any).student_name || '').toLowerCase().includes(q) ||
        String((o as any).student_roll || '').toLowerCase().includes(q)
      );
    }
    return [...arr].sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta;
    });
  }, [safeOrders, filter, search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  return (
    <div className="orders-panel">
      <style>{`
        .orders-panel {
          position: relative;
          padding: 24px 28px 28px;
          background:
            linear-gradient(180deg, rgba(255, 90, 95,0.04) 0%, transparent 40%),
            linear-gradient(180deg, #0a1816 0%, #1b0e0c 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 18px;
          clip-path: polygon(
            0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%
          );
        }
        .orders-panel::before {
          content: '';
          position: absolute;
          top: 0; left: 4%; right: 20%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 90, 95,0.4), transparent);
        }

        .orders-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 18px; flex-wrap: wrap; margin-bottom: 18px;
        }
        .orders-title-row {
          display: flex; align-items: center; gap: 12px;
        }
        .orders-glyph {
          font-family: 'Orbitron', monospace;
          font-size: 1.15rem; color: #ff5a5f;
          text-shadow: 0 0 10px #ff5a5f;
        }
        .orders-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.78rem;
          letter-spacing: 0.32em;
          color: rgba(255,255,255,0.6);
          text-transform: uppercase;
        }
        .orders-actions {
          display: flex; gap: 10px; align-items: center;
        }
        .orders-search {
          position: relative;
        }
        .orders-search input {
          padding: 9px 14px 9px 32px;
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.9rem;
          color: #fff;
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          width: 260px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .orders-search input:focus {
          border-color: rgba(255, 90, 95,0.5);
          box-shadow: 0 0 14px rgba(255, 90, 95,0.18);
        }
        .orders-search-glyph {
          position: absolute; top: 50%; left: 12px;
          transform: translateY(-50%);
          color: #ff5a5f; font-family: 'Orbitron', monospace;
          pointer-events: none;
        }
        .orders-refresh {
          padding: 9px 16px;
          font-family: 'Orbitron', sans-serif;
          font-size: 0.7rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #ff5a5f;
          background: rgba(255, 90, 95,0.07);
          border: 1px solid rgba(255, 90, 95,0.4);
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s, box-shadow 0.2s;
        }
        .orders-refresh:hover {
          background: rgba(255, 90, 95,0.15);
          box-shadow: 0 0 16px rgba(255, 90, 95,0.25);
        }
        .orders-refresh:disabled { opacity: 0.6; cursor: progress; }

        .orders-filters {
          display: flex; gap: 8px; flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .filter-chip {
          padding: 7px 14px;
          font-family: 'Orbitron', sans-serif;
          font-size: 0.66rem;
          letter-spacing: 0.18em;
          color: rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 100px;
          cursor: pointer;
          text-transform: uppercase;
          transition: all 0.18s;
          display: flex; align-items: center; gap: 8px;
        }
        .filter-chip:hover { color: #fff; border-color: rgba(255, 90, 95,0.4); }
        .filter-chip.active {
          color: #ff5a5f;
          background: rgba(255, 90, 95,0.1);
          border-color: rgba(255, 90, 95,0.5);
          box-shadow: 0 0 14px rgba(255, 90, 95,0.18);
        }
        .filter-chip-count {
          font-size: 0.6rem;
          color: rgba(255,237,78,0.85);
          background: rgba(0,0,0,0.25);
          border-radius: 100px;
          padding: 1px 6px;
        }

        .orders-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-family: 'Rajdhani', sans-serif;
        }
        .orders-table th {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.62rem;
          letter-spacing: 0.22em;
          color: rgba(255,255,255,0.35);
          text-align: left;
          padding: 10px 14px;
          text-transform: uppercase;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .orders-table td {
          padding: 12px 14px;
          font-size: 0.92rem;
          color: rgba(255,255,255,0.78);
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .orders-table tr {
          transition: background 0.15s;
        }
        .orders-table tbody tr:hover {
          background: rgba(255, 90, 95,0.04);
        }

        .order-num {
          font-family: 'Orbitron', monospace;
          font-size: 0.85rem;
          color: #ff5a5f;
        }
        .order-money {
          font-family: 'Orbitron', monospace;
          color: #ffed4e;
          font-weight: 700;
          text-shadow: 0 0 6px rgba(255,237,78,0.35);
        }
        .order-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          font-family: 'Orbitron', sans-serif;
          font-size: 0.6rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          border-radius: 100px;
          border: 1px solid;
        }
        .order-status-pill::before {
          content: '';
          width: 6px; height: 6px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 6px currentColor;
        }

        .orders-empty {
          padding: 50px 18px;
          text-align: center;
          color: rgba(255,255,255,0.4);
          font-family: 'Orbitron', sans-serif;
        }
        .orders-empty-glyph {
          font-size: 2.4rem;
          color: rgba(255, 90, 95,0.4);
          margin-bottom: 14px;
          text-shadow: 0 0 14px rgba(255, 90, 95,0.4);
        }
        .orders-empty-title {
          font-size: 0.85rem;
          letter-spacing: 0.32em;
          color: rgba(255, 90, 95,0.7);
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .orders-empty-sub {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.12em;
        }
      `}</style>

      <div className="orders-head">
        <div className="orders-title-row">
          <span className="orders-glyph">▤</span>
          <span className="orders-title">Order Manifest</span>
        </div>
        <div className="orders-actions">
          <div className="orders-search">
            <span className="orders-search-glyph">⌕</span>
            <input
              type="text"
              placeholder="Filter by #, name, or roll"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="orders-refresh" onClick={handleRefresh} disabled={refreshing} data-clickable>
            {refreshing ? '◌ Refreshing' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <div className="orders-filters">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={`filter-chip${filter === s ? ' active' : ''}`}
            onClick={() => setFilter(s)}
            data-clickable
          >
            {s === 'all' ? 'All' : s}
            <span className="filter-chip-count">{String(counts[s] ?? 0).padStart(2, '0')}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="orders-empty">
          <div className="orders-empty-glyph">◯</div>
          <div className="orders-empty-title">No orders in this slice</div>
          <div className="orders-empty-sub">
            {safeOrders.length === 0 ? 'Waiting for the first transmission' : 'Try a different filter or query'}
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const status = (o.status ?? 'pending').toLowerCase();
                const tone = STATUS_TONES[status] ?? STATUS_TONES.pending;
                const paymentStatus = ((o as any).payment_status ?? 'pending').toLowerCase();
                const paymentTone = STATUS_TONES[paymentStatus] ?? STATUS_TONES.pending;
                return (
                  <tr key={o.id}>
                    <td className="order-num">#{o.order_number}</td>
                    <td>
                      <div style={{ color: '#fff' }}>{(o as any).student_name || 'Guest'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                        {(o as any).student_roll || ''}
                      </div>
                    </td>
                    <td>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {Array.isArray(o.items) ? o.items.length : 0} items
                      </span>
                    </td>
                    <td className="order-money">₹{Math.round(Number(o.total_amount) || 0).toLocaleString('en-IN')}</td>
                    <td>
                      <span
                        className="order-status-pill"
                        style={{ color: tone.fg, background: tone.bg, borderColor: tone.border }}
                      >
                        {status}
                      </span>
                    </td>
                    <td>
                      <span
                        className="order-status-pill"
                        style={{ color: paymentTone.fg, background: paymentTone.bg, borderColor: paymentTone.border }}
                      >
                        {paymentStatus}
                      </span>
                    </td>
                    <td style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Orbitron, monospace', fontSize: '0.75rem' }}>
                      {relativeTime(o.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

function relativeTime(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    if (!d) return '—';
    const diffSec = Math.floor((Date.now() - d) / 1000);
    if (diffSec < 60)        return `${diffSec}s ago`;
    if (diffSec < 3600)      return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400)     return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch {
    return '—';
  }
}

export default OrdersPanel;
