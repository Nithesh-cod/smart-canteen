import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as orderService from '../services/order.service';
import * as authService from '../services/auth.service';
import socketService from '../services/socket.service';
import type { Order } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STEPS = ['pending', 'preparing', 'ready', 'completed'] as const;

const getEstimatedTime = (status: string): string => {
  switch (status) {
    case 'pending':   return '~15 minutes';
    case 'preparing': return '~8 minutes';
    case 'ready':     return 'Ready for pickup! 🎉';
    case 'completed': return 'Order completed ✓';
    case 'cancelled': return 'Order cancelled';
    default:          return '';
  }
};

const statusLabel: Record<string, string> = {
  pending:   'ORDER PLACED',
  preparing: 'PREPARING',
  ready:     'READY FOR PICKUP',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
};

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return dateStr;
  }
};

const formatDateShort = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return dateStr;
  }
};

// ─── 4-Step Progress Tracker ──────────────────────────────────────────────────

const ProgressTracker: React.FC<{ status: string }> = ({ status }) => {
  const currentIdx = STATUS_STEPS.indexOf(status as any);
  const stepLabels = ['Placed', 'Preparing', 'Ready', 'Collected'];
  const stepIcons = ['📋', '👨‍🍳', '🍽️', '✅'];

  // Width of fill line: 0% to 100% across 3 segments
  const fillPct = currentIdx <= 0 ? 0 : (currentIdx / (STATUS_STEPS.length - 1)) * 100;

  return (
    <div className="track-progress" style={{ margin: '32px 0' }}>
      <div style={{ position: 'relative', padding: '0 20px' }}>
        {/* Background track line */}
        <div style={{
          position: 'absolute', top: 17,
          left: 'calc(20px + 17px)', right: 'calc(20px + 17px)',
          height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 3,
        }} />
        {/* Animated fill line */}
        <div style={{
          position: 'absolute', top: 17,
          left: 'calc(20px + 17px)',
          width: `calc((100% - 40px - 34px) * ${fillPct / 100})`,
          height: 3,
          background: 'linear-gradient(90deg, #ff5a5f, #ff9e3d)',
          borderRadius: 3,
          transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: '0 0 10px rgba(255, 90, 95,0.6)',
        }} />

        {/* Step dots */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', zIndex: 1 }}>
          {STATUS_STEPS.map((step, idx) => {
            const isDone = currentIdx > idx;
            const isCurrent = currentIdx === idx;
            const isFuture = currentIdx < idx;
            return (
              <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                {/* Dot */}
                <div style={{ position: 'relative' }}>
                  {isCurrent && (
                    <div style={{
                      position: 'absolute', inset: -6, borderRadius: '50%',
                      background: 'rgba(255, 90, 95,0.2)',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                  )}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: isDone
                      ? 'linear-gradient(135deg, #ff5a5f, #ff5a5f)'
                      : isCurrent
                      ? 'rgba(255, 90, 95,0.2)'
                      : 'rgba(255,255,255,0.05)',
                    border: `2px solid ${isDone ? '#ff5a5f' : isCurrent ? '#ff5a5f' : 'rgba(255,255,255,0.15)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isDone ? '14px' : '0.85rem',
                    color: '#fff', fontWeight: 700,
                    boxShadow: isDone
                      ? '0 0 16px rgba(255, 90, 95,0.6)'
                      : isCurrent
                      ? '0 0 16px rgba(255, 90, 95,0.5)'
                      : 'none',
                    transition: 'all 0.5s',
                    position: 'relative', zIndex: 2,
                    opacity: isFuture ? 0.4 : 1,
                  }}>
                    {isDone ? '✓' : isCurrent ? <span style={{ fontSize: '16px' }}>{stepIcons[idx]}</span> : ''}
                  </div>
                </div>
                {/* Label */}
                <div className="track-progress-label" style={{
                  fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', fontWeight: 700,
                  color: isDone ? '#ff5a5f' : isCurrent ? '#ff5a5f' : 'rgba(255,255,255,0.25)',
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  textAlign: 'center', whiteSpace: 'nowrap',
                  transition: 'color 0.5s',
                  textShadow: isDone ? '0 0 8px rgba(255, 90, 95,0.4)' : isCurrent ? '0 0 8px rgba(255, 90, 95,0.4)' : 'none',
                }}>
                  {stepLabels[idx]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Recent Orders List ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending:   '#ffed4e',
  preparing: '#ff5a5f',
  ready:     '#ff5a5f',
  completed: '#aaaaaa',
  cancelled: '#ff3366',
};

const RecentOrdersList: React.FC<{
  recentOrders: Order[];
  onSelect: (orderNumber: string) => void;
  loadingRecent: boolean;
}> = ({ recentOrders, onSelect, loadingRecent }) => {
  if (loadingRecent) {
    return (
      <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.3)', fontFamily: 'Inter, sans-serif' }}>
        Loading recent orders...
      </div>
    );
  }
  if (recentOrders.length === 0) return null;

  return (
    <div className="track-recent-card" style={{
      position: 'relative',
      marginTop: 22,
      background:
        'linear-gradient(180deg, rgba(255, 90, 95,0.04) 0%, transparent 35%), linear-gradient(180deg, #1b0e0c 0%, #1b0e0c 100%)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 18,
      padding: 24,
      animation: 'fadeInUp 0.5s ease-out',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '6%', right: '24%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255, 90, 95,0.5), transparent)',
      }} />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
      }}>
        <span style={{
          fontFamily: 'Sora, monospace', fontSize: '0.9rem',
          color: '#ff5a5f', textShadow: '0 0 8px #ff5a5f',
        }}>◐</span>
        <span style={{
          fontFamily: 'Sora, sans-serif', fontSize: '0.7rem', fontWeight: 700,
          color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.32em',
        }}>
          Recent Transmissions
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {recentOrders.map(ord => {
          const statusColor = STATUS_COLORS[ord.status] || '#aaa';
          return (
            <button
              key={ord.id}
              onClick={() => onSelect(ord.order_number)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid rgba(255,255,255,0.08)`,
                borderLeft: `3px solid ${statusColor}`,
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${statusColor}66`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
              }}
            >
              <div>
                <div style={{
                  fontFamily: 'Sora, sans-serif', fontSize: '0.85rem', fontWeight: 700,
                  color: '#fff', letterSpacing: 0.5, marginBottom: 3,
                }}>
                  {ord.order_number}
                </div>
                <div style={{
                  fontFamily: 'Inter, sans-serif', fontSize: '0.75rem',
                  color: 'rgba(255,255,255,0.35)',
                }}>
                  {formatDateShort(ord.created_at)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontFamily: 'Sora, sans-serif', fontSize: '0.8rem', fontWeight: 700,
                  color: '#ffed4e',
                }}>
                  ₹{Number(ord.total_amount).toLocaleString('en-IN')}
                </span>
                <span style={{
                  background: `${statusColor}22`,
                  border: `1px solid ${statusColor}55`,
                  color: statusColor,
                  borderRadius: 20,
                  padding: '3px 10px',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}>
                  {statusLabel[ord.status] || ord.status}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── OrderTracking Page ───────────────────────────────────────────────────────

const OrderTracking: React.FC = () => {
  const { orderNumber: paramOrderNumber } = useParams<{ orderNumber?: string }>();

  const [orderNumber, setOrderNumber] = useState(paramOrderNumber || '');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Recent orders (last 5 from the student's perspective - we'll fetch from API)
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Load recent orders on mount
  useEffect(() => {
    // Public page: skip the authenticated /api/orders call entirely when no
    // token is stored — otherwise the 401 fires window 'auth:unauthorized'
    // for every drive-by visitor (FIX L3).
    if (!authService.getStoredToken()) return;

    const loadRecent = async () => {
      setLoadingRecent(true);
      try {
        const res = await orderService.getAll({ limit: 5 });
        const list: Order[] = Array.isArray(res)
          ? res
          : Array.isArray((res as any)?.data?.orders)
            ? (res as any).data.orders
            : Array.isArray((res as any)?.data)
              ? (res as any).data
              : [];
        setRecentOrders(list.slice(0, 5));
      } catch {
        // Silently ignore - user may not be authenticated
      } finally {
        setLoadingRecent(false);
      }
    };
    loadRecent();
  }, []);

  const handleTrack = useCallback(async (num?: string) => {
    const trackNum = (num ?? orderNumber).trim();
    if (!trackNum) {
      setError('Please enter an order number');
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    setOrder(null);
    try {
      const res = await orderService.track(trackNum);
      // Backend returns { success, data: order } — axios wraps in response.data
      // so res = { success, data: order }. Support legacy { data: { order } } shape too.
      const data = (res as any).data?.id
        ? (res as any).data
        : (res as any).data?.order ?? (res as any).data?.data?.order ?? null;
      if (!data || !data.id) {
        setNotFound(true);
      } else {
        setOrder(data);
        setOrderNumber(trackNum);
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(err?.response?.data?.message || 'Failed to fetch order. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  const handleRefresh = useCallback(async () => {
    if (!order) return;
    try {
      const res = await orderService.track(order.order_number);
      const data = (res as any).data?.id
        ? (res as any).data
        : (res as any).data?.order ?? (res as any).data?.data?.order ?? null;
      if (data?.id) setOrder(data);
    } catch {
      // silent
    }
  }, [order]);

  const handleBackToList = useCallback(() => {
    setOrder(null);
    setOrderNumber('');
    setError(null);
    setNotFound(false);
  }, []);

  // Auto-track from URL param
  useEffect(() => {
    if (paramOrderNumber) handleTrack(paramOrderNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramOrderNumber]);

  // Socket: real-time status update via the per-order room (FIX M4 + M3).
  // Backend emits 'order:status-change' to both `student:<id>` (logged-in)
  // and `order:<id>` (everyone subscribed via order:join), so this page —
  // which is public — joins the per-order room and listens for it.
  useEffect(() => {
    if (!order) return;
    socketService.connect();
    socketService.joinOrderRoom(order.id);

    // Status / paid / refunded transitions are all driven through a full
    // re-fetch of the order (FIX T7). Patching only `status` would drop
    // payment_status changes that arrived via the webhook path, leaving
    // the user stuck on "Payment Pending" until the 30s poll.
    const statusHandler = (data: any) => {
      const matches = data.orderId === order.id || data.order_number === order.order_number;
      if (matches) handleRefresh();
    };
    const cancelledHandler = (data: any) => {
      const matches = data.orderId === order.id || data.order_number === order.order_number;
      if (matches) {
        setOrder(prev => prev ? { ...prev, status: 'cancelled' } : prev);
      }
    };
    const refundedHandler = (data: any) => {
      const matches = data.orderId === order.id || data.order_number === order.order_number;
      if (matches) {
        setOrder(prev => prev ? { ...prev, payment_status: 'refunded' } : prev);
      }
    };
    // Webhook-only completion: the verify callback never ran (browser closed
    // mid-redirect on mobile), but payment.captured still landed and the
    // backend ran the full finalisePayment pipeline. A re-fetch picks up
    // the new payment_status + status without waiting for the 30s poll.
    const paidHandler = (data: any) => {
      const matches = data.orderId === order.id || data.order_number === order.order_number;
      if (matches) handleRefresh();
    };
    socketService.on('order:status-change', statusHandler);
    socketService.on('order:cancelled', cancelledHandler);
    socketService.on('payment:refunded', refundedHandler);
    socketService.on('payment:confirmed', paidHandler);
    return () => {
      socketService.off('order:status-change', statusHandler);
      socketService.off('order:cancelled', cancelledHandler);
      socketService.off('payment:refunded', refundedHandler);
      socketService.off('payment:confirmed', paidHandler);
    };
  }, [order?.id, order?.order_number, handleRefresh]);

  // Auto-refresh every 30s for active orders
  useEffect(() => {
    if (!order || ['completed', 'cancelled'].includes(order.status)) return;
    const interval = setInterval(() => handleRefresh(), 30000);
    return () => clearInterval(interval);
  }, [order?.status, handleRefresh]);

  const isCancelled = order?.status === 'cancelled';
  const isCompleted = order?.status === 'completed';

  return (
    <>
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.4);opacity:.2} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glowPulse {
          0%,100% { box-shadow: 0 0 20px rgba(255, 90, 95,0.3); }
          50%      { box-shadow: 0 0 40px rgba(255, 90, 95,0.6), 0 0 60px rgba(255, 158, 61,0.2); }
        }
        .cyber-grid {
          background-image: linear-gradient(rgba(255, 90, 95,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 90, 95,0.03) 1px, transparent 1px);
          background-size: 50px 50px;
        }
        .track-input::placeholder { color: rgba(255,255,255,0.3); }
        .track-input:focus { outline: none; border-color: #ff5a5f !important; box-shadow: 0 0 0 3px rgba(255, 90, 95,0.15) !important; }
      `}</style>

      {/* NOTE: do NOT use className="cyber-grid" here — that CSS class sets
           pointer-events:none which blocks all input interaction on this page */}
      <div className="track-outer" style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #140a09 0%, #241512 50%, #1b0e0c 100%)',
        backgroundImage: 'linear-gradient(rgba(255, 90, 95,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 90, 95,0.03) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 20px 80px',
      }}>
        <div style={{ width: '100%', maxWidth: 650 }}>

          {/* Main Search Card — crystal language matching kiosk/owner/chef */}
          <div className="track-card" style={{
            position: 'relative',
            background:
              'linear-gradient(180deg, rgba(255, 90, 95,0.04) 0%, transparent 35%), linear-gradient(180deg, #1b0e0c 0%, #1b0e0c 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 18,
            padding: '34px 36px 28px',
            animation: 'glowPulse 5s ease-in-out infinite',
            overflow: 'hidden',
          }}>
            {/* Top-edge HUD highlight — same crystal language as every other card */}
            <div style={{
              position: 'absolute', top: 0, left: '6%', right: '24%', height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(255, 90, 95,0.5), transparent)',
            }} />

            {/* Brand brackets row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 6 }}>
              <span style={{
                fontFamily: 'Sora, monospace', fontSize: '1rem',
                color: '#ff5a5f', textShadow: '0 0 10px #ff5a5f',
              }}>◈</span>
              <div className="track-logo" style={{
                fontFamily: 'Sora, sans-serif',
                fontSize: 'clamp(1.3rem, 4.5vw, 2.1rem)',
                fontWeight: 900,
                background: 'linear-gradient(180deg, #ffffff 0%, #ff5a5f 70%, #ff9e3d 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                letterSpacing: '0.16em', whiteSpace: 'nowrap', lineHeight: 1,
                textShadow: '0 0 28px rgba(255, 90, 95,0.18)',
              }}>
                SMART CANTEEN
              </div>
              <span style={{
                fontFamily: 'Sora, monospace', fontSize: '1rem',
                color: '#ff5a5f', textShadow: '0 0 10px #ff5a5f',
              }}>◈</span>
            </div>
            <div style={{
              textAlign: 'center', color: 'rgba(255, 90, 95,0.65)',
              fontFamily: 'Sora, sans-serif', fontSize: '0.7rem',
              letterSpacing: '0.42em', textTransform: 'uppercase', marginBottom: 28,
            }}>
              · Order Tracking ·
            </div>

            {/* Query field + Track CTA — HUD glyph search like CategoryChannels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', top: '50%', left: 18, transform: 'translateY(-50%)',
                  fontFamily: 'Sora, monospace', fontSize: '1rem',
                  color: '#ff5a5f', textShadow: '0 0 8px #ff5a5f', pointerEvents: 'none',
                }}>⌕</span>
                <input
                  type="text"
                  className="track-input"
                  placeholder="ENTER ORDER NUMBER  ·  e.g. OZ12345"
                  value={orderNumber}
                  onChange={e => { setOrderNumber(e.target.value); setError(null); setNotFound(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleTrack(); }}
                  style={{
                    background: 'rgba(0,0,0,0.32)',
                    border: '1px solid rgba(255, 90, 95,0.18)',
                    borderRadius: 12,
                    padding: '15px 18px 15px 46px',
                    color: '#fff',
                    fontFamily: 'Sora, monospace',
                    fontSize: '0.95rem',
                    letterSpacing: '0.14em',
                    width: '100%',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    textAlign: 'left',
                    outline: 'none',
                  }}
                />
              </div>
              <button
                onClick={() => handleTrack()}
                disabled={loading}
                data-clickable
                style={{
                  background: loading
                    ? 'rgba(255, 90, 95,0.08)'
                    : 'linear-gradient(90deg, rgba(255, 90, 95,0.1), rgba(255, 90, 95,0.25), rgba(255, 90, 95,0.1))',
                  backgroundSize: '200% 100%',
                  border: '1px solid rgba(255, 90, 95,0.5)',
                  borderRadius: 10,
                  padding: '15px 0',
                  color: '#ff5a5f',
                  fontFamily: 'Sora, sans-serif',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.32em',
                  textTransform: 'uppercase',
                  transition: 'background-position 0.6s, box-shadow 0.25s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                  opacity: loading ? 0.7 : 1,
                  textShadow: '0 0 10px rgba(255, 90, 95,0.55)',
                }}
                onMouseEnter={e => {
                  if (!loading) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundPosition = '100% 0';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 22px rgba(255, 90, 95,0.35)';
                  }
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundPosition = '0 0';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                }}
              >
                {loading ? (
                  <>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%',
                      border: '2px solid rgba(255, 90, 95,0.25)', borderTop: '2px solid #ff5a5f',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    Scanning…
                  </>
                ) : (
                  <>◎ Trace Order</>
                )}
              </button>
            </div>

            {/* Error / Not Found */}
            {(error || notFound) && (
              <div style={{
                marginTop: 18, padding: '12px 16px',
                background: 'rgba(255,51,102,0.08)',
                border: '1px solid rgba(255,51,102,0.4)',
                borderRadius: 10, color: '#ff3366',
                fontFamily: 'Sora, monospace', fontSize: '0.78rem',
                letterSpacing: '0.12em', textAlign: 'center',
              }}>
                {notFound
                  ? `⚠ No order matches "${orderNumber}". Recheck the digits.`
                  : `⚠ ${error}`}
              </div>
            )}
          </div>

          {/* Order Details Card — crystal language */}
          {order && (
            <div className="track-detail-card" style={{
              position: 'relative',
              marginTop: 22,
              background:
                'linear-gradient(180deg, rgba(255, 90, 95,0.04) 0%, transparent 35%), linear-gradient(180deg, #1b0e0c 0%, #1b0e0c 100%)',
              border: `1px solid ${isCancelled ? 'rgba(255,51,102,0.35)' : 'rgba(255, 90, 95,0.22)'}`,
              borderRadius: 18,
              padding: '28px 32px 30px', animation: 'fadeInUp 0.5s ease-out',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: '5%', right: '24%', height: 1,
                background: `linear-gradient(90deg, transparent, ${isCancelled ? 'rgba(255,51,102,0.55)' : 'rgba(255, 90, 95,0.55)'}, transparent)`,
              }} />
              {/* Back + Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={handleBackToList}
                    style={{
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 12px',
                      fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.8rem',
                      cursor: 'pointer', transition: 'all 0.2s', letterSpacing: 1,
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#fff'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'}
                  >
                    ← Back
                  </button>
                  <div>
                    <div style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', fontWeight: 900, color: '#ff5a5f', letterSpacing: 1 }}>
                      {order.order_number}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)', fontFamily: 'Inter, sans-serif', marginTop: 3 }}>
                      {formatDate(order.created_at)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleRefresh}
                  style={{
                    background: 'rgba(255, 90, 95,0.08)', border: '1px solid rgba(255, 90, 95,0.25)',
                    color: '#ff5a5f', borderRadius: 10, padding: '7px 14px',
                    fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.8rem',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 90, 95,0.16)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 90, 95,0.08)')}
                >
                  🔄 Refresh
                </button>
              </div>

              {/* Cancelled State */}
              {isCancelled ? (
                <div style={{
                  margin: '24px 0', padding: '24px',
                  background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.3)',
                  borderRadius: 16, textAlign: 'center',
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: 10 }}>❌</div>
                  <div style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: '#ff3366', marginBottom: 6 }}>Order Cancelled</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter, sans-serif', fontSize: '0.9rem' }}>
                    This order has been cancelled. Contact the canteen for assistance.
                  </div>
                </div>
              ) : (
                <>
                  {/* 4-step Progress Tracker */}
                  <ProgressTracker status={order.status} />

                  {/* Status Display */}
                  <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div className="track-status-label" style={{
                      fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 900,
                      color: isCompleted ? '#ff5a5f' : '#ff5a5f', letterSpacing: 2, marginBottom: 8,
                      textShadow: isCompleted ? '0 0 20px rgba(255, 90, 95,0.5)' : '0 0 20px rgba(255, 90, 95,0.5)',
                    }}>
                      {statusLabel[order.status] || order.status.toUpperCase()}
                    </div>
                    <div style={{ color: isCompleted ? '#ff5a5f' : 'rgba(255,255,255,0.55)', fontFamily: 'Inter, sans-serif', fontSize: '1rem', fontWeight: 600 }}>
                      {getEstimatedTime(order.status)}
                    </div>
                    {/* Auto-refresh indicator */}
                    {!isCompleted && !isCancelled && (
                      <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.2)', fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', letterSpacing: 1 }}>
                        Auto-refreshing every 30s
                      </div>
                    )}
                  </div>
                </>
              )}

              <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '20px 0' }} />

              {/* Order Items */}
              {order.items && order.items.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontFamily: 'Sora, sans-serif', fontSize: '0.75rem', fontWeight: 700,
                    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12,
                  }}>ORDER ITEMS</div>
                  <div style={{
                    background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 14, padding: '14px 18px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {order.items.map((item, idx) => (
                      <div key={idx} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontFamily: 'Inter, sans-serif', fontSize: '0.95rem',
                        borderBottom: idx < order.items!.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        paddingBottom: idx < order.items!.length - 1 ? 10 : 0,
                      }}>
                        <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
                          • {item.quantity}× {item.item_name}
                        </span>
                        <span style={{ color: '#ffed4e', fontWeight: 700 }}>
                          ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total + Payment */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 20px',
                background: 'rgba(255,237,78,0.05)', border: '1px solid rgba(255,237,78,0.2)',
                borderRadius: 14, flexWrap: 'wrap', gap: 12,
              }}>
                <div style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 900, color: '#ffed4e' }}>
                  Total: ₹{Number(order.total_amount).toLocaleString('en-IN')}
                </div>
                <div>
                  {order.payment_status === 'paid' ? (
                    <span style={{
                      background: 'rgba(255, 90, 95,0.15)', border: '1px solid rgba(255, 90, 95,0.4)',
                      color: '#ff5a5f', borderRadius: 20, padding: '6px 16px',
                      fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.88rem',
                    }}>✅ Paid</span>
                  ) : (
                    <span style={{
                      background: 'rgba(255,237,78,0.12)', border: '1px solid rgba(255,237,78,0.3)',
                      color: '#ffed4e', borderRadius: 20, padding: '6px 16px',
                      fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.88rem',
                    }}>⏳ Payment Pending</span>
                  )}
                </div>
              </div>

              {/* Student Info */}
              {(order.student_name || order.student_roll) && (
                <div style={{
                  marginTop: 14, fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)',
                  fontFamily: 'Inter, sans-serif', display: 'flex', gap: 16, flexWrap: 'wrap',
                }}>
                  {order.student_name && <span>👤 {order.student_name}</span>}
                  {order.student_roll && <span>🎓 {order.student_roll}</span>}
                </div>
              )}
            </div>
          )}

          {/* Recent Orders List (shown when no order is selected) */}
          {!order && !loading && (
            <RecentOrdersList
              recentOrders={recentOrders}
              onSelect={num => { setOrderNumber(num); handleTrack(num); }}
              loadingRecent={loadingRecent}
            />
          )}

          {/* Footer hint */}
          {!order && !loading && recentOrders.length === 0 && (
            <div style={{
              textAlign: 'center', marginTop: 30,
              color: 'rgba(255,255,255,0.2)', fontFamily: 'Inter, sans-serif',
              fontSize: '0.82rem', letterSpacing: 0.5,
            }}>
              Real-time order tracking powered by Smart Canteen
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrderTracking;
